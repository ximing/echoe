import 'reflect-metadata';

// Mock drizzle-orm
jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args) => ({ type: 'and', conditions: args })),
  eq: jest.fn((col, val) => ({ type: 'eq', col, val })),
  sql: jest.fn(() => ({ toSQL: () => ({}) })),
}));

// Mock db/connection
jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

// Import after mocks
import { getDatabase } from '../db/connection.js';
import { InboxSourceService } from '../services/inbox-source.service.js';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

describe('InboxSourceService', () => {
  let service: InboxSourceService;

  beforeEach(() => {
    service = new InboxSourceService();
    mockedGetDatabase.mockClear();
  });

  describe('list', () => {
    it('should return all sources for a user and seed default data', async () => {
      const mockSources = [
        { id: 1, uid: 'test-uid', name: 'manual', createdAt: new Date(), updatedAt: new Date() },
        { id: 2, uid: 'test-uid', name: 'web', createdAt: new Date(), updatedAt: new Date() },
      ];

      // Mock for seedDefaultData check (count query)
      const countResult = [{ count: 2 }];

      // Mock for list query
      const orderByFn = jest.fn().mockResolvedValue(mockSources);
      const whereFn = jest.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: jest.fn()
          .mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(countResult) }) }) // First call for count
          .mockReturnValueOnce({ from: fromFn }), // Second call for list
        insert: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.list('test-uid');

      expect(result).toEqual(mockSources);
      expect(mockDb.select).toHaveBeenCalledTimes(2); // Once for count, once for list
    });

    it('should seed default sources if user has none', async () => {
      const mockSources = [
        { id: 1, uid: 'test-uid', name: 'manual', createdAt: new Date(), updatedAt: new Date() },
        { id: 2, uid: 'test-uid', name: 'web', createdAt: new Date(), updatedAt: new Date() },
        { id: 3, uid: 'test-uid', name: 'api', createdAt: new Date(), updatedAt: new Date() },
        { id: 4, uid: 'test-uid', name: 'extension', createdAt: new Date(), updatedAt: new Date() },
        { id: 5, uid: 'test-uid', name: 'other', createdAt: new Date(), updatedAt: new Date() },
      ];

      // Mock for seedDefaultData check (count = 0)
      const countResult = [{ count: 0 }];

      let insertedData: any;

      const orderByFn = jest.fn().mockResolvedValue(mockSources);
      const whereFn = jest.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });

      const mockDb = {
        select: jest.fn()
          .mockReturnValueOnce({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(countResult) }) })
          .mockReturnValueOnce({ from: fromFn }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation((data: any) => {
            insertedData = data;
            return Promise.resolve();
          }),
        }),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.list('test-uid');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(insertedData).toHaveLength(5); // 5 default sources
      expect(insertedData.map((s: any) => s.name)).toEqual(['manual', 'web', 'api', 'extension', 'other']);
    });
  });

  describe('getByName', () => {
    it('should return a source by name', async () => {
      const mockSource = {
        id: 1,
        uid: 'test-uid',
        name: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const limitFn = jest.fn().mockResolvedValue([mockSource]);
      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: selectFn,
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.getByName('test-uid', 'manual');

      expect(result).toEqual(mockSource);
    });

    it('should return null if source not found', async () => {
      const limitFn = jest.fn().mockResolvedValue([]);
      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: selectFn,
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.getByName('test-uid', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new source', async () => {
      const mockSource = {
        id: 1,
        uid: 'test-uid',
        name: 'custom-source',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let insertedData: any;

      // Mock getByName to return null (source doesn't exist)
      const limitFn = jest.fn()
        .mockResolvedValueOnce([]) // First call: check if exists (returns empty)
        .mockResolvedValueOnce([mockSource]); // Second call: fetch created source

      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
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
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.create('test-uid', 'custom-source');

      expect(insertedData.uid).toBe('test-uid');
      expect(insertedData.name).toBe('custom-source');
      expect(result).toEqual(mockSource);
    });

    it('should return existing source if it already exists', async () => {
      const existingSource = {
        id: 1,
        uid: 'test-uid',
        name: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const limitFn = jest.fn().mockResolvedValue([existingSource]);
      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: selectFn,
        insert: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.create('test-uid', 'manual');

      expect(result).toEqual(existingSource);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete a source and clear related inbox records', async () => {
      const mockSource = {
        id: 1,
        uid: 'test-uid',
        name: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock for getting source to delete
      const limitFn = jest.fn().mockResolvedValue([mockSource]);
      const whereFn1 = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn1 = jest.fn().mockReturnValue({ where: whereFn1 });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn1 });

      // Mock for updating inbox records
      const whereFn2 = jest.fn().mockResolvedValue(undefined);
      const setFn = jest.fn().mockReturnValue({ where: whereFn2 });
      const updateFn = jest.fn().mockReturnValue({ set: setFn });

      // Mock for deleting source
      const whereFn3 = jest.fn().mockResolvedValue(undefined);
      const deleteFn = jest.fn().mockReturnValue({ where: whereFn3 });

      const mockDb = {
        select: selectFn,
        update: updateFn,
        delete: deleteFn,
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      await service.delete('test-uid', 1);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalled();
      expect(setFn).toHaveBeenCalledWith({ source: null });
    });

    it('should not delete if source not found', async () => {
      // Mock for getting source to delete (returns empty)
      const limitFn = jest.fn().mockResolvedValue([]);
      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: selectFn,
        update: jest.fn(),
        delete: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      await service.delete('test-uid', 999);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });
});
