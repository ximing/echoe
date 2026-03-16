import 'reflect-metadata';

// Inline mock for drizzle-orm
jest.mock('drizzle-orm', () => {
  return {
    and: jest.fn((...args) => ({ type: 'and', conditions: args })),
    eq: jest.fn((col, val) => ({ type: 'eq', col, val })),
    isNull: jest.fn((col) => ({ type: 'isNull', col })),
    desc: jest.fn((col) => ({ type: 'desc', col })),
    asc: jest.fn((col) => ({ type: 'asc', col })),
    gte: jest.fn((col, val) => ({ type: 'gte', col, val })),
    lte: jest.fn((col, val) => ({ type: 'lte', col, val })),
    sql: jest.fn(() => ({ toSQL: () => ({}) })),
  };
});

// Mock db/connection
jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

// Import after mocks
import { getDatabase } from '../db/connection.js';
import {
  InboxReportService,
  CreateInboxReportParams,
  ListInboxReportParams,
} from '../services/inbox-report.service.js';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

describe('InboxReportService', () => {
  let service: InboxReportService;

  beforeEach(() => {
    service = new InboxReportService();
    mockedGetDatabase.mockClear();
  });

  describe('create', () => {
    it('should create an inbox report and return it', async () => {
      const mockReport = {
        inboxReportId: 'ir123',
        uid: 'test-uid',
        date: '2026-03-16',
        content: '# Daily Report',
        summary: '{"insights": []}',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let insertedData: any;

      const whereFn = jest.fn().mockResolvedValue([mockReport]);
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      // Mock findByUidAndDate to return null (no existing report)
      const findByUidAndDateSpy = jest.spyOn(service, 'findByUidAndDate').mockResolvedValue(null);

      const mockDb = {
        select: selectFn,
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation((data: any) => {
            insertedData = data;
            return Promise.resolve();
          }),
        }),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const params: CreateInboxReportParams = {
        date: '2026-03-16',
        content: '# Daily Report',
        summary: '{"insights": []}',
      };

      const result = await service.create('test-uid', params);

      // Verify report ID starts with 'ir' prefix
      expect(insertedData.inboxReportId).toMatch(/^ir/);

      // Verify data was inserted
      expect(insertedData.uid).toBe('test-uid');
      expect(insertedData.date).toBe('2026-03-16');
      expect(insertedData.content).toBe('# Daily Report');
      expect(insertedData.summary).toBe('{"insights": []}');

      // Verify findByUidAndDate was called to check for existing report
      expect(findByUidAndDateSpy).toHaveBeenCalledWith('test-uid', '2026-03-16');

      findByUidAndDateSpy.mockRestore();
    });

    it('should throw REPORT_ALREADY_EXISTS error when report exists for uid+date', async () => {
      const existingReport = {
        inboxReportId: 'ir123',
        uid: 'test-uid',
        date: '2026-03-16',
        content: '# Existing Report',
        summary: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock findByUidAndDate to return existing report
      const findByUidAndDateSpy = jest
        .spyOn(service, 'findByUidAndDate')
        .mockResolvedValue(existingReport);

      const params: CreateInboxReportParams = {
        date: '2026-03-16',
        content: '# New Report',
      };

      await expect(service.create('test-uid', params)).rejects.toThrow('REPORT_ALREADY_EXISTS');

      findByUidAndDateSpy.mockRestore();
    });

    it('should use null for summary when not provided', async () => {
      let insertedData: any;

      const mockDb = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              {
                inboxReportId: 'ir123',
                uid: 'test-uid',
                date: '2026-03-16',
                content: '# Report',
                summary: null,
                deletedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation((data: any) => {
            insertedData = data;
            return Promise.resolve();
          }),
        }),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const findByUidAndDateSpy = jest.spyOn(service, 'findByUidAndDate').mockResolvedValue(null);

      const params: CreateInboxReportParams = {
        date: '2026-03-16',
        content: '# Report',
      };

      await service.create('test-uid', params);

      expect(insertedData.summary).toBeNull();

      findByUidAndDateSpy.mockRestore();
    });
  });

  describe('list', () => {
    it('should list inbox reports with pagination', async () => {
      const mockReports = [
        {
          inboxReportId: 'ir1',
          uid: 'test-uid',
          date: '2026-03-16',
          content: '# Report 1',
          summary: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          inboxReportId: 'ir2',
          uid: 'test-uid',
          date: '2026-03-15',
          content: '# Report 2',
          summary: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const offsetFn = jest.fn().mockResolvedValue(mockReports);
      const limitFn = jest.fn().mockReturnValue({ offset: offsetFn });
      const orderByFn = jest.fn().mockReturnValue({ limit: limitFn });
      const whereFn = jest.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockImplementation((fields?: any) => {
        if (fields && fields.count) {
          // Count query - return array with 2 items (total count)
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ count: 'ir1' }, { count: 'ir2' }]),
            }),
          };
        }
        // List query
        return { from: fromFn };
      });

      const mockDb = {
        select: selectFn,
        insert: jest.fn(),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const params: ListInboxReportParams = {
        page: 1,
        pageSize: 20,
      };

      const result = await service.list('test-uid', params);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should filter reports by date', async () => {
      const mockReports = [
        {
          inboxReportId: 'ir1',
          uid: 'test-uid',
          date: '2026-03-16',
          content: '# Report 1',
          summary: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const offsetFn = jest.fn().mockResolvedValue(mockReports);
      const limitFn = jest.fn().mockReturnValue({ offset: offsetFn });
      const orderByFn = jest.fn().mockReturnValue({ limit: limitFn });
      const whereFn = jest.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockImplementation((fields?: any) => {
        if (fields && fields.count) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ count: 'ir1' }]),
            }),
          };
        }
        return { from: fromFn };
      });

      const mockDb = {
        select: selectFn,
        insert: jest.fn(),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const params: ListInboxReportParams = {
        date: '2026-03-16',
        page: 1,
        pageSize: 20,
      };

      const result = await service.list('test-uid', params);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].date).toBe('2026-03-16');
    });

    it('should filter reports by date range', async () => {
      const mockReports = [
        {
          inboxReportId: 'ir1',
          uid: 'test-uid',
          date: '2026-03-15',
          content: '# Report 1',
          summary: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          inboxReportId: 'ir2',
          uid: 'test-uid',
          date: '2026-03-16',
          content: '# Report 2',
          summary: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const offsetFn = jest.fn().mockResolvedValue(mockReports);
      const limitFn = jest.fn().mockReturnValue({ offset: offsetFn });
      const orderByFn = jest.fn().mockReturnValue({ limit: limitFn });
      const whereFn = jest.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockImplementation((fields?: any) => {
        if (fields && fields.count) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ count: 'ir1' }, { count: 'ir2' }]),
            }),
          };
        }
        return { from: fromFn };
      });

      const mockDb = {
        select: selectFn,
        insert: jest.fn(),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const params: ListInboxReportParams = {
        startDate: '2026-03-15',
        endDate: '2026-03-16',
        page: 1,
        pageSize: 20,
      };

      const result = await service.list('test-uid', params);

      expect(result.items).toHaveLength(2);
    });
  });

  describe('findByIdAndUid', () => {
    it('should find a report by ID and UID', async () => {
      const mockReport = {
        inboxReportId: 'ir123',
        uid: 'test-uid',
        date: '2026-03-16',
        content: '# Report',
        summary: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const limitFn = jest.fn().mockResolvedValue([mockReport]);
      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: selectFn,
        insert: jest.fn(),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.findByIdAndUid('test-uid', 'ir123');

      expect(result).not.toBeNull();
      expect(result?.inboxReportId).toBe('ir123');
      expect(result?.uid).toBe('test-uid');
    });

    it('should return null when report not found', async () => {
      const limitFn = jest.fn().mockResolvedValue([]);
      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: selectFn,
        insert: jest.fn(),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.findByIdAndUid('test-uid', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByUidAndDate', () => {
    it('should find a report by UID and date', async () => {
      const mockReport = {
        inboxReportId: 'ir123',
        uid: 'test-uid',
        date: '2026-03-16',
        content: '# Report',
        summary: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const limitFn = jest.fn().mockResolvedValue([mockReport]);
      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: selectFn,
        insert: jest.fn(),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.findByUidAndDate('test-uid', '2026-03-16');

      expect(result).not.toBeNull();
      expect(result?.date).toBe('2026-03-16');
      expect(result?.uid).toBe('test-uid');
    });

    it('should return null when report not found for date', async () => {
      const limitFn = jest.fn().mockResolvedValue([]);
      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: selectFn,
        insert: jest.fn(),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.findByUidAndDate('test-uid', '2026-03-17');

      expect(result).toBeNull();
    });
  });
});
