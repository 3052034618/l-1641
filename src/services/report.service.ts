import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import * as ExcelJS from 'exceljs';
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
} from '../entities';
import { AppDataSource } from '../data-source';
import { GenerateReportDto, ExportReportDto } from '../dtos/report.dto';
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
  }

  generateReportCode(date: Date): string {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `RPT-${dateStr}-${random}`;
  }

  async generateDailyReport(dto?: GenerateReportDto): Promise<OperationReport> {
    const today = new Date();
    const startDate = dto?.startDate
      ? new Date(dto.startDate)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endDate = dto?.endDate
      ? new Date(dto.endDate)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    let reportData;
    try {
      reportData = await this.calculateReportData(startDate, endDate, dto?.zone, dto?.departmentId);
    } catch (e) {
      logger.warn('Error calculating report data, using empty data:', e);
      reportData = {
        departmentStats: [],
        sterilizationStats: {
          totalBatches: 0,
          passedBatches: 0,
          failedBatches: 0,
          passRate: 100,
          lockedBatches: 0,
          averageDuration: 0,
          averageTemperature: 0,
          averagePressure: 0,
          temperatureAnomalies: 0,
          pressureAnomalies: 0,
        },
        equipmentStats: [],
        summary: {
          totalPackages: 0,
          totalRecovery: 0,
          totalCleaning: 0,
          totalSterilization: 0,
          totalDistribution: 0,
          totalExpired: 0,
          totalRejected: 0,
          overallPassRate: 100,
          overallTurnoverRate: 0,
        },
      };
    }

    const reportCode = this.generateReportCode(startDate);

    const report = this.reportRepository.create({
      reportCode,
      reportDate: startDate,
      zone: dto?.zone as any || null,
      departmentStats: reportData.departmentStats,
      sterilizationStats: reportData.sterilizationStats,
      equipmentStats: reportData.equipmentStats,
      summary: reportData.summary,
      isGenerated: true,
      generatedAt: new Date(),
    });

    await this.reportRepository.save(report);

    await notificationService.notifyReportGenerated(
      report.id,
      reportCode,
      startDate
    );

    logger.info(`Daily report generated: ${reportCode}`);

    return report;
  }

  async calculateReportData(
    startDate: Date,
    endDate: Date,
    zone?: string,
    departmentId?: string
  ) {
    const departmentStats = await this.calculateDepartmentStats(startDate, endDate, zone, departmentId);
    const sterilizationStats = await this.calculateSterilizationStats(startDate, endDate);
    const equipmentStats = await this.calculateEquipmentStats(startDate, endDate);

    const totalPackages = departmentStats.reduce((sum, d) => sum + (d.totalPackages || 0), 0);
    const totalRecovery = departmentStats.reduce((sum, d) => sum + (d.recoveredPackages || 0), 0);
    const totalSterilization = departmentStats.reduce((sum, d) => sum + (d.sterilizedPackages || 0), 0);
    const totalDistribution = departmentStats.reduce((sum, d) => sum + (d.distributedPackages || 0), 0);
    const overallTurnoverRate = departmentStats.length > 0
      ? departmentStats.reduce((sum, d) => sum + (d.turnoverRate || 0), 0) / departmentStats.length
      : 0;

    let totalExpired = 0;
    try {
      totalExpired = await this.packageRepository.count({
        where: { status: PackageStatus.EXPIRED },
      });
    } catch (e) {
      logger.warn('Failed to count expired packages:', e);
    }

    let totalRejected = 0;
    try {
      totalRejected = await this.recoveryRepository.count({
        where: { isRejected: true, createdAt: Between(startDate, endDate) },
      });
    } catch (e) {
      logger.warn('Failed to count rejected records:', e);
    }

    const summary = {
      totalPackages,
      totalRecovery,
      totalCleaning: totalRecovery,
      totalSterilization,
      totalDistribution,
      totalExpired,
      totalRejected,
      overallPassRate: sterilizationStats?.passRate ?? 100,
      overallTurnoverRate: parseFloat(overallTurnoverRate.toFixed(2)) || 0,
    };

    return {
      departmentStats: departmentStats || [],
      sterilizationStats: sterilizationStats || {
        totalBatches: 0,
        passedBatches: 0,
        failedBatches: 0,
        passRate: 100,
        lockedBatches: 0,
        averageDuration: 0,
        averageTemperature: 0,
        averagePressure: 0,
        temperatureAnomalies: 0,
        pressureAnomalies: 0,
      },
      equipmentStats: equipmentStats || [],
      summary,
    };
  }

  private async calculateDepartmentStats(
    startDate: Date,
    endDate: Date,
    zone?: string,
    departmentId?: string
  ) {
    let departments = await this.departmentRepository.find({
      where: { isActive: true },
    });

    if (zone) {
      departments = departments.filter((d) => d.zone === zone);
    }

    if (departmentId) {
      departments = departments.filter((d) => d.id === departmentId);
    }

    const stats: any[] = [];

    for (const dept of departments) {
      const allPackages = await this.packageRepository.find({
        where: { departmentId: dept.id },
      });

      const deptPackageIds = allPackages.map((p) => p.id);

      const recoveredPackages = await this.recoveryRepository
        .createQueryBuilder('record')
        .leftJoin('record.instrumentPackage', 'pkg')
        .where('pkg.departmentId = :deptId', { deptId: dept.id })
        .andWhere('record.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('record.isRejected = :isRejected', { isRejected: false })
        .getCount();

      const sterilizedPackages = deptPackageIds.length > 0
        ? await this.batchRepository
            .createQueryBuilder('batch')
            .leftJoin('batch.instrumentPackage', 'pkg')
            .where('pkg.departmentId = :deptId', { deptId: dept.id })
            .andWhere('batch.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
            .andWhere('batch.status = :status', { status: 'completed' })
            .getCount()
        : 0;

      const distributedPackages = await this.distributionRepository
        .createQueryBuilder('dist')
        .leftJoin('dist.instrumentPackage', 'pkg')
        .where('pkg.departmentId = :deptId', { deptId: dept.id })
        .andWhere('dist.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
        .getCount();

      const rejectedCount = await this.recoveryRepository
        .createQueryBuilder('record')
        .leftJoin('record.instrumentPackage', 'pkg')
        .where('pkg.departmentId = :deptId', { deptId: dept.id })
        .andWhere('record.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('record.isRejected = :isRejected', { isRejected: true })
        .getCount();

      const usedPackages = allPackages.filter(
        (p) => p.status === PackageStatus.USED || p.status === PackageStatus.DISTRIBUTED
      );

      const turnoverRate = allPackages.length > 0
        ? parseFloat(((usedPackages.length / allPackages.length) * 100).toFixed(2))
        : 0;

      let avgTurnoverDays = 0;
      const turnoverDays: number[] = [];
      for (const pkg of usedPackages) {
        if (pkg.receivedAt && pkg.sterilizedAt) {
          const days = (pkg.sterilizedAt.getTime() - pkg.receivedAt.getTime()) / (1000 * 60 * 60 * 24);
          turnoverDays.push(days);
        }
      }
      if (turnoverDays.length > 0) {
        avgTurnoverDays = parseFloat(
          (turnoverDays.reduce((a, b) => a + b, 0) / turnoverDays.length).toFixed(2)
        );
      }

      stats.push({
        departmentId: dept.id,
        departmentCode: dept.code,
        departmentName: dept.name,
        zone: dept.zone || '',
        totalPackages: allPackages.length || 0,
        recoveredPackages: recoveredPackages || 0,
        sterilizedPackages: sterilizedPackages || 0,
        distributedPackages: distributedPackages || 0,
        turnoverRate: turnoverRate || 0,
        averageTurnoverDays: avgTurnoverDays || 0,
        rejectedCount: rejectedCount || 0,
      });
    }

    return stats;
  }

  private async calculateSterilizationStats(startDate: Date, endDate: Date) {
    const batches = await this.batchRepository.find({
      where: { createdAt: Between(startDate, endDate) },
      relations: ['records'],
    });

    const totalBatches = batches.length;
    const passedBatches = batches.filter((b) => b.status === 'completed').length;
    const failedBatches = batches.filter((b) => b.status === 'failed').length;
    const lockedBatches = batches.filter((b) => b.isLocked).length;

    const passRate = totalBatches > 0
      ? parseFloat(((passedBatches / totalBatches) * 100).toFixed(2))
      : 100;

    let totalDuration = 0;
    let durationCount = 0;
    let totalTemp = 0;
    let totalPressure = 0;
    let tempCount = 0;
    let pressureCount = 0;
    let tempAnomalies = 0;
    let pressureAnomalies = 0;

    for (const batch of batches) {
      if (batch.startedAt && batch.completedAt) {
        totalDuration += (batch.completedAt.getTime() - batch.startedAt.getTime()) / (1000 * 60 * 60);
        durationCount++;
      }

      if (batch.records) {
        for (const record of batch.records) {
          if (record.temperature > 0) {
            totalTemp += record.temperature;
            tempCount++;
          }
          if (record.pressure > 0) {
            totalPressure += record.pressure;
            pressureCount++;
          }
          if (record.anomalies && Array.isArray(record.anomalies)) {
            tempAnomalies += record.anomalies.filter((a: any) => a.type === 'temperature').length;
            pressureAnomalies += record.anomalies.filter((a: any) => a.type === 'pressure').length;
          }
          if (record.hasAnomaly) {
            tempAnomalies++;
          }
        }
      }
    }

    const averageDuration = durationCount > 0
      ? parseFloat((totalDuration / durationCount).toFixed(2))
      : 0;

    const averageTemperature = tempCount > 0
      ? parseFloat((totalTemp / tempCount).toFixed(2))
      : 0;

    const averagePressure = pressureCount > 0
      ? parseFloat((totalPressure / pressureCount).toFixed(2))
      : 0;

    return {
      totalBatches,
      passedBatches,
      failedBatches,
      passRate,
      lockedBatches,
      averageDuration,
      averageTemperature,
      averagePressure,
      temperatureAnomalies: tempAnomalies,
      pressureAnomalies: pressureAnomalies,
    };
  }

  private async calculateEquipmentStats(startDate: Date, endDate: Date) {
    const equipments = await this.equipmentRepository.find({
      where: { isActive: true },
    });

    const stats: any[] = [];

    for (const equipment of equipments) {
      const batches = await this.batchRepository.find({
        where: { equipmentId: equipment.id, createdAt: Between(startDate, endDate) },
      });

      const totalBatches = batches.length;
      const failedBatches = batches.filter((b) => b.status === 'failed' || b.isLocked).length;
      const failureRate = totalBatches > 0
        ? parseFloat(((failedBatches / totalBatches) * 100).toFixed(2))
        : 0;

      const workOrders = await this.workOrderRepository.find({
        where: { equipmentId: equipment.id, createdAt: Between(startDate, endDate) },
      });

      const completedWorkOrders = workOrders.filter(
        (w) => w.status === WorkOrderStatus.COMPLETED
      );

      let avgMaintenanceHours = 0;
      const maintenanceHours: number[] = [];
      for (const wo of completedWorkOrders) {
        if (wo.createdAt && wo.completedAt) {
          maintenanceHours.push(
            (wo.completedAt.getTime() - wo.createdAt.getTime()) / (1000 * 60 * 60)
          );
        }
      }
      if (maintenanceHours.length > 0) {
        avgMaintenanceHours = parseFloat(
          (maintenanceHours.reduce((a, b) => a + b, 0) / maintenanceHours.length).toFixed(2)
        );
      }

      stats.push({
        equipmentId: equipment.id,
        equipmentCode: equipment.code,
        equipmentName: equipment.name,
        equipmentType: equipment.type,
        totalBatches,
        failedBatches,
        failureRate,
        workOrders: workOrders.length,
        completedWorkOrders: completedWorkOrders.length,
        avgMaintenanceHours,
      });
    }

    return stats;
  }

  async getReportById(id: string) {
    const report = await this.reportRepository.findOne({
      where: { id },
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
      .createQueryBuilder('report');

    if (filters?.startDate) {
      queryBuilder.andWhere('report.reportDate >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      queryBuilder.andWhere('report.reportDate <= :endDate', { endDate: filters.endDate });
    }

    if (filters?.zone) {
      queryBuilder.andWhere('report.zone = :zone', { zone: filters.zone });
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

    let reportData;
    try {
      reportData = await this.calculateReportData(
        startDate,
        endDate,
        dto.zone,
        dto.departmentId
      );
    } catch (e) {
      logger.warn('Error calculating report data, returning empty report:', e);
      reportData = {
        departmentStats: [],
        sterilizationStats: {
          totalBatches: 0,
          passedBatches: 0,
          failedBatches: 0,
          passRate: 100,
          lockedBatches: 0,
          averageDuration: 0,
          averageTemperature: 0,
          averagePressure: 0,
          temperatureAnomalies: 0,
          pressureAnomalies: 0,
        },
        equipmentStats: [],
        summary: {
          totalPackages: 0,
          totalRecovery: 0,
          totalCleaning: 0,
          totalSterilization: 0,
          totalDistribution: 0,
          totalExpired: 0,
          totalRejected: 0,
          overallPassRate: 100,
          overallTurnoverRate: 0,
        },
      };
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CSSD Trace System';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('综合统计');
    summarySheet.columns = [
      { header: '指标', key: 'metric', width: 30 },
      { header: '数值', key: 'value', width: 25 },
    ];

    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    summarySheet.addRow({ metric: '报告周期', value: `${startDate.toISOString().split('T')[0]} 至 ${endDate.toISOString().split('T')[0]}` });
    summarySheet.addRow({ metric: '器械包总数', value: reportData.summary.totalPackages });
    summarySheet.addRow({ metric: '回收总数', value: reportData.summary.totalRecovery });
    summarySheet.addRow({ metric: '清洗总数', value: reportData.summary.totalCleaning });
    summarySheet.addRow({ metric: '灭菌总数', value: reportData.summary.totalSterilization });
    summarySheet.addRow({ metric: '发放总数', value: reportData.summary.totalDistribution });
    summarySheet.addRow({ metric: '过期总数', value: reportData.summary.totalExpired });
    summarySheet.addRow({ metric: '退回总数', value: reportData.summary.totalRejected });
    summarySheet.addRow({ metric: '整体灭菌合格率(%)', value: reportData.summary.overallPassRate });
    summarySheet.addRow({ metric: '整体周转率(%)', value: reportData.summary.overallTurnoverRate });

    const deptSheet = workbook.addWorksheet('科室统计');
    deptSheet.columns = [
      { header: '科室名称', key: 'departmentName', width: 20 },
      { header: '科室代码', key: 'departmentCode', width: 15 },
      { header: '区域', key: 'zone', width: 15 },
      { header: '器械包总数', key: 'totalPackages', width: 12 },
      { header: '回收数', key: 'recoveredPackages', width: 10 },
      { header: '灭菌数', key: 'sterilizedPackages', width: 10 },
      { header: '发放数', key: 'distributedPackages', width: 10 },
      { header: '周转率(%)', key: 'turnoverRate', width: 12 },
      { header: '平均周转天数', key: 'averageTurnoverDays', width: 15 },
      { header: '退回数', key: 'rejectedCount', width: 10 },
    ];

    deptSheet.getRow(1).font = { bold: true };
    deptSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    for (const stat of reportData.departmentStats) {
      deptSheet.addRow(stat);
    }

    const sterilizationSheet = workbook.addWorksheet('灭菌统计');
    sterilizationSheet.columns = [
      { header: '指标', key: 'metric', width: 30 },
      { header: '数值', key: 'value', width: 25 },
    ];

    sterilizationSheet.getRow(1).font = { bold: true };
    sterilizationSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    sterilizationSheet.addRow({ metric: '总批次', value: reportData.sterilizationStats.totalBatches });
    sterilizationSheet.addRow({ metric: '合格批次', value: reportData.sterilizationStats.passedBatches });
    sterilizationSheet.addRow({ metric: '不合格批次', value: reportData.sterilizationStats.failedBatches });
    sterilizationSheet.addRow({ metric: '合格率(%)', value: reportData.sterilizationStats.passRate });
    sterilizationSheet.addRow({ metric: '锁定批次', value: reportData.sterilizationStats.lockedBatches });
    sterilizationSheet.addRow({ metric: '平均灭菌周期(h)', value: reportData.sterilizationStats.averageDuration });
    sterilizationSheet.addRow({ metric: '平均温度(°C)', value: reportData.sterilizationStats.averageTemperature });
    sterilizationSheet.addRow({ metric: '平均压力(kPa)', value: reportData.sterilizationStats.averagePressure });
    sterilizationSheet.addRow({ metric: '温度异常次数', value: reportData.sterilizationStats.temperatureAnomalies });
    sterilizationSheet.addRow({ metric: '压力异常次数', value: reportData.sterilizationStats.pressureAnomalies });

    const equipmentSheet = workbook.addWorksheet('设备统计');
    equipmentSheet.columns = [
      { header: '设备名称', key: 'equipmentName', width: 20 },
      { header: '设备代码', key: 'equipmentCode', width: 15 },
      { header: '设备类型', key: 'equipmentType', width: 15 },
      { header: '运行批次', key: 'totalBatches', width: 12 },
      { header: '故障批次', key: 'failedBatches', width: 12 },
      { header: '故障率(%)', key: 'failureRate', width: 12 },
      { header: '工单数', key: 'workOrders', width: 10 },
      { header: '完成工单', key: 'completedWorkOrders', width: 12 },
      { header: '平均维修时长(h)', key: 'avgMaintenanceHours', width: 15 },
    ];

    equipmentSheet.getRow(1).font = { bold: true };
    equipmentSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    for (const stat of reportData.equipmentStats) {
      equipmentSheet.addRow(stat);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as Buffer;
  }

  async getReportStats() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [allReports] = await this.reportRepository.findAndCount();
    const monthReports = await this.reportRepository.count({
      where: { reportDate: MoreThanOrEqual(startOfMonth) },
    });

    const recentReports = await this.reportRepository.find({
      order: { reportDate: 'DESC' },
      take: 7,
    });

    const lastReport = recentReports[0];

    return {
      totalReports: allReports.length,
      monthReports,
      lastGenerated: lastReport
        ? {
            reportCode: lastReport.reportCode,
            reportDate: lastReport.reportDate,
            totalPackages: lastReport.summary?.totalPackages || 0,
            passRate: lastReport.sterilizationStats?.passRate || 0,
          }
        : null,
      recentReports: recentReports.map((r) => ({
        id: r.id,
        reportCode: r.reportCode,
        reportDate: r.reportDate,
        totalPackages: r.summary?.totalPackages || 0,
        passRate: r.sterilizationStats?.passRate || 0,
      })),
    };
  }

  async scheduleDailyReport() {
    try {
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
    } catch (error) {
      logger.warn('Failed to start daily report scheduler:', error);
    }
  }
}

export const reportService = new ReportService();
