import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as moment from 'moment';
import {
  OperationReport,
  Department,
  InstrumentPackage,
  SterilizationBatch,
  SterilizationRecord,
  Equipment,
  WorkOrder,
  DistributionRecord,
  RecoveryRecord,
  CleaningTask,
} from '../entities';
import { AppDataSource } from '../data-source';
import {
  GenerateReportDto,
  ExportReportDto,
  DepartmentStats,
  SterilizationStats,
  EquipmentStats,
  DailyReportData,
} from '../dtos/report.dto';
import { PackageStatus, WorkOrderStatus } from '../enums';
import { NotFoundError } from '../errors/CustomError';
import { notificationService } from './notification.service';
import logger from '../config/logger';

export class ReportService {
  private reportRepository: Repository<OperationReport>;
  private departmentRepository: Repository<Department>;
  private packageRepository: Repository<InstrumentPackage>;
  private batchRepository: Repository<SterilizationBatch>;
  private recordRepository: Repository<SterilizationRecord>;
  private equipmentRepository: Repository<Equipment>;
  private workOrderRepository: Repository<WorkOrder>;
  private distributionRepository: Repository<DistributionRecord>;
  private recoveryRepository: Repository<RecoveryRecord>;
  private cleaningRepository: Repository<CleaningTask>;

  constructor() {
    this.reportRepository = AppDataSource.getRepository(OperationReport);
    this.departmentRepository = AppDataSource.getRepository(Department);
    this.packageRepository = AppDataSource.getRepository(InstrumentPackage);
    this.batchRepository = AppDataSource.getRepository(SterilizationBatch);
    this.recordRepository = AppDataSource.getRepository(SterilizationRecord);
    this.equipmentRepository = AppDataSource.getRepository(Equipment);
    this.workOrderRepository = AppDataSource.getRepository(WorkOrder);
    this.distributionRepository = AppDataSource.getRepository(DistributionRecord);
    this.recoveryRepository = AppDataSource.getRepository(RecoveryRecord);
    this.cleaningRepository = AppDataSource.getRepository(CleaningTask);
  }

  async generateDailyReport(dto?: GenerateReportDto): Promise<OperationReport> {
    const today = new Date();
    const startDate = dto?.startDate
      ? new Date(dto.startDate)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endDate = dto?.endDate
      ? new Date(dto.endDate)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const reportData = await this.calculateReportData(startDate, endDate, dto?.zone, dto?.departmentId);

    const report = this.reportRepository.create({
      reportDate: startDate,
      startDate,
      endDate,
      zone: dto?.zone || null,
      departmentId: dto?.departmentId || null,
      departmentStats: reportData.departmentStats,
      sterilizationStats: reportData.sterilizationStats,
      equipmentStats: reportData.equipmentStats,
      summaryStats: reportData.summary,
      generatedAt: new Date(),
    });

    await this.reportRepository.save(report);

    await notificationService.notifyReportGenerated(
      report.id,
      startDate.toISOString().split('T')[0],
      reportData.summary.totalPackagesProcessed
    );

    logger.info(`Daily report generated for ${startDate.toISOString().split('T')[0]}`);

    return report;
  }

  private async calculateReportData(
    startDate: Date,
    endDate: Date,
    zone?: string,
    departmentId?: string
  ): Promise<DailyReportData> {
    const departmentStats = await this.calculateDepartmentStats(startDate, endDate, zone, departmentId);
    const sterilizationStats = await this.calculateSterilizationStats(startDate, endDate);
    const equipmentStats = await this.calculateEquipmentStats(startDate, endDate);

    const totalPackagesProcessed = departmentStats.reduce((sum, d) => sum + d.totalPackages, 0);
    const totalRecycled = departmentStats.reduce((sum, d) => sum + d.recycledCount, 0);
    const totalSterilized = departmentStats.reduce((sum, d) => sum + d.sterilizedCount, 0);
    const totalDistributed = departmentStats.reduce((sum, d) => sum + d.distributedCount, 0);
    const avgTurnoverRate = totalPackagesProcessed > 0
      ? departmentStats.reduce((sum, d) => sum + d.turnoverRate, 0) / departmentStats.length
      : 0;

    return {
      reportDate: startDate.toISOString().split('T')[0],
      generatedAt: new Date().toISOString(),
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      departmentStats,
      sterilizationStats,
      equipmentStats,
      summary: {
        totalPackagesProcessed,
        totalRecycled,
        totalSterilized,
        totalDistributed,
        avgTurnoverRate,
        overallSterilizationPassRate: sterilizationStats.passRate,
        overallEquipmentFailureRate: equipmentStats.length > 0
          ? equipmentStats.reduce((sum, e) => sum + e.failureRate, 0) / equipmentStats.length
          : 0,
      },
    };
  }

