import {
  JsonController,
  Get,
  Post,
  QueryParam,
  Param,
  CurrentUser,
  Body,
  HttpCode,
} from 'routing-controllers';
import { Service } from 'typedi';

import { InboxReportService } from '../../services/inbox-report.service.js';
import { InboxAiService } from '../../services/inbox-ai.service.js';
import { ResponseUtil } from '../../utils/response.js';
import { ErrorCode } from '../../constants/error-codes.js';
import { logger } from '../../utils/logger.js';

import type { UserInfoDto } from '@echoe/dto';
import type {
  InboxReportDto,
  InboxReportListItemDto,
  InboxReportQueryParams,
} from '@echoe/dto';

interface GenerateReportBody {
  date: string; // YYYY-MM-DD format
  timezone?: string; // User timezone (e.g., 'Asia/Shanghai')
}

@Service()
@JsonController('/api/v1/inbox/reports')
export class InboxReportController {
  constructor(
    private inboxReportService: InboxReportService,
    private inboxAiService: InboxAiService
  ) {}

  /**
   * GET /api/v1/inbox/reports
   * List inbox reports for authenticated user
   */
  @Get('')
  async listReports(
    @CurrentUser() user: UserInfoDto | undefined,
    @QueryParam('date') date?: string,
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
    @QueryParam('page') page?: number,
    @QueryParam('limit') limit?: number,
    @QueryParam('sortBy') sortBy?: 'date' | 'createdAt',
    @QueryParam('order') order?: 'asc' | 'desc'
  ) {
    if (!user) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED, 'User not authenticated');
    }

    try {
      const result = await this.inboxReportService.list(user.uid, {
        date,
        startDate,
        endDate,
        page: page ?? 1,
        pageSize: limit ?? 20,
        sortBy,
        order,
      });

      // Map to list item DTOs (exclude full content)
      const items: InboxReportListItemDto[] = result.items.map((report) => ({
        inboxReportId: report.inboxReportId,
        date: report.date,
        summary: report.summary,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      }));

      return ResponseUtil.success({
        items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      });
    } catch (error) {
      logger.error('Error listing inbox reports:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR, 'Failed to list inbox reports');
    }
  }

  /**
   * GET /api/v1/inbox/reports/:reportId
   * Get a single inbox report by ID
   */
  @Get('/:reportId')
  async getReport(
    @CurrentUser() user: UserInfoDto | undefined,
    @Param('reportId') reportId: string
  ) {
    if (!user) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED, 'User not authenticated');
    }

    if (!reportId || !reportId.trim()) {
      return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'Report ID is required');
    }

    try {
      const report = await this.inboxReportService.findByIdAndUid(user.uid, reportId.trim());

      if (!report) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND, 'Inbox report not found');
      }

      const reportDto: InboxReportDto = {
        inboxReportId: report.inboxReportId,
        uid: report.uid,
        date: report.date,
        content: report.content,
        summary: report.summary,
        deletedAt: report.deletedAt,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      };

      return ResponseUtil.success(reportDto);
    } catch (error) {
      logger.error('Error getting inbox report:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR, 'Failed to get inbox report');
    }
  }

  /**
   * POST /api/v1/inbox/reports/generate
   * Generate a daily inbox report for the given date
   * Returns 409 if report already exists for this uid+date
   */
  @Post('/generate')
  @HttpCode(201)
  async generateReport(
    @CurrentUser() user: UserInfoDto | undefined,
    @Body() body: GenerateReportBody
  ) {
    if (!user) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED, 'User not authenticated');
    }

    if (!body.date || !body.date.trim()) {
      return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'Date is required (YYYY-MM-DD format)');
    }

    const date = body.date.trim();

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return ResponseUtil.error(
        ErrorCode.PARAMS_ERROR,
        'Invalid date format. Expected YYYY-MM-DD'
      );
    }

    try {
      // Generate AI report with 30-day memory and evidence
      const reportData = await this.inboxAiService.generateDailyReport({
        uid: user.uid,
        date,
      });

      const report = await this.inboxReportService.create(user.uid, {
        date,
        content: reportData.content,
        summary: JSON.stringify(reportData.summary),
      });

      const reportDto: InboxReportDto = {
        inboxReportId: report.inboxReportId,
        uid: report.uid,
        date: report.date,
        content: report.content,
        summary: report.summary,
        deletedAt: report.deletedAt,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      };

      return ResponseUtil.success(reportDto);
    } catch (error) {
      if (error instanceof Error && error.message === 'REPORT_ALREADY_EXISTS') {
        // Return 409 Conflict with existing report reference
        const existingReport = await this.inboxReportService.findByUidAndDate(user.uid, date);

        return {
          code: ErrorCode.CONFLICT,
          msg: 'Report already exists for this date',
          data: existingReport
            ? {
                inboxReportId: existingReport.inboxReportId,
                date: existingReport.date,
              }
            : null,
        };
      }

      logger.error('Error generating inbox report:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR, 'Failed to generate inbox report');
    }
  }
}
