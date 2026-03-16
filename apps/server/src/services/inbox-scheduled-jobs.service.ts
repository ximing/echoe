import { Service } from 'typedi';
import { lt, isNotNull, and, eq, gte, lte } from 'drizzle-orm';
import dayjs from 'dayjs';

import { getDatabase } from '../db/connection.js';
import { inbox } from '../db/schema/inbox.js';
import { inboxReport } from '../db/schema/inbox-report.js';
import { apiToken } from '../db/schema/api-token.js';
import { logger } from '../utils/logger.js';

@Service()
export class InboxScheduledJobsService {
  /**
   * Weekly summary aggregation job
   * Runs every Sunday at 2 AM
   * Aggregates inbox and report data for AI memory context
   */
  async runWeeklySummaryAggregation(): Promise<{ processedUsers: number }> {
    try {
      const db = getDatabase();
      const startTime = Date.now();

      // Get all unique users who have inbox items or reports
      const inboxUsers = await db
        .selectDistinct({ uid: inbox.uid })
        .from(inbox)
        .where(isNotNull(inbox.uid));

      const reportUsers = await db
        .selectDistinct({ uid: inboxReport.uid })
        .from(inboxReport)
        .where(isNotNull(inboxReport.uid));

      // Merge and deduplicate user IDs
      const allUserIds = new Set<string>();
      inboxUsers.forEach((u: { uid: string }) => allUserIds.add(u.uid));
      reportUsers.forEach((u: { uid: string }) => allUserIds.add(u.uid));

      let processedUsers = 0;

      // Process each user's weekly summary
      for (const uid of allUserIds) {
        try {
          await this.aggregateWeeklySummaryForUser(uid);
          processedUsers++;
        } catch (error) {
          logger.error('Failed to aggregate weekly summary for user', {
            event: 'weekly_summary_aggregation_user_failed',
            uid,
            error,
          });
          // Continue processing other users even if one fails
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Weekly summary aggregation completed', {
        event: 'weekly_summary_aggregation_completed',
        processedUsers,
        totalUsers: allUserIds.size,
        durationMs: duration,
      });

      return { processedUsers };
    } catch (error) {
      logger.error('Weekly summary aggregation job failed', {
        event: 'weekly_summary_aggregation_failed',
        error,
      });
      throw error;
    }
  }

  /**
   * Aggregate weekly summary for a single user
   * This creates context for AI memory retrieval
   */
  private async aggregateWeeklySummaryForUser(uid: string): Promise<void> {
    const db = getDatabase();

    // Get last 7 days of reports for this user
    const sevenDaysAgo = dayjs().subtract(7, 'days').format('YYYY-MM-DD');
    const today = dayjs().format('YYYY-MM-DD');

    const recentReports = await db
      .select()
      .from(inboxReport)
      .where(
        and(
          eq(inboxReport.uid, uid),
          gte(inboxReport.date, sevenDaysAgo),
          lte(inboxReport.date, today),
          isNotNull(inboxReport.summary)
        )
      )
      .orderBy(inboxReport.date);

    // Parse summaries and aggregate topics/actions
    const aggregatedTopics = new Set<string>();
    const aggregatedActions = new Set<string>();

    for (const report of recentReports) {
      try {
        if (report.summary) {
          const summary = JSON.parse(report.summary);
          if (summary.topics && Array.isArray(summary.topics)) {
            summary.topics.forEach((topic: string) => aggregatedTopics.add(topic));
          }
          if (summary.actions && Array.isArray(summary.actions)) {
            summary.actions.forEach((action: string) => aggregatedActions.add(action));
          }
        }
      } catch (error) {
        logger.error('Failed to parse report summary', {
          event: 'weekly_summary_parse_failed',
          uid,
          reportId: report.inboxReportId,
          error,
        });
      }
    }

    logger.info('Weekly summary aggregated for user', {
      event: 'weekly_summary_user_aggregated',
      uid,
      reportsCount: recentReports.length,
      topicsCount: aggregatedTopics.size,
      actionsCount: aggregatedActions.size,
    });
  }

  /**
   * Cleanup deleted records job
   * Runs daily at 3 AM
   * Permanently deletes soft-deleted records older than 30 days
   */
  async runCleanupDeletedRecords(): Promise<{
    deletedInboxCount: number;
    deletedReportCount: number;
    deletedTokenCount: number;
  }> {
    try {
      const db = getDatabase();
      const startTime = Date.now();

      // Calculate cutoff date (30 days ago)
      const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();

      // Delete old soft-deleted inbox items
      const deletedInboxResult = await db
        .delete(inbox)
        .where(and(isNotNull(inbox.deletedAt), lt(inbox.deletedAt, thirtyDaysAgo)));

      // Delete old soft-deleted inbox reports
      const deletedReportResult = await db
        .delete(inboxReport)
        .where(and(isNotNull(inboxReport.deletedAt), lt(inboxReport.deletedAt, thirtyDaysAgo)));

      // Delete old soft-deleted API tokens
      const deletedTokenResult = await db
        .delete(apiToken)
        .where(and(isNotNull(apiToken.deletedAt), lt(apiToken.deletedAt, thirtyDaysAgo)));

      const duration = Date.now() - startTime;

      logger.info('Cleanup deleted records completed', {
        event: 'cleanup_deleted_records_completed',
        deletedInboxCount: deletedInboxResult.rowsAffected ?? 0,
        deletedReportCount: deletedReportResult.rowsAffected ?? 0,
        deletedTokenCount: deletedTokenResult.rowsAffected ?? 0,
        cutoffDate: thirtyDaysAgo.toISOString(),
        durationMs: duration,
      });

      return {
        deletedInboxCount: deletedInboxResult.rowsAffected ?? 0,
        deletedReportCount: deletedReportResult.rowsAffected ?? 0,
        deletedTokenCount: deletedTokenResult.rowsAffected ?? 0,
      };
    } catch (error) {
      logger.error('Cleanup deleted records job failed', {
        event: 'cleanup_deleted_records_failed',
        error,
      });
      throw error;
    }
  }
}
