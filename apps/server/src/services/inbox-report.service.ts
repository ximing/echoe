import { Service } from 'typedi';
import { eq, and, desc, gte, lte } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { inboxReport } from '../db/schema/inbox-report.js';
import { generateInboxReportId } from '../utils/id.js';
import { logger } from '../utils/logger.js';

import type { InboxReport, NewInboxReport } from '../db/schema/inbox-report.js';

export interface CreateInboxReportParams {
  date: string; // YYYY-MM-DD format
  content: string;
  summary?: string;
}

export interface ListInboxReportParams {
  date?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'date' | 'createdAt';
  order?: 'asc' | 'desc';
}

export interface ListInboxReportResult {
  items: InboxReport[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Service()
export class InboxReportService {
  /**
   * Create a new inbox report
   * Throws error if report already exists for the given uid+date (409 conflict)
   */
  async create(uid: string, data: CreateInboxReportParams): Promise<InboxReport> {
    try {
      const db = getDatabase();

      // Check if report already exists for this uid+date
      const existingReport = await this.findByUidAndDate(uid, data.date);
      if (existingReport) {
        throw new Error('REPORT_ALREADY_EXISTS');
      }

      const inboxReportId = generateInboxReportId();

      const newInboxReport: NewInboxReport = {
        inboxReportId,
        uid,
        date: data.date,
        content: data.content,
        summary: data.summary ?? null,
      };

      await db.insert(inboxReport).values(newInboxReport);

      // Fetch the created inbox report
      const [createdReport] = await db
        .select()
        .from(inboxReport)
        .where(and(eq(inboxReport.inboxReportId, inboxReportId), eq(inboxReport.deletedAt, 0)));

      logger.info(`Inbox report created for user ${uid} on ${data.date}: ${inboxReportId}`);

      return createdReport;
    } catch (error) {
      if (error instanceof Error && error.message === 'REPORT_ALREADY_EXISTS') {
        throw error;
      }
      logger.error('Error creating inbox report:', error);
      throw error;
    }
  }

  /**
   * List inbox reports for a user with pagination and filters
   */
  async list(uid: string, params: ListInboxReportParams = {}): Promise<ListInboxReportResult> {
    try {
      const db = getDatabase();

      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? 20;
      const offset = (page - 1) * pageSize;
      const sortBy = params.sortBy ?? 'date';
      const order = params.order ?? 'desc';

      // Build where conditions based on filters
      const conditions: any[] = [eq(inboxReport.uid, uid), eq(inboxReport.deletedAt, 0)];

      if (params.date) {
        conditions.push(eq(inboxReport.date, params.date));
      }

      if (params.startDate) {
        conditions.push(gte(inboxReport.date, params.startDate));
      }

      if (params.endDate) {
        conditions.push(lte(inboxReport.date, params.endDate));
      }

      // Get total count
      const countResult = await db
        .select({ count: inboxReport.inboxReportId })
        .from(inboxReport)
        .where(and(...conditions));

      const total = countResult.length;

      // Determine sort column
      const sortColumn = sortBy === 'createdAt' ? inboxReport.createdAt : inboxReport.date;

      // Get paginated items
      const items = await db
        .select()
        .from(inboxReport)
        .where(and(...conditions))
        .orderBy(order === 'asc' ? sortColumn : desc(sortColumn))
        .limit(pageSize)
        .offset(offset);

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } catch (error) {
      logger.error('Error listing inbox reports:', error);
      throw error;
    }
  }

  /**
   * Find an inbox report by ID and UID
   */
  async findByIdAndUid(uid: string, inboxReportId: string): Promise<InboxReport | null> {
    try {
      const db = getDatabase();

      const results = await db
        .select()
        .from(inboxReport)
        .where(
          and(
            eq(inboxReport.uid, uid),
            eq(inboxReport.inboxReportId, inboxReportId),
            eq(inboxReport.deletedAt, 0)
          )
        )
        .limit(1);

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      logger.error('Error finding inbox report:', error);
      throw error;
    }
  }

  /**
   * Find an inbox report by UID and date
   */
  async findByUidAndDate(uid: string, date: string): Promise<InboxReport | null> {
    try {
      const db = getDatabase();

      const results = await db
        .select()
        .from(inboxReport)
        .where(
          and(eq(inboxReport.uid, uid), eq(inboxReport.date, date), eq(inboxReport.deletedAt, 0))
        )
        .limit(1);

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      logger.error('Error finding inbox report by date:', error);
      throw error;
    }
  }
}
