import dayjs from 'dayjs';
import { InboxScheduledJobsService } from '../services/inbox-scheduled-jobs.service.js';

// Mock the database connection
const mockDb = {
  selectDistinct: jest.fn(),
  select: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../db/connection', () => ({
  getDatabase: jest.fn(() => mockDb),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('InboxScheduledJobsService', () => {
  let service: InboxScheduledJobsService;

  beforeEach(() => {
    service = new InboxScheduledJobsService();
    jest.clearAllMocks();
  });

  describe('runWeeklySummaryAggregation', () => {
    it('should aggregate weekly summaries for all users', async () => {
      // Mock distinct users from inbox
      const fromFn = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ uid: 'user1' }, { uid: 'user2' }]),
      });

      mockDb.selectDistinct.mockReturnValue({
        from: fromFn,
      });

      // Mock recent reports for each user
      const whereFn = jest.fn().mockReturnValue({
        orderBy: jest.fn().mockResolvedValue([
          {
            inboxReportId: 'ir1',
            uid: 'user1',
            date: '2026-03-10',
            summary: JSON.stringify({
              topics: ['work', 'health'],
              actions: ['exercise', 'review code'],
            }),
          },
          {
            inboxReportId: 'ir2',
            uid: 'user1',
            date: '2026-03-11',
            summary: JSON.stringify({
              topics: ['work'],
              actions: ['meeting'],
            }),
          },
        ]),
      });

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: whereFn,
        }),
      });

      const result = await service.runWeeklySummaryAggregation();

      expect(result.processedUsers).toBe(2);
      expect(mockDb.selectDistinct).toHaveBeenCalledTimes(2); // inbox and inboxReport
    });

    it('should handle users with no reports gracefully', async () => {
      const fromFn = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ uid: 'user1' }]),
      });

      mockDb.selectDistinct.mockReturnValue({
        from: fromFn,
      });

      // Mock empty reports
      const whereFn = jest.fn().mockReturnValue({
        orderBy: jest.fn().mockResolvedValue([]),
      });

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: whereFn,
        }),
      });

      const result = await service.runWeeklySummaryAggregation();

      expect(result.processedUsers).toBe(1);
    });

    it('should continue processing other users if one fails', async () => {
      const fromFn = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ uid: 'user1' }, { uid: 'user2' }]),
      });

      mockDb.selectDistinct.mockReturnValue({
        from: fromFn,
      });

      // First user fails, second succeeds
      let callCount = 0;
      const whereFn = jest.fn().mockImplementation(() => ({
        orderBy: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Database error');
          }
          return Promise.resolve([]);
        }),
      }));

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: whereFn,
        }),
      });

      const result = await service.runWeeklySummaryAggregation();

      // Should process second user even though first failed
      expect(result.processedUsers).toBe(1);
    });

    it('should handle invalid JSON in report summaries', async () => {
      const fromFn = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ uid: 'user1' }]),
      });

      mockDb.selectDistinct.mockReturnValue({
        from: fromFn,
      });

      // Mock report with invalid JSON
      const whereFn = jest.fn().mockReturnValue({
        orderBy: jest.fn().mockResolvedValue([
          {
            inboxReportId: 'ir1',
            uid: 'user1',
            date: '2026-03-10',
            summary: 'invalid json',
          },
        ]),
      });

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: whereFn,
        }),
      });

      const result = await service.runWeeklySummaryAggregation();

      expect(result.processedUsers).toBe(1);
    });
  });

  describe('runCleanupDeletedRecords', () => {
    it('should delete old soft-deleted records from all tables', async () => {
      const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();

      // Mock delete operations
      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue({ rowsAffected: 5 }),
      });

      const result = await service.runCleanupDeletedRecords();

      expect(result.deletedInboxCount).toBe(5);
      expect(result.deletedReportCount).toBe(5);
      expect(result.deletedTokenCount).toBe(5);
      expect(mockDb.delete).toHaveBeenCalledTimes(3); // inbox, inboxReport, apiToken
    });

    it('should handle zero deleted records', async () => {
      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue({ rowsAffected: 0 }),
      });

      const result = await service.runCleanupDeletedRecords();

      expect(result.deletedInboxCount).toBe(0);
      expect(result.deletedReportCount).toBe(0);
      expect(result.deletedTokenCount).toBe(0);
    });

    it('should handle missing rowsAffected', async () => {
      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue({}),
      });

      const result = await service.runCleanupDeletedRecords();

      expect(result.deletedInboxCount).toBe(0);
      expect(result.deletedReportCount).toBe(0);
      expect(result.deletedTokenCount).toBe(0);
    });

    it('should throw error on database failure', async () => {
      mockDb.delete.mockReturnValue({
        where: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      await expect(service.runCleanupDeletedRecords()).rejects.toThrow('Database error');
    });
  });
});
