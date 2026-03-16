import type {
  InboxReportDto,
  InboxReportListItemDto,
  ApiResponseDto,
} from '@echoe/dto';
import request from '../utils/request';

/**
 * Inbox report list response with pagination
 */
export interface InboxReportListResponse {
  items: InboxReportListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get inbox reports with pagination and filters
 */
export const getInboxReports = (params?: {
  page?: number;
  limit?: number;
  date?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: 'date' | 'createdAt';
  order?: 'asc' | 'desc';
}) => {
  return request.get<unknown, ApiResponseDto<InboxReportListResponse>>('/api/v1/inbox/reports', {
    params,
  });
};

/**
 * Get a single inbox report by ID
 */
export const getInboxReport = (reportId: string) => {
  return request.get<unknown, ApiResponseDto<InboxReportDto>>(
    `/api/v1/inbox/reports/${reportId}`
  );
};

/**
 * Generate daily inbox report
 * Handles 409 conflict when report already exists for the date
 */
export const generateInboxReport = async (date: string, async?: boolean) => {
  try {
    const params = async ? { async: 'true' } : undefined;
    return await request.post<{ date: string }, ApiResponseDto<InboxReportDto>>(
      '/api/v1/inbox/reports/generate',
      { date },
      { params }
    );
  } catch (error: any) {
    // Handle 409 conflict - report already exists
    if (error?.response?.status === 409) {
      const existingReport = error?.response?.data;
      throw {
        status: 409,
        message: 'Report already exists for this date',
        existingReport,
      };
    }
    // Handle 503 AI service unavailable
    if (error?.response?.status === 503) {
      throw new Error('AI service is temporarily unavailable. Please try again later.');
    }
    throw error;
  }
};
