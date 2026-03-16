import { Service } from '@rabjs/react';
import type {
  InboxReportDto,
  InboxReportListItemDto,
  InboxReportQueryParams,
} from '@echoe/dto';
import * as inboxReportApi from '../api/inbox-report.js';
import { toast } from './toast.service.js';

interface InboxReportListState {
  items: InboxReportListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class InboxReportService extends Service {
  list: InboxReportListState = {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  };

  currentReport: InboxReportDto | null = null;
  isLoading = false;
  isGenerating = false;
  error: string | null = null;

  async loadReports(params?: InboxReportQueryParams) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await inboxReportApi.getInboxReports({
        page: params?.page ?? this.list.page,
        limit: params?.limit ?? this.list.limit,
        date: params?.date,
        startDate: params?.startDate,
        endDate: params?.endDate,
        sortBy: params?.sortBy ?? 'date',
        order: params?.order ?? 'desc',
      });
      if (response.data) {
        this.list = response.data;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load reports';
      toast.error(this.error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadReport(reportId: string) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await inboxReportApi.getInboxReport(reportId);
      if (response.data) {
        this.currentReport = response.data;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load report';
      toast.error(this.error);
      this.currentReport = null;
    } finally {
      this.isLoading = false;
    }
  }

  async generateReport(date: string) {
    this.isGenerating = true;
    this.error = null;
    try {
      const response = await inboxReportApi.generateInboxReport(date);
      if (response.data) {
        toast.success('日报生成成功');
        await this.loadReports();
        return response.data;
      }
    } catch (err: unknown) {
      // Handle 409 conflict (report already exists)
      const error = err as { response?: { status?: number; data?: { data?: unknown } } };
      if (error.response?.status === 409) {
        const existingReport = error.response?.data?.data;
        if (existingReport) {
          toast.warning(`${date} 的日报已存在`);
          await this.loadReports();
          return existingReport;
        }
      }
      const message = err instanceof Error ? err.message : 'Failed to generate report';
      toast.error(message);
      throw err;
    } finally {
      this.isGenerating = false;
    }
  }

  setPage(page: number) {
    this.list.page = page;
    this.loadReports();
  }

  clearCurrentReport() {
    this.currentReport = null;
  }
}
