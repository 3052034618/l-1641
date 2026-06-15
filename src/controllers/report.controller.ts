import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { reportService } from '../services/report.service';
import { distributionService } from '../services/distribution.service';
import { successResponse, paginatedResponse } from '../utils/response';
import { GenerateReportDto, ExportReportDto } from '../dtos/report.dto';

export class ReportController {
  async generateReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.body as GenerateReportDto;
      const result = await reportService.generateDailyReport(dto);
      return successResponse(res, result, 'Report generated successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getReportById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await reportService.getReportById(id);
      return successResponse(res, result, 'Report retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getReports(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const zone = req.query.zone as string | undefined;
      const departmentId = req.query.departmentId as string | undefined;

      const result = await reportService.getReports(page, pageSize, {
        startDate,
        endDate,
        zone,
        departmentId,
      });

      return paginatedResponse(res, result.reports, page, pageSize, result.total);
    } catch (error) {
      next(error);
    }
  }

  async exportReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dto = req.query as unknown as ExportReportDto;
      const buffer = await reportService.exportReport(dto);

      const filename = `运营报表_${new Date().toISOString().split('T')[0]}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  async getStats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await reportService.getReportStats();
      return successResponse(res, result, 'Report stats retrieved');
    } catch (error) {
      next(error);
    }
  }

  async checkExpiredPackages(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await distributionService.checkAndLockExpiredPackages();
      return successResponse(res, result, `Processed ${result.totalProcessed} expired packages`);
    } catch (error) {
      next(error);
    }
  }
}

export const reportController = new ReportController();
