import 'reflect-metadata';
import dayjs from 'dayjs';

// Inline mock for drizzle-orm
jest.mock('drizzle-orm', () => {
  return {
    and: jest.fn((...args) => ({ type: 'and', conditions: args })),
    eq: jest.fn((col, val) => ({ type: 'eq', col, val })),
    isNull: jest.fn((col) => ({ type: 'isNull', col })),
    gte: jest.fn((col, val) => ({ type: 'gte', col, val })),
    lte: jest.fn((col, val) => ({ type: 'lte', col, val })),
    gt: jest.fn((col, val) => ({ type: 'gt', col, val })),
    lt: jest.fn((col, val) => ({ type: 'lt', col, val })),
    desc: jest.fn((col) => ({ type: 'desc', col })),
    asc: jest.fn((col) => ({ type: 'asc', col })),
    sql: jest.fn(() => ({ toSQL: () => ({}) })),
  };
});

// Mock config
jest.mock('../config/config.js', () => ({
  config: {
    openai: {
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      embeddingModel: 'text-embedding-3-small',
      baseURL: 'https://api.openai.com/v1',
      embeddingDimensions: 1536,
    },
  },
}));

// Mock db/connection
jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

// Import after mocks
import { getDatabase } from '../db/connection.js';
import { InboxAiService } from '../services/inbox-ai.service.js';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

// Helper to create mock chain that returns specified data
function createMockSelect(returnValue: any[]) {
  const limitFn = jest.fn().mockResolvedValue(returnValue);
  const orderByFn = jest.fn().mockReturnValue({ limit: limitFn });
  const whereFn = jest.fn().mockReturnValue({ orderBy: orderByFn, limit: limitFn });
  const fromFn = jest.fn().mockReturnValue({ where: whereFn });
  const selectFn = jest.fn().mockReturnValue({ from: fromFn });

  return {
    select: selectFn,
    _limitFn: limitFn,
    _orderByFn: orderByFn,
    _whereFn: whereFn,
    _fromFn: fromFn,
  };
}

