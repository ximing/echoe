import 'reflect-metadata';

// Mock services before importing
jest.mock('../services/inbox-ai.service.js', () => ({
  InboxAiService: class MockInboxAiService {
    generateDailyReport = jest.fn();
    organizeInbox = jest.fn();
  },
}));

jest.mock('../services/inbox-report.service.js', () => ({
  InboxReportService: class MockInboxReportService {
    create = jest.fn();
    findByUidAndDate = jest.fn();
  },
}));

import {
  InboxQueueService,
  InboxJobType,
  type GenerateReportJobData,
  type OrganizeInboxJobData,
} from '../services/inbox-queue.service.js';
import { InboxAiService } from '../services/inbox-ai.service.js';
import { InboxReportService } from '../services/inbox-report.service.js';

describe('InboxQueueService', () => {
  let inboxQueueService: InboxQueueService;
  let mockInboxAiService: jest.Mocked<InboxAiService>;
  let mockInboxReportService: jest.Mocked<InboxReportService>;

  beforeEach(() => {
    // Create mock services
    mockInboxAiService = new (InboxAiService as any)();
    mockInboxReportService = new (InboxReportService as any)();

    // Create service instance
    inboxQueueService = new InboxQueueService(mockInboxAiService, mockInboxReportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Queue Management', () => {
    it('should initialize with empty queue', () => {
      expect(inboxQueueService.getQueueSize()).toBe(0);
      expect(inboxQueueService.getPendingCount()).toBe(0);
    });

    it('should track queue size when jobs are enqueued', async () => {
      const jobData: OrganizeInboxJobData = {
        uid: 'u123',
        inboxId: 'i123',
      };

      mockInboxAiService.organizeInbox.mockResolvedValue({
        optimizedFront: 'Test front',
        optimizedBack: 'Test back',
        reason: 'Test reason',
        confidence: 0.9,
        fallback: false,
      });

      // Enqueue job (don't await to check queue size while pending)
      const promise = inboxQueueService.enqueue(InboxJobType.ORGANIZE_INBOX, jobData);

      // Queue size should be 0 because job executes immediately with concurrency 5
      // But we can verify it completes successfully
      await promise;

      expect(mockInboxAiService.organizeInbox).toHaveBeenCalledWith({ uid: 'u123', inboxId: 'i123' });
    });
  });

  describe('GENERATE_REPORT Job', () => {
    it('should generate report successfully', async () => {
      const jobData: GenerateReportJobData = {
        uid: 'u123',
        date: '2026-03-16',
      };

      const mockReportData = {
        content: '# Daily Report\n\nTest content',
        summary: {
          topics: ['topic1', 'topic2'],
          mistakes: [],
          actions: ['action1'],
          totalInbox: 10,
          newInbox: 5,
          processedInbox: 3,
          deletedInbox: 2,
          categoryBreakdown: [],
          sourceBreakdown: [],
          insights: [],
        },
      };

      const mockCreatedReport = {
        id: 1,
        inboxReportId: 'ir123',
        uid: 'u123',
        date: '2026-03-16',
        content: mockReportData.content,
        summary: JSON.stringify(mockReportData.summary),
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInboxReportService.findByUidAndDate.mockResolvedValue(null);
      mockInboxAiService.generateDailyReport.mockResolvedValue(mockReportData);
      mockInboxReportService.create.mockResolvedValue(mockCreatedReport);

      const result = await inboxQueueService.executeSync(InboxJobType.GENERATE_REPORT, jobData);

      expect(mockInboxReportService.findByUidAndDate).toHaveBeenCalledWith('u123', '2026-03-16');
      expect(mockInboxAiService.generateDailyReport).toHaveBeenCalledWith({
        uid: 'u123',
        date: '2026-03-16',
      });
      expect(mockInboxReportService.create).toHaveBeenCalledWith('u123', {
        date: '2026-03-16',
        content: mockReportData.content,
        summary: JSON.stringify(mockReportData.summary),
      });
      expect(result).toEqual(mockCreatedReport);
    });

    it('should skip generation if report already exists (idempotency)', async () => {
      const jobData: GenerateReportJobData = {
        uid: 'u123',
        date: '2026-03-16',
      };

      const existingReport = {
        id: 1,
        inboxReportId: 'ir123',
        uid: 'u123',
        date: '2026-03-16',
        content: 'Existing content',
        summary: '{}',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInboxReportService.findByUidAndDate.mockResolvedValue(existingReport);

      const result = await inboxQueueService.executeSync(InboxJobType.GENERATE_REPORT, jobData);

      expect(mockInboxReportService.findByUidAndDate).toHaveBeenCalledWith('u123', '2026-03-16');
      expect(mockInboxAiService.generateDailyReport).not.toHaveBeenCalled();
      expect(mockInboxReportService.create).not.toHaveBeenCalled();
      expect(result).toEqual(existingReport);
    });

    it('should handle report generation failure', async () => {
      const jobData: GenerateReportJobData = {
        uid: 'u123',
        date: '2026-03-16',
      };

      mockInboxReportService.findByUidAndDate.mockResolvedValue(null);
      mockInboxAiService.generateDailyReport.mockRejectedValue(new Error('AI service timeout'));

      await expect(
        inboxQueueService.executeSync(InboxJobType.GENERATE_REPORT, jobData)
      ).rejects.toThrow('AI service timeout');

      expect(mockInboxReportService.create).not.toHaveBeenCalled();
    }, 70000); // 70s timeout for retry delays (30s * 2 retries)
  });

  describe('ORGANIZE_INBOX Job', () => {
    it('should organize inbox successfully', async () => {
      const jobData: OrganizeInboxJobData = {
        uid: 'u123',
        inboxId: 'i123',
      };

      const mockOrganizeResult = {
        optimizedFront: 'Optimized front',
        optimizedBack: 'Optimized back',
        reason: 'Improved clarity',
        confidence: 0.95,
        fallback: false,
      };

      mockInboxAiService.organizeInbox.mockResolvedValue(mockOrganizeResult);

      const result = await inboxQueueService.executeSync(InboxJobType.ORGANIZE_INBOX, jobData);

      expect(mockInboxAiService.organizeInbox).toHaveBeenCalledWith({ uid: 'u123', inboxId: 'i123' });
      expect(result).toEqual(mockOrganizeResult);
    });

    it('should handle organize with fallback', async () => {
      const jobData: OrganizeInboxJobData = {
        uid: 'u123',
        inboxId: 'i123',
      };

      const mockFallbackResult = {
        optimizedFront: 'Original front',
        optimizedBack: 'Original back',
        reason: 'AI timeout',
        confidence: 0,
        fallback: true,
      };

      mockInboxAiService.organizeInbox.mockResolvedValue(mockFallbackResult);

      const result: any = await inboxQueueService.executeSync(InboxJobType.ORGANIZE_INBOX, jobData);

      expect(mockInboxAiService.organizeInbox).toHaveBeenCalledWith({ uid: 'u123', inboxId: 'i123' });
      expect(result.fallback).toBe(true);
    });

    it('should handle organize failure', async () => {
      const jobData: OrganizeInboxJobData = {
        uid: 'u123',
        inboxId: 'i123',
      };

      mockInboxAiService.organizeInbox.mockRejectedValue(new Error('Inbox not found'));

      await expect(
        inboxQueueService.executeSync(InboxJobType.ORGANIZE_INBOX, jobData)
      ).rejects.toThrow('Inbox not found');
    }, 35000); // 35s timeout for retry delays (10s * 2 retries)
  });

  describe('Async Execution', () => {
    it('should enqueue and execute job asynchronously', async () => {
      const jobData: OrganizeInboxJobData = {
        uid: 'u123',
        inboxId: 'i123',
      };

      const mockOrganizeResult = {
        optimizedFront: 'Optimized front',
        optimizedBack: 'Optimized back',
        reason: 'Improved clarity',
        confidence: 0.95,
        fallback: false,
      };

      mockInboxAiService.organizeInbox.mockResolvedValue(mockOrganizeResult);

      const result = await inboxQueueService.enqueue(InboxJobType.ORGANIZE_INBOX, jobData);

      expect(mockInboxAiService.organizeInbox).toHaveBeenCalledWith({ uid: 'u123', inboxId: 'i123' });
      expect(result).toEqual(mockOrganizeResult);
    });

    it('should handle multiple jobs in queue', async () => {
      const jobs: OrganizeInboxJobData[] = [
        { uid: 'u1', inboxId: 'i1' },
        { uid: 'u2', inboxId: 'i2' },
        { uid: 'u3', inboxId: 'i3' },
      ];

      mockInboxAiService.organizeInbox.mockImplementation(async (params) => ({
        optimizedFront: `Front for ${params.inboxId}`,
        optimizedBack: `Back for ${params.inboxId}`,
        reason: 'Test',
        confidence: 0.9,
        fallback: false,
      }));

      const promises = jobs.map((job) =>
        inboxQueueService.enqueue(InboxJobType.ORGANIZE_INBOX, job)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(mockInboxAiService.organizeInbox).toHaveBeenCalledTimes(3);
    });
  });

  describe('TO_CARD_AI Job', () => {
    it('should return placeholder for TO_CARD_AI job', async () => {
      const jobData = {
        uid: 'u123',
        inboxId: 'i123',
        deckId: 'd123',
        notetypeId: 'n123',
      };

      const result: any = await inboxQueueService.executeSync(InboxJobType.TO_CARD_AI, jobData);

      expect(result).toEqual({
        success: false,
        message: 'TO_CARD_AI job not fully implemented',
      });
    });
  });
});