  private async calculateDepartmentStats(
    startDate: Date,
    endDate: Date,
    zone?: string,
    departmentId?: string
  ): Promise<DepartmentStats[]> {
    let departments = await this.departmentRepository.find();

    if (zone) {
      departments = departments.filter((d) => d.zone === zone);
    }

    if (departmentId) {
      departments = departments.filter((d) => d.id === departmentId);
    }

    const stats: DepartmentStats[] = [];

    for (const dept of departments) {
      const dateFilter = {
        createdAt: Between(startDate, endDate),
      };

      const [allPackages] = await this.packageRepository.findAndCount({
        where: { departmentId: dept.id },
      });

      const recycledResult = await this.recoveryRepository.findAndCount({
        where: { departmentId: dept.id, ...dateFilter },
      });

      const cleanedResult = await this.cleaningRepository.findAndCount({
        where: { ...dateFilter },
      });

      const sterilizedResult = await this.batchRepository.findAndCount({
        where: { status: 'completed', ...dateFilter },
      });

      const distributedResult = await this.distributionRepository.findAndCount({
        where: { toDepartmentId: dept.id, ...dateFilter },
      });

      const rejectedResult = await this.recoveryRepository.findAndCount({
        where: { departmentId: dept.id, ...dateFilter },
      });

      const usedPackages = allPackages.filter((p) => p.status === PackageStatus.USED || p.status === PackageStatus.DISTRIBUTED);
      const turnoverRate = allPackages.length > 0
        ? (usedPackages.length / allPackages.length) * 100
        : 0;

      const turnaroundTimes: number[] = [];
      for (const pkg of usedPackages) {
        if (pkg.receivedAt && pkg.sterilizedAt) {
          const turnaround = (pkg.sterilizedAt.getTime() - pkg.receivedAt.getTime()) / (1000 * 60 * 60);
          turnaroundTimes.push(turnaround);
        }
      }

      const avgTurnaroundTime = turnaroundTimes.length > 0
        ? turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length
        : 0;

      stats.push({
        departmentId: dept.id,
        departmentName: dept.name,
        departmentCode: dept.code,
        zone: dept.zone || '',
        totalPackages: allPackages.length,
        recycledCount: recycledResult[1],
        cleanedCount: cleanedResult[1],
        sterilizedCount: sterilizedResult[1],
        distributedCount: distributedResult[1],
        turnoverRate: parseFloat(turnoverRate.toFixed(2)),
        avgTurnaroundTime: parseFloat(avgTurnaroundTime.toFixed(2)),
        rejectedCount: rejectedResult[1],
        rejectionRate: recycledResult[1] > 0
          ? parseFloat(((rejectedResult[1] / recycledResult[1]) * 100).toFixed(2))
          : 0,
      });
    }

    return stats;
  }

  private async calculateSterilizationStats(
    startDate: Date,
    endDate: Date
  ): Promise<SterilizationStats> {
    const dateFilter = {
      createdAt: Between(startDate, endDate),
    };

    const batches = await this.batchRepository.find({
      where: { status: 'completed', ...dateFilter },
      relations: ['records', 'equipment'],
    });

    const passedBatches = batches.filter((b) => b.finalResult?.isPassed);
    const failedBatches = batches.filter((b) => b.finalResult?.isPassed === false);
    const lockedBatches = batches.filter((b) => b.isLocked);

    const cycleTimes = batches
      .filter((b) => b.startedAt && b.completedAt)
      .map((b) => (b.completedAt!.getTime() - b.startedAt!.getTime()) / (1000 * 60 * 60));

    const allRecords = await this.recordRepository.find({
      where: { createdAt: Between(startDate, endDate) },
    });

    const anomalyCount = allRecords.filter((r) => r.hasAnomaly).length;

    const temperatures = allRecords.map((r) => r.temperature).filter((t) => t > 0);
    const pressures = allRecords.map((r) => r.pressure).filter((p) => p > 0);

    return {
      totalBatches: batches.length,
      passedBatches: passedBatches.length,
      failedBatches: failedBatches.length,
      passRate: batches.length > 0
        ? parseFloat(((passedBatches.length / batches.length) * 100).toFixed(2))
        : 100,
      avgCycleTime: cycleTimes.length > 0
        ? parseFloat((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length).toFixed(2))
        : 0,
      anomalyCount,
      lockedBatches: lockedBatches.length,
      averageTemperature: temperatures.length > 0
        ? parseFloat((temperatures.reduce((a, b) => a + b, 0) / temperatures.length).toFixed(2))
        : 0,
      averagePressure: pressures.length > 0
        ? parseFloat((pressures.reduce((a, b) => a + b, 0) / pressures.length).toFixed(2))
        : 0,
    };
  }