describe('InboxAiService', () => {
  let service: InboxAiService;

  beforeEach(() => {
    service = new InboxAiService();
    mockedGetDatabase.mockReset();
  });

  describe('getL0Context', () => {
    it('should return L0 context for current inbox item', async () => {
      const mockInboxItem = {
        inboxId: 'i123',
        uid: 'test-uid',
        front: 'What is TypeScript?',
        back: 'TypeScript is a typed superset of JavaScript.',
        source: 'manual',
        category: 'backend',
        isRead: 0,
        deletedAt: null,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      };

      mockedGetDatabase.mockReturnValue(createMockSelect([mockInboxItem]) as any);

      const result = await service.getL0Context('test-uid', 'i123');

      expect(result).not.toBeNull();
      expect(result?.level).toBe('L0');
      expect(result?.inboxId).toBe('i123');
      expect(result?.metadata.category).toBe('backend');
    });

    it('should return null when inbox item not found', async () => {
      mockedGetDatabase.mockReturnValue(createMockSelect([]) as any);

      const result = await service.getL0Context('test-uid', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getL1Context', () => {
    it('should return L1 context with related inbox items from last 7 days', async () => {
      const mockCurrentItem = {
        inboxId: 'i123',
        uid: 'test-uid',
        front: 'What is TypeScript?',
        back: 'TypeScript is a typed superset of JavaScript.',
        source: 'manual',
        category: 'backend',
        isRead: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Use very recent dates (within last 7 days) to ensure they pass the date filter
      const recentDate = new Date();
      const mockRelatedItem = {
        inboxId: 'i124',
        uid: 'test-uid',
        front: 'What is React?',
        back: 'React is a JavaScript library for building UIs.',
        source: 'manual',
        category: 'backend',
        isRead: 0,
        deletedAt: null,
        createdAt: recentDate,
        updatedAt: recentDate,
      };

      // Create a stateful mock that returns different data for each query
      // Since getDatabase() is called once and reused, we need to make the mock chain stateful
      let queryCount = 0;
      const limitFn = jest.fn().mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) {
          // First query: get current item for similarity comparison
          return Promise.resolve([mockCurrentItem]);
        } else {
          // Second query: get items from last 7 days (should include both current and related items)
          return Promise.resolve([mockCurrentItem, mockRelatedItem]);
        }
      });

      const orderByFn = jest.fn().mockReturnValue({ limit: limitFn });
      const whereFn = jest.fn().mockReturnValue({ orderBy: orderByFn, limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      mockedGetDatabase.mockReturnValue({
        select: selectFn,
      } as any);

      const result = await service.getL1Context('test-uid', 'i123');

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      result.forEach((item) => {
        expect(item.level).toBe('L1');
        expect(item.similarity).toBeDefined();
      });
    });

    it('should return empty array when no related items found', async () => {
      const mockCurrentItem = {
        inboxId: 'i123',
        uid: 'test-uid',
        front: 'Test question',
        back: 'Test answer',
        source: 'manual',
        category: 'backend',
        isRead: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let callCount = 0;
      mockedGetDatabase.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockSelect([mockCurrentItem]) as any;
        } else {
          return createMockSelect([]) as any;
        }
      });

      const result = await service.getL1Context('test-uid', 'i123');

      expect(result).toEqual([]);
    });
  });

  describe('getL2Context', () => {
    it('should return L2 context with report summaries from last 30 days', async () => {
      const mockReports = [
        {
          inboxReportId: 'ir001',
          uid: 'test-uid',
          date: '2024-01-15',
          content: '# Daily Report\n\nSummary of inbox activities.',
          summary: '{"totalInbox": 10, "newInbox": 5, "processedInbox": 3}',
          deletedAt: null,
          createdAt: new Date('2024-01-15'),
          updatedAt: new Date('2024-01-15'),
        },
        {
          inboxReportId: 'ir002',
          uid: 'test-uid',
          date: '2024-01-14',
          content: '# Daily Report\n\nSummary of inbox activities.',
          summary: '{"totalInbox": 8, "newInbox": 2, "processedInbox": 4}',
          deletedAt: null,
          createdAt: new Date('2024-01-14'),
          updatedAt: new Date('2024-01-14'),
        },
      ];

      mockedGetDatabase.mockReturnValueOnce(createMockSelect(mockReports) as any);

      const result = await service.getL2Context('test-uid');

      expect(result).toHaveLength(2);
      result.forEach((item) => {
        expect(item.level).toBe('L2');
        expect(item.inboxReportId).toBeDefined();
      });
    });

    it('should return empty array when no reports found', async () => {
      mockedGetDatabase.mockReturnValueOnce(createMockSelect([]) as any);

      const result = await service.getL2Context('test-uid');

      expect(result).toEqual([]);
    });
  });

  describe('buildContext', () => {
    it('should build complete context with all three levels', async () => {
      const mockInboxItem = {
        inboxId: 'i123',
        uid: 'test-uid',
        front: 'What is TypeScript?',
        back: 'TypeScript is a typed superset of JavaScript.',
        source: 'manual',
        category: 'backend',
        isRead: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockRelatedItems = [
        {
          inboxId: 'i124',
          uid: 'test-uid',
          front: 'What is React?',
          back: 'React is a JavaScript library.',
          source: 'manual',
          category: 'backend',
          isRead: 0,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockReports = [
        {
          inboxReportId: 'ir001',
          uid: 'test-uid',
          date: dayjs().format('YYYY-MM-DD'),
          content: '# Report',
          summary: '{"totalInbox": 10}',
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockedGetDatabase
        .mockReturnValueOnce(createMockSelect([mockInboxItem]) as any)
        .mockReturnValueOnce(createMockSelect([mockInboxItem]) as any)
        .mockReturnValueOnce(createMockSelect(mockRelatedItems) as any)
        .mockReturnValueOnce(createMockSelect(mockReports) as any);

      const result = await service.buildContext({
        uid: 'test-uid',
        inboxId: 'i123',
      });

      expect(result.l0).not.toBeNull();
      expect(result.l0?.level).toBe('L0');
      expect(result.l1).toBeInstanceOf(Array);
      expect(result.l2).toBeInstanceOf(Array);
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('should return trimmed context when exceeding token budget', async () => {
      const mockInboxItem = {
        inboxId: 'i999',
        uid: 'test-uid',
        front: 'Q'.repeat(2000),
        back: 'A'.repeat(2000),
        source: 'manual',
        category: 'backend',
        isRead: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create many large related items to exceed budget
      const mockRelatedItems = Array.from({ length: 15 }, (_, i) => ({
        inboxId: `i${i}`,
        uid: 'test-uid',
        front: `Question ${i}: ${'Q'.repeat(500)}`,
        back: `Answer ${i}: ${'A'.repeat(500)}`,
        source: 'manual',
        category: i % 2 === 0 ? 'backend' : 'frontend',
        isRead: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Create many large reports to exceed budget
      const mockReports = Array.from({ length: 40 }, (_, i) => ({
        inboxReportId: `ir${i}`,
        uid: 'test-uid',
        date: dayjs().subtract(i, 'day').format('YYYY-MM-DD'),
        content: 'Report content'.repeat(200),
        summary: '{"totalInbox": 10}',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mockedGetDatabase
        .mockReturnValueOnce(createMockSelect([mockInboxItem]) as any)
        .mockReturnValueOnce(createMockSelect([mockInboxItem]) as any)
        .mockReturnValueOnce(createMockSelect(mockRelatedItems) as any)
        .mockReturnValueOnce(createMockSelect(mockReports) as any);

      const result = await service.buildContext({
        uid: 'test-uid',
        inboxId: 'i999',
        tokenBudget: 2000,
      });

      // Should trim when exceeding budget
      expect(result.totalTokens).toBeLessThanOrEqual(2000);
    });
  });

  describe('buildPrompt', () => {
    it('should build prompt following PRD structure', async () => {
      const mockInboxItem = {
        inboxId: 'i123',
        uid: 'test-uid',
        front: 'What is TypeScript?',
        back: 'TypeScript is a typed superset of JavaScript.',
        source: 'manual',
        category: 'backend',
        isRead: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // buildPrompt makes 1 call + buildContext makes 4 calls (getL0Context x2, getL1Context x2, getL2Context x1)
      mockedGetDatabase
        .mockReturnValueOnce(createMockSelect([mockInboxItem]) as any) // buildPrompt: get current item
        .mockReturnValueOnce(createMockSelect([mockInboxItem]) as any) // buildContext -> getL0Context
        .mockReturnValueOnce(createMockSelect([mockInboxItem]) as any) // buildContext -> getL1Context: get current item
        .mockReturnValueOnce(createMockSelect([]) as any) // buildContext -> getL1Context: get related items
        .mockReturnValueOnce(createMockSelect([]) as any); // buildContext -> getL2Context: get reports

      const result = await service.buildPrompt({
        uid: 'test-uid',
        inboxId: 'i123',
        task: 'Rewrite this inbox item with better organization',
        outputFormat: 'markdown',
      });

      expect(result.task).toBe('Rewrite this inbox item with better organization');
      expect(result.currentInput).toBeDefined();
      expect(result.currentInput.inboxId).toBe('i123');
      expect(result.currentInput.front).toBe('What is TypeScript?');
      expect(result.currentInput.back).toBe('TypeScript is a typed superset of JavaScript.');
      expect(result.retrievedContext).toBeDefined();
      expect(result.retrievedContext.l0).toBeDefined();
      expect(result.retrievedContext.l1).toBeInstanceOf(Array);
      expect(result.retrievedContext.l2).toBeInstanceOf(Array);
      expect(result.constraints).toBeDefined();
      expect(result.constraints.outputFormat).toBe('markdown');
    });

    it('should throw error when inbox item not found', async () => {
      // All calls should return empty array to simulate item not found
      mockedGetDatabase
        .mockReturnValueOnce(createMockSelect([]) as any) // buildPrompt: get current item
        .mockReturnValueOnce(createMockSelect([]) as any) // buildContext -> getL0Context
        .mockReturnValueOnce(createMockSelect([]) as any) // buildContext -> getL1Context: get current item
        .mockReturnValueOnce(createMockSelect([]) as any) // buildContext -> getL1Context: get related items
        .mockReturnValueOnce(createMockSelect([]) as any); // buildContext -> getL2Context

      await expect(
        service.buildPrompt({
          uid: 'test-uid',
          inboxId: 'nonexistent',
          task: 'Rewrite',
        })
      ).rejects.toThrow('Inbox item not found');
    });
  });
});
