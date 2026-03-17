import 'reflect-metadata';

// Inline mock for drizzle-orm - define functions inside factory like api-token tests
jest.mock('drizzle-orm', () => {
  return {
    and: jest.fn((...args) => ({ type: 'and', conditions: args })),
    eq: jest.fn((col, val) => ({ type: 'eq', col, val })),
    isNull: jest.fn((col) => ({ type: 'isNull', col })),
    desc: jest.fn((col) => ({ type: 'desc', col })),
    asc: jest.fn((col) => ({ type: 'asc', col })),
    sql: jest.fn(() => ({ toSQL: () => ({}) })),
  };
});

// Mock db/connection
jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

// Import after mocks
import { getDatabase } from '../db/connection.js';
import { InboxService, CreateInboxParams, ListInboxParams } from '../services/inbox.service.js';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

describe('InboxService', () => {
  let service: InboxService;
  let mockMetricsService: any;
  let mockSourceService: any;
  let mockCategoryService: any;

  beforeEach(() => {
    mockMetricsService = {
      trackInboxCreate: jest.fn(),
    };
    mockSourceService = {
      create: jest.fn().mockResolvedValue({ id: 1, uid: 'test-uid', name: 'test-source' }),
    };
    mockCategoryService = {
      create: jest.fn().mockResolvedValue({ id: 1, uid: 'test-uid', name: 'test-category' }),
    };
    service = new InboxService(mockMetricsService, mockSourceService, mockCategoryService);
    mockedGetDatabase.mockClear();
  });

  describe('create', () => {
    it('should create an inbox item and return it', async () => {
      const mockInboxItem = {
        inboxId: 'i123',
        uid: 'test-uid',
        front: 'Front content',
        back: 'Back content',
        source: 'manual',
        category: 'backend',
        isRead: false,
        deletedAt: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let insertedData: any;

      // Create mock chain - each method returns the next in the chain
      // IMPORTANT: whereFn returns a Promise to simulate async DB query
      const whereFn = jest.fn().mockResolvedValue([mockInboxItem]);
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

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

      const params: CreateInboxParams = {
        front: 'Front content',
        back: 'Back content',
        source: 'manual',
        category: 'backend',
      };

      const result = await service.create('test-uid', params);

      // Verify inbox ID starts with 'i' prefix (INBOX type)
      expect(insertedData.inboxId).toMatch(/^i/);

      // Verify data was inserted
      expect(insertedData.uid).toBe('test-uid');
      expect(insertedData.front).toBe('Front content');
      expect(insertedData.back).toBe('Back content');
      expect(insertedData.source).toBe('manual');
      expect(insertedData.category).toBe('backend');
      expect(insertedData.isRead).toBe(false);
    });

    it('should use default values when not provided', async () => {
      let insertedData: any;
      const mockDb = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            // create method only uses .where() without .limit(), so return Promise directly
            where: jest.fn().mockResolvedValue([{
              inboxId: 'i123',
              uid: 'test-uid',
              front: 'Front',
              back: 'Back',
              source: 'manual',
              category: 'backend',
              isRead: false,
            }]),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation((data: any) => {
            insertedData = data;
            return Promise.resolve();
          }),
        }),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const params: CreateInboxParams = {
        front: 'Front',
        back: 'Back',
      };

      await service.create('test-uid', params);

      expect(insertedData.source).toBe('manual');
      expect(insertedData.category).toBe('backend');
      expect(insertedData.isRead).toBe(false);
    });

    it('should auto-create source when provided', async () => {
      const mockDb = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{
              inboxId: 'i123',
              uid: 'test-uid',
              front: 'Front',
              back: 'Back',
              source: 'new-source',
              category: 'backend',
              isRead: false,
            }]),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const params: CreateInboxParams = {
        front: 'Front',
        back: 'Back',
        source: 'new-source',
      };

      await service.create('test-uid', params);

      expect(mockSourceService.create).toHaveBeenCalledWith('test-uid', 'new-source');
    });

    it('should auto-create category when provided', async () => {
      const mockDb = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{
              inboxId: 'i123',
              uid: 'test-uid',
              front: 'Front',
              back: 'Back',
              source: 'manual',
              category: 'new-category',
              isRead: false,
            }]),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const params: CreateInboxParams = {
        front: 'Front',
        back: 'Back',
        category: 'new-category',
      };

      await service.create('test-uid', params);

      expect(mockCategoryService.create).toHaveBeenCalledWith('test-uid', 'new-category');
    });

    it('should auto-create both source and category when provided', async () => {
      const mockDb = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{
              inboxId: 'i123',
              uid: 'test-uid',
              front: 'Front',
              back: 'Back',
              source: 'new-source',
              category: 'new-category',
              isRead: false,
            }]),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
        update: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const params: CreateInboxParams = {
        front: 'Front',
        back: 'Back',
        source: 'new-source',
        category: 'new-category',
      };

      await service.create('test-uid', params);

      expect(mockSourceService.create).toHaveBeenCalledWith('test-uid', 'new-source');
      expect(mockCategoryService.create).toHaveBeenCalledWith('test-uid', 'new-category');
    });
  });

  describe('list', () => {
    it('should return paginated inbox items', async () => {
      const mockInboxItems = [
        { inboxId: 'i123', uid: 'test-uid', front: 'Front 1', back: 'Back 1', source: 'manual', category: 'backend', isRead: false },
        { inboxId: 'i456', uid: 'test-uid', front: 'Front 2', back: 'Back 2', source: 'manual', category: 'backend', isRead: true },
      ];

      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  offset: jest.fn().mockResolvedValue(mockInboxItems),
                }),
              }),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      const result = await service.list('test-uid', { page: 1, pageSize: 20 });

      expect(result.items).toEqual(mockInboxItems);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('should filter by category', async () => {
      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  offset: jest.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      const params: ListInboxParams = {
        category: 'frontend',
      };

      await service.list('test-uid', params);

      expect(mockedGetDatabase).toHaveBeenCalled();
    });

    it('should filter by isRead', async () => {
      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  offset: jest.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      const params: ListInboxParams = {
        isRead: false,
      };

      await service.list('test-uid', params);

      expect(mockedGetDatabase).toHaveBeenCalled();
    });

    it('should return empty array when no items exist', async () => {
      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation(function() {
              // Return object that supports both patterns:
              // 1. Promise pattern (await directly) - for count query
              // 2. Chain pattern (.orderBy().limit().offset()) - for items query
              const promise = Promise.resolve([]);
              return Object.assign(promise, {
                orderBy: jest.fn().mockReturnValue({
                  limit: jest.fn().mockReturnValue({
                    offset: jest.fn().mockResolvedValue([]),
                  }),
                }),
              });
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      const result = await service.list('test-uid');

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('update', () => {
    it('should update an inbox item', async () => {
      const mockInboxItem = {
        inboxId: 'i123',
        uid: 'test-uid',
        front: 'Updated Front',
        back: 'Updated Back',
        source: 'web',
        category: 'frontend',
        isRead: true,
        deletedAt: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock functions to track call order
      const selectMock = jest.fn();
      const fromMock = jest.fn();
      const whereMock = jest.fn();
      const limitMock = jest.fn();

      // First call: findByIdAndUid - uses .where().limit(1) - returns item to pass existence check
      // Second call: after update - uses .where() without limit - returns updated item
      // Third call: (if any) - returns updated item
      const mockWhereResult1 = Object.assign(Promise.resolve([{ inboxId: 'i123', uid: 'test-uid' }]), {
        limit: limitMock.mockResolvedValueOnce([{ inboxId: 'i123', uid: 'test-uid' }]),
      });
      const mockWhereResult2 = Promise.resolve([mockInboxItem]);
      const mockWhereResult3 = Promise.resolve([mockInboxItem]);

      whereMock
        .mockReturnValueOnce(mockWhereResult1)
        .mockReturnValueOnce(mockWhereResult2)
        .mockReturnValueOnce(mockWhereResult3);

      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      mockedGetDatabase.mockReturnValue({
        select: selectMock,
        insert: jest.fn(),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      } as any);

      const result = await service.update('test-uid', 'i123', {
        front: 'Updated Front',
        back: 'Updated Back',
        category: 'frontend',
        isRead: true,
      });

      expect(result.front).toBe('Updated Front');
      expect(result.back).toBe('Updated Back');
    });

    it('should throw error if inbox item not found', async () => {
      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      await expect(service.update('test-uid', 'nonexistent', { front: 'New' })).rejects.toThrow('Inbox item not found');
    });
  });

  describe('delete', () => {
    it('should soft-delete an inbox item', async () => {
      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ inboxId: 'i123', uid: 'test-uid' }]),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      } as any);

      const result = await service.delete('test-uid', 'i123');

      expect(result).toBe(true);
    });

    it('should throw error if inbox item not found', async () => {
      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      await expect(service.delete('test-uid', 'nonexistent')).rejects.toThrow('Inbox item not found');
    });
  });

  describe('markRead', () => {
    it('should mark an inbox item as read', async () => {
      const mockInboxItem = {
        inboxId: 'i123',
        uid: 'test-uid',
        front: 'Front',
        back: 'Back',
        source: 'manual',
        category: 'backend',
        isRead: true,
        deletedAt: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create mock functions that can track call count
      const selectMock = jest.fn();
      const fromMock = jest.fn();
      const whereMock = jest.fn();
      const limitMock = jest.fn();

      // First call (findByIdAndUid): returns item to pass existence check
      // Second call (after update): returns updated item
      // Third call (after update): returns updated item
      whereMock
        .mockReturnValueOnce({
          limit: limitMock.mockResolvedValueOnce([{ inboxId: 'i123', uid: 'test-uid' }]),
        })
        .mockReturnValueOnce(Promise.resolve([mockInboxItem]))
        .mockReturnValueOnce(Promise.resolve([mockInboxItem]));

      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      mockedGetDatabase.mockReturnValue({
        select: selectMock,
        insert: jest.fn(),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      } as any);

      const result = await service.markRead('test-uid', 'i123');

      expect(result.isRead).toBe(true);
    });

    it('should throw error if inbox item not found', async () => {
      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      await expect(service.markRead('test-uid', 'nonexistent')).rejects.toThrow('Inbox item not found');
    });
  });

  describe('markReadAll', () => {
    it('should mark all unread items as read and return count', async () => {
      const unreadItems = [
        { inboxId: 'i123' },
        { inboxId: 'i456' },
        { inboxId: 'i789' },
      ];

      // Create mock functions that can track call count
      const selectMock = jest.fn();
      const fromMock = jest.fn();
      const whereMock = jest.fn();
      const limitMock = jest.fn();

      // The service uses .where().limit(1000) to get all unread items
      // Return object that has both: Promise resolution AND .limit() method
      const mockWhereResult = Object.assign(Promise.resolve(unreadItems), {
        limit: limitMock.mockResolvedValue(unreadItems),
      });

      whereMock.mockReturnValue(mockWhereResult);

      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      mockedGetDatabase.mockReturnValue({
        select: selectMock,
        insert: jest.fn(),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue({ affectedRows: 3 }),
          }),
        }),
      } as any);

      const result = await service.markReadAll('test-uid');

      expect(result.updatedCount).toBe(3);
    });

    it('should return 0 when no unread items exist', async () => {
      // Create mock functions
      const selectMock = jest.fn();
      const fromMock = jest.fn();
      const whereMock = jest.fn();
      const limitMock = jest.fn();

      // Return object that has both: Promise resolution AND .limit() method
      const mockWhereResult = Object.assign(Promise.resolve([]), {
        limit: limitMock.mockResolvedValue([]),
      });

      whereMock.mockReturnValue(mockWhereResult);

      fromMock.mockReturnValue({ where: whereMock });
      selectMock.mockReturnValue({ from: fromMock });

      mockedGetDatabase.mockReturnValue({
        select: selectMock,
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      const result = await service.markReadAll('test-uid');

      expect(result.updatedCount).toBe(0);
    });
  });

  describe('findByIdAndUid', () => {
    it('should return inbox item when found', async () => {
      const mockInboxItem = {
        inboxId: 'i123',
        uid: 'test-uid',
        front: 'Front',
        back: 'Back',
      };

      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockInboxItem]),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      const result = await service.findByIdAndUid('test-uid', 'i123');

      expect(result).toEqual(mockInboxItem);
    });

    it('should return null when not found', async () => {
      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      const result = await service.findByIdAndUid('test-uid', 'nonexistent');

      expect(result).toBeNull();
    });
  });
});
