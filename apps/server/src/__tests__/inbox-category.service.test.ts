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
import { InboxCategoryService } from '../services/inbox-category.service.js';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

describe('InboxCategoryService', () => {
  let service: InboxCategoryService;

  beforeEach(() => {
    service = new InboxCategoryService();
    mockedGetDatabase.mockClear();
  });

  describe('list', () => {
    it('should return all categories for a user and seed default data', async () => {
      const mockCategories = [
        { id: 1, uid: 'test-uid', name: 'backend', createdAt: new Date(), updatedAt: new Date() },
        { id: 2, uid: 'test-uid', name: 'frontend', createdAt: new Date(), updatedAt: new Date() },
      ];

      // Mock for seedDefaultData check (count query)
      const countResult = [{ count: 2 }];

      // Mock for list query
      const orderByFn = jest.fn().mockResolvedValue(mockCategories);
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

      expect(result).toEqual(mockCategories);
      expect(mockDb.select).toHaveBeenCalledTimes(2); // Once for count, once for list
    });

    it('should seed default categories if user has none', async () => {
      const mockCategories = [
        { id: 1, uid: 'test-uid', name: 'backend', createdAt: new Date(), updatedAt: new Date() },
        { id: 2, uid: 'test-uid', name: 'frontend', createdAt: new Date(), updatedAt: new Date() },
        { id: 3, uid: 'test-uid', name: 'design', createdAt: new Date(), updatedAt: new Date() },
        { id: 4, uid: 'test-uid', name: 'product', createdAt: new Date(), updatedAt: new Date() },
        { id: 5, uid: 'test-uid', name: 'life', createdAt: new Date(), updatedAt: new Date() },
        { id: 6, uid: 'test-uid', name: 'other', createdAt: new Date(), updatedAt: new Date() },
      ];

      // Mock for seedDefaultData check (count = 0)
      const countResult = [{ count: 0 }];

      let insertedData: any;

      const orderByFn = jest.fn().mockResolvedValue(mockCategories);
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
      expect(insertedData).toHaveLength(6); // 6 default categories
      expect(insertedData.map((c: any) => c.name)).toEqual([
        'backend',
        'frontend',
        'design',
        'product',
        'life',
        'other',
      ]);
    });
  });

  describe('getByName', () => {
    it('should return a category by name', async () => {
      const mockCategory = {
        id: 1,
        uid: 'test-uid',
        name: 'backend',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const limitFn = jest.fn().mockResolvedValue([mockCategory]);
      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: selectFn,
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.getByName('test-uid', 'backend');

      expect(result).toEqual(mockCategory);
    });

    it('should return null if category not found', async () => {
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
    it('should create a new category', async () => {
      const mockCategory = {
        id: 1,
        uid: 'test-uid',
        name: 'custom-category',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let insertedData: any;

      // Mock getByName to return null (category doesn't exist)
      const limitFn = jest.fn()
        .mockResolvedValueOnce([]) // First call: check if exists (returns empty)
        .mockResolvedValueOnce([mockCategory]); // Second call: fetch created category

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

      const result = await service.create('test-uid', 'custom-category');

      expect(insertedData.uid).toBe('test-uid');
      expect(insertedData.name).toBe('custom-category');
      expect(result).toEqual(mockCategory);
    });

    it('should return existing category if it already exists', async () => {
      const existingCategory = {
        id: 1,
        uid: 'test-uid',
        name: 'backend',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const limitFn = jest.fn().mockResolvedValue([existingCategory]);
      const whereFn = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn = jest.fn().mockReturnValue({ where: whereFn });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn });

      const mockDb = {
        select: selectFn,
        insert: jest.fn(),
      };

      mockedGetDatabase.mockReturnValue(mockDb);

      const result = await service.create('test-uid', 'backend');

      expect(result).toEqual(existingCategory);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete a category and clear related inbox records', async () => {
      const mockCategory = {
        id: 1,
        uid: 'test-uid',
        name: 'backend',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock for getting category to delete
      const limitFn = jest.fn().mockResolvedValue([mockCategory]);
      const whereFn1 = jest.fn().mockReturnValue({ limit: limitFn });
      const fromFn1 = jest.fn().mockReturnValue({ where: whereFn1 });
      const selectFn = jest.fn().mockReturnValue({ from: fromFn1 });

      // Mock for updating inbox records
      const whereFn2 = jest.fn().mockResolvedValue(undefined);
      const setFn = jest.fn().mockReturnValue({ where: whereFn2 });
      const updateFn = jest.fn().mockReturnValue({ set: setFn });

      // Mock for deleting category
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
      expect(setFn).toHaveBeenCalledWith({ category: null });
    });

    it('should not delete if category not found', async () => {
      // Mock for getting category to delete (returns empty)
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