  private async calculateEquipmentStats(
    startDate: Date,
    endDate: Date
  ): Promise<EquipmentStats[]> {
    const equipments = await this.equipmentRepository.find();
    const stats: EquipmentStats[] = [];

    for (const equipment of equipments) {
      const dateFilter = {
        createdAt: Between(startDate, endDate),
      };

      const runsResult = await this.batchRepository.findAndCount({
        where: { equipmentId: equipment.id, status: 'completed', ...dateFilter },
      });

      const workOrdersResult = await this.workOrderRepository.findAndCount({
        where: { equipmentId: equipment.id, ...dateFilter },
      });

      const failureCount = workOrdersResult[0].filter((w) => w.status === WorkOrderStatus.COMPLETED).length;

      const completedOrders = workOrdersResult[0].filter((w) => w.status === WorkOrderStatus.COMPLETED);
      const maintenanceTimes: number[] = [];
      for (const order of completedOrders) {
        if (order.createdAt && order.completedAt) {
          maintenanceTimes.push((order.completedAt.getTime() - order.createdAt.getTime()) / (1000 * 60 * 60));
        }
      }

      const totalRunTime = runsResult[1] * (equipment.thresholds?.cycleTime || 60);
      const totalTime = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      const uptime = totalTime > 0 ? parseFloat(((totalRunTime / totalTime) * 100).toFixed(2)) : 0;

      stats.push({
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        equipmentCode: equipment.code,
        equipmentType: equipment.type,
        totalRuns: runsResult[1],
        failureCount,
        failureRate: runsResult[1] > 0
          ? parseFloat(((failureCount / runsResult[1]) * 100).toFixed(2))
          : 0,
        avgRunTime: parseFloat((totalRunTime / (runsResult[1] || 1)).toFixed(2)),
        maintenanceCount: completedOrders.length,
        avgMaintenanceTime: maintenanceTimes.length > 0
          ? parseFloat((maintenanceTimes.reduce((a, b) => a + b, 0) / maintenanceTimes.length).toFixed(2))
          : 0,
        uptime,
      });
    }

    return stats;
  }

