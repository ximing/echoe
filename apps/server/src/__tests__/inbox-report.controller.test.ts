import 'reflect-metadata';

import { ErrorCode } from '../constants/error-codes.js';
import { InboxReportController } from '../controllers/v1/inbox-report.controller.js';

// Mock the InboxReportService
jest.mock('../services/inbox-report.service.js', () => ({
  InboxReportService: class MockInboxReportService {
    create = jest.fn();
    list = jest.fn();
    findByIdAndUid = jest.fn();
    findByUidAndDate = jest.fn();
  },
}));

// Mock the InboxAiService
jest.mock('../services/inbox-ai.service.js', () => ({
  InboxAiService: class MockInboxAiService {
    generateDailyReport = jest.fn();
  },
}));

// Mock the InboxQueueService
jest.mock('../services/inbox-queue.service.js', () => ({
  InboxQueueService: class MockInboxQueueService {
    enqueue = jest.fn();
    executeSync = jest.fn();
    getQueueSize = jest.fn();
    getPendingCount = jest.fn();
  },
}));

// Import after mock
import { InboxReportService } from '../services/inbox-report.service.js';
import { InboxAiService } from '../services/inbox-ai.service.js';
import { InboxQueueService } from '../services/inbox-queue.service.js';

describe('InboxReportController', () => {
  let controller: InboxReportController;
  let mockInboxReportService: jest.Mocked<InboxReportService>;
  let mockInboxAiService: jest.Mocked<InboxAiService>;
  let mockInboxQueueService: jest.Mocked<InboxQueueService>;

  // Mock user data
  const mockUser = {
    uid: 'test-user-uid',
    email: 'test@example.com',
    nickname: 'Test User',
  };

  // Mock inbox report data
  const mockReports = [
    {
      id: 1,
      inboxReportId: 'ir1234567890',
      uid: 'test-user-uid',
      date: '2026-03-16',
      content: '# Daily Report - 2026-03-16\n\nReport content',
      summary: '{"totalInbox": 5, "insights": []}',
      deletedAt: 0,
      createdAt: new Date('2026-03-16'),
      updatedAt: new Date('2026-03-16'),
    },
    {
      id: 2,
      inboxReportId: 'ir0987654321',
      uid: 'test-user-uid',
      date: '2026-03-15',
      content: '# Daily Report - 2026-03-15\n\nReport content',
      summary: '{"totalInbox": 3, "insights": []}',
      deletedAt: 0,
      createdAt: new Date('2026-03-15'),
      updatedAt: new Date('2026-03-15'),
    },
  ];

  beforeEach(() => {
    // Create mock services
    mockInboxReportService = {
      create: jest.fn(),
      list: jest.fn(),
      findByIdAndUid: jest.fn(),
      findByUidAndDate: jest.fn(),
    } as unknown as jest.Mocked<InboxReportService>;

    mockInboxAiService = {
      generateDailyReport: jest.fn(),
    } as unknown as jest.Mocked<InboxAiService>;

    mockInboxQueueService = {
      enqueue: jest.fn(),
      executeSync: jest.fn(),
      getQueueSize: jest.fn(),
      getPendingCount: jest.fn(),
    } as unknown as jest.Mocked<InboxQueueService>;

    const mockMetricsService = {
      trackReportGenerateStart: jest.fn(),
      trackReportGenerateSuccess: jest.fn(),
      trackReportGenerateConflict: jest.fn(),
      trackReportGenerateError: jest.fn(),
    } as any;

    // Create controller with mock services
    controller = new InboxReportController(
      mockInboxReportService,
      mockInboxAiService,
      mockInboxQueueService,
      mockMetricsService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/inbox/reports', () => {
    it('should list inbox reports for authenticated user', async () => {
      // Setup mock
      const listResult = {
        items: mockReports,
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };
      mockInboxReportService.list.mockResolvedValue(listResult);

      // Call controller
      const result = await controller.listReports(
        mockUser,
        undefined, // date
        undefined, // startDate
        undefined, // endDate
        1, // page
        20 // limit
      );

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.items).toHaveLength(2);
      expect(result.data!.total).toBe(2);
      expect(mockInboxReportService.list).toHaveBeenCalledWith(mockUser.uid, {
        date: undefined,
        startDate: undefined,
        endDate: undefined,
        page: 1,
        pageSize: 20,
        sortBy: undefined,
        order: undefined,
      });
    });

    it('should filter reports by date', async () => {
      // Setup mock
      mockInboxReportService.list.mockResolvedValue({
        items: [mockReports[0]],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      // Call controller
      const result = await controller.listReports(
        mockUser,
        '2026-03-16', // date
        undefined,
        undefined,
        1,
        20
      );

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(mockInboxReportService.list).toHaveBeenCalledWith(mockUser.uid, {
        date: '2026-03-16',
        startDate: undefined,
        endDate: undefined,
        page: 1,
        pageSize: 20,
        sortBy: undefined,
        order: undefined,
      });
    });

    it('should filter reports by date range', async () => {
      // Setup mock
      mockInboxReportService.list.mockResolvedValue({
        items: mockReports,
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      // Call controller
      const result = await controller.listReports(
        mockUser,
        undefined,
        '2026-03-15', // startDate
        '2026-03-16', // endDate
        1,
        20
      );

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(mockInboxReportService.list).toHaveBeenCalledWith(mockUser.uid, {
        date: undefined,
        startDate: '2026-03-15',
        endDate: '2026-03-16',
        page: 1,
        pageSize: 20,
        sortBy: undefined,
        order: undefined,
      });
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.listReports(
        undefined, // user
        undefined,
        undefined,
        undefined,
        1,
        20
      );

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(mockInboxReportService.list).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      mockInboxReportService.list.mockRejectedValue(new Error('Database error'));

      const result = await controller.listReports(mockUser, undefined, undefined, undefined, 1, 20);

      expect(result.code).toBe(ErrorCode.DB_ERROR);
    });
  });

  describe('GET /api/v1/inbox/reports/:reportId', () => {
    it('should get a single report by ID', async () => {
      // Setup mock
      mockInboxReportService.findByIdAndUid.mockResolvedValue(mockReports[0]);

      // Call controller
      const result = await controller.getReport(mockUser, 'ir1234567890');

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.inboxReportId).toBe('ir1234567890');
      expect(result.data!.content).toBe('# Daily Report - 2026-03-16\n\nReport content');
      expect(mockInboxReportService.findByIdAndUid).toHaveBeenCalledWith(
        mockUser.uid,
        'ir1234567890'
      );
    });

    it('should return not found when report does not exist', async () => {
      mockInboxReportService.findByIdAndUid.mockResolvedValue(null);

      const result = await controller.getReport(mockUser, 'nonexistent');

      expect(result.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.getReport(undefined, 'ir1234567890');

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(mockInboxReportService.findByIdAndUid).not.toHaveBeenCalled();
    });

    it('should return params error when reportId is empty', async () => {
      const result = await controller.getReport(mockUser, '');

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
    });

    it('should handle database errors', async () => {
      mockInboxReportService.findByIdAndUid.mockRejectedValue(new Error('Database error'));

      const result = await controller.getReport(mockUser, 'ir1234567890');

      expect(result.code).toBe(ErrorCode.DB_ERROR);
    });
  });

  describe('POST /api/v1/inbox/reports/generate', () => {
    it('should generate a new inbox report', async () => {
      const aiReportData = {
        content: '# Daily Inbox Report - 2026-03-17\n\nAI-generated report',
        summary: {
          topics: ['topic1', 'topic2'],
          mistakes: ['mistake1'],
          actions: ['action1'],
          totalInbox: 5,
          newInbox: 2,
          processedInbox: 3,
          deletedInbox: 0,
          categoryBreakdown: [{ category: 'backend', count: 3 }],
          sourceBreakdown: [{ source: 'manual', count: 5 }],
          insights: [{ text: 'insight1', evidenceIds: ['i1', 'i2'] }],
        },
      };

      const newReport = {
        id: 3,
        inboxReportId: 'ir_new',
        uid: 'test-user-uid',
        date: '2026-03-17',
        content: aiReportData.content,
        summary: JSON.stringify(aiReportData.summary),
        deletedAt: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInboxAiService.generateDailyReport.mockResolvedValue(aiReportData);
      mockInboxReportService.create.mockResolvedValue(newReport);

      const result = await controller.generateReport(mockUser, { date: '2026-03-17' });

      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.date).toBe('2026-03-17');
      expect(mockInboxAiService.generateDailyReport).toHaveBeenCalledWith({
        uid: mockUser.uid,
        date: '2026-03-17',
      });
      expect(mockInboxReportService.create).toHaveBeenCalledWith(mockUser.uid, {
        date: '2026-03-17',
        content: aiReportData.content,
        summary: JSON.stringify(aiReportData.summary),
      });
    });

    it('should return 409 conflict when report already exists', async () => {
      const aiReportData = {
        content: '# Report',
        summary: {
          topics: [],
          mistakes: [],
          actions: [],
          totalInbox: 0,
          newInbox: 0,
          processedInbox: 0,
          deletedInbox: 0,
          categoryBreakdown: [],
          sourceBreakdown: [],
          insights: [],
        },
      };

      mockInboxAiService.generateDailyReport.mockResolvedValue(aiReportData);
      mockInboxReportService.create.mockRejectedValue(new Error('REPORT_ALREADY_EXISTS'));
      mockInboxReportService.findByUidAndDate.mockResolvedValue(mockReports[0]);

      const result = await controller.generateReport(mockUser, { date: '2026-03-16' });

      expect(result.code).toBe(ErrorCode.CONFLICT);
      expect(result.msg).toContain('already exists');
      expect(result.data).toEqual({
        inboxReportId: 'ir1234567890',
        date: '2026-03-16',
      });
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.generateReport(undefined, { date: '2026-03-17' });

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(mockInboxReportService.create).not.toHaveBeenCalled();
    });

    it('should return params error when date is missing', async () => {
      const result = await controller.generateReport(mockUser, { date: '' });

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
    });

    it('should return params error when date format is invalid', async () => {
      const result = await controller.generateReport(mockUser, { date: '2026/03/17' });

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(result.msg).toContain('Invalid date format');
    });

    it('should trim whitespace from date', async () => {
      const aiReportData = {
        content: '# Report',
        summary: {
          topics: [],
          mistakes: [],
          actions: [],
          totalInbox: 0,
          newInbox: 0,
          processedInbox: 0,
          deletedInbox: 0,
          categoryBreakdown: [],
          sourceBreakdown: [],
          insights: [],
        },
      };

      const newReport = {
        id: 4,
        inboxReportId: 'ir_new',
        uid: 'test-user-uid',
        date: '2026-03-17',
        content: '# Report',
        summary: '{}',
        deletedAt: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInboxAiService.generateDailyReport.mockResolvedValue(aiReportData);
      mockInboxReportService.create.mockResolvedValue(newReport);

      await controller.generateReport(mockUser, { date: '  2026-03-17  ' });

      expect(mockInboxAiService.generateDailyReport).toHaveBeenCalledWith({
        uid: mockUser.uid,
        date: '2026-03-17',
      });
    });

    it('should handle database errors', async () => {
      const aiReportData = {
        content: '# Report',
        summary: {
          topics: [],
          mistakes: [],
          actions: [],
          totalInbox: 0,
          newInbox: 0,
          processedInbox: 0,
          deletedInbox: 0,
          categoryBreakdown: [],
          sourceBreakdown: [],
          insights: [],
        },
      };

      mockInboxAiService.generateDailyReport.mockResolvedValue(aiReportData);
      mockInboxReportService.create.mockRejectedValue(new Error('Database error'));

      const result = await controller.generateReport(mockUser, { date: '2026-03-17' });

      expect(result.code).toBe(ErrorCode.DB_ERROR);
    });
  });
});