  async getReportById(id: string) {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: ['department'],
    });

    if (!report) {
      throw new NotFoundError('Report not found');
    }

    return report;
  }

  async getReports(page: number = 1, pageSize: number = 20, filters?: {
    startDate?: string;
    endDate?: string;
    zone?: string;
    departmentId?: string;
  }) {
    const queryBuilder = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.department', 'department');

    if (filters?.startDate) {
      queryBuilder.andWhere('report.reportDate >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      queryBuilder.andWhere('report.reportDate <= :endDate', { endDate: filters.endDate });
    }

    if (filters?.zone) {
      queryBuilder.andWhere('report.zone = :zone', { zone: filters.zone });
    }

    if (filters?.departmentId) {
      queryBuilder.andWhere('report.departmentId = :departmentId', { departmentId: filters.departmentId });
    }

    const [reports, total] = await queryBuilder
      .orderBy('report.reportDate', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { reports, total };
  }

  async exportReport(dto: ExportReportDto): Promise<Buffer> {
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();

    const reportData = await this.calculateReportData(
      startDate,
      endDate,
      dto.zone,
      dto.departmentId
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CSSD Trace System';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('综合统计');
    summarySheet.columns = [
      { header: '指标', key: 'metric', width: 30 },
      { header: '数值', key: 'value', width: 20 },
    ];

    summarySheet.addRow({ metric: '报告日期', value: reportData.reportDate });
    summarySheet.addRow({ metric: '统计周期', value: `${reportData.period.startDate} 至 ${reportData.period.endDate}` });
    summarySheet.addRow({ metric: '器械包处理总数', value: reportData.summary.totalPackagesProcessed });
    summarySheet.addRow({ metric: '回收总数', value: reportData.summary.totalRecycled });
    summarySheet.addRow({ metric: '灭菌总数', value: reportData.summary.totalSterilized });
    summarySheet.addRow({ metric: '发放总数', value: reportData.summary.totalDistributed });
    summarySheet.addRow({ metric: '平均周转率(%)', value: reportData.summary.avgTurnoverRate });
    summarySheet.addRow({ metric: '整体灭菌合格率(%)', value: reportData.summary.overallSterilizationPassRate });
    summarySheet.addRow({ metric: '整体设备故障率(%)', value: reportData.summary.overallEquipmentFailureRate });

    const deptSheet = workbook.addWorksheet('科室统计');
    deptSheet.columns = [
      { header: '科室名称', key: 'departmentName', width: 20 },
      { header: '科室代码', key: 'departmentCode', width: 15 },
      { header: '区域', key: 'zone', width: 15 },
      { header: '器械包总数', key: 'totalPackages', width: 12 },
      { header: '回收数', key: 'recycledCount', width: 10 },
      { header: '清洗数', key: 'cleanedCount', width: 10 },
      { header: '灭菌数', key: 'sterilizedCount', width: 10 },
      { header: '发放数', key: 'distributedCount', width: 10 },
      { header: '周转率(%)', key: 'turnoverRate', width: 12 },
      { header: '平均周转时间(h)', key: 'avgTurnaroundTime', width: 15 },
      { header: '退回数', key: 'rejectedCount', width: 10 },
      { header: '退回率(%)', key: 'rejectionRate', width: 12 },
    ];

    for (const stat of reportData.departmentStats) {
      deptSheet.addRow(stat);
    }

    const sterilizationSheet = workbook.addWorksheet('灭菌统计');
    sterilizationSheet.columns = [
      { header: '指标', key: 'metric', width: 30 },
      { header: '数值', key: 'value', width: 20 },
    ];

    sterilizationSheet.addRow({ metric: '总批次', value: reportData.sterilizationStats.totalBatches });
    sterilizationSheet.addRow({ metric: '合格批次', value: reportData.sterilizationStats.passedBatches });
    sterilizationSheet.addRow({ metric: '不合格批次', value: reportData.sterilizationStats.failedBatches });
    sterilizationSheet.addRow({ metric: '合格率(%)', value: reportData.sterilizationStats.passRate });
    sterilizationSheet.addRow({ metric: '平均灭菌周期(h)', value: reportData.sterilizationStats.avgCycleTime });
    sterilizationSheet.addRow({ metric: '异常次数', value: reportData.sterilizationStats.anomalyCount });
    sterilizationSheet.addRow({ metric: '锁定批次', value: reportData.sterilizationStats.lockedBatches });
    sterilizationSheet.addRow({ metric: '平均温度(°C)', value: reportData.sterilizationStats.averageTemperature });
    sterilizationSheet.addRow({ metric: '平均压力(kPa)', value: reportData.sterilizationStats.averagePressure });

    const equipmentSheet = workbook.addWorksheet('设备统计');
    equipmentSheet.columns = [
      { header: '设备名称', key: 'equipmentName', width: 20 },
      { header: '设备代码', key: 'equipmentCode', width: 15 },
      { header: '设备类型', key: 'equipmentType', width: 15 },
      { header: '运行次数', key: 'totalRuns', width: 12 },
      { header: '故障次数', key: 'failureCount', width: 12 },
      { header: '故障率(%)', key: 'failureRate', width: 12 },
      { header: '平均运行时间(h)', key: 'avgRunTime', width: 15 },
      { header: '维护次数', key: 'maintenanceCount', width: 12 },
      { header: '平均维护时间(h)', key: 'avgMaintenanceTime', width: 15 },
      { header: '可用率(%)', key: 'uptime', width: 12 },
    ];

    for (const stat of reportData.equipmentStats) {
      equipmentSheet.addRow(stat);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as Buffer;
  }

  async getReportStats() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const allReportsResult = await this.reportRepository.findAndCount();
    const monthReportsResult = await this.reportRepository.findAndCount({
      where: { reportDate: MoreThanOrEqual(startOfMonth) },
    });

    const recentReports = await this.reportRepository.find({
      order: { reportDate: 'DESC' },
      take: 7,
    });

    const lastReport = recentReports[0];

    return {
      totalReports: allReportsResult[1],
      monthReports: monthReportsResult[1],
      lastGenerated: lastReport
        ? {
            date: lastReport.reportDate,
            totalPackages: lastReport.summaryStats?.totalPackagesProcessed || 0,
            passRate: lastReport.sterilizationStats?.passRate || 0,
          }
        : null,
      recentReports: recentReports.map((r) => ({
        date: r.reportDate,
        totalPackages: r.summaryStats?.totalPackagesProcessed || 0,
        passRate: r.sterilizationStats?.passRate || 0,
        failureRate: r.summaryStats?.overallEquipmentFailureRate || 0,
      })),
    };
  }

  async scheduleDailyReport() {
    const cron = require('node-cron');
    cron.schedule('0 0 0 * * *', async () => {
      logger.info('Starting daily report generation...');
      try {
        await this.generateDailyReport();
        logger.info('Daily report generated successfully');
      } catch (error) {
        logger.error('Failed to generate daily report:', error);
      }
    });

    logger.info('Daily report scheduler started (runs at 00:00 daily)');
  }
}

export const reportService = new ReportService();
