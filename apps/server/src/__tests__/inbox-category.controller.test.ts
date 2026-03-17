import 'reflect-metadata';

import { ErrorCode } from '../constants/error-codes.js';
import { InboxCategoryController } from '../controllers/v1/inbox-category.controller.js';

// Mock the InboxCategoryService
jest.mock('../services/inbox-category.service.js', () => ({
  InboxCategoryService: class MockInboxCategoryService {
    list = jest.fn();
    create = jest.fn();
    getByName = jest.fn();
    delete = jest.fn();
    seedDefaultData = jest.fn();
  },
}));

// Import after mock
import { InboxCategoryService } from '../services/inbox-category.service.js';

describe('InboxCategoryController', () => {
  let controller: InboxCategoryController;
  let mockInboxCategoryService: jest.Mocked<InboxCategoryService>;

  // Mock user data
  const mockUser = {
    uid: 'test-user-uid',
    email: 'test@example.com',
    nickname: 'Test User',
  };

  // Mock category data
  const mockCategories = [
    {
      id: 1,
      uid: 'test-user-uid',
      name: 'backend',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 2,
      uid: 'test-user-uid',
      name: 'frontend',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-02'),
    },
  ];

  beforeEach(() => {
    // Create mock service
    mockInboxCategoryService = {
      list: jest.fn(),
      create: jest.fn(),
      getByName: jest.fn(),
      delete: jest.fn(),
      seedDefaultData: jest.fn(),
    } as unknown as jest.Mocked<InboxCategoryService>;

    // Create controller with mock service
    controller = new InboxCategoryController(mockInboxCategoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listCategories', () => {
    it('should return list of categories for authenticated user', async () => {
      mockInboxCategoryService.list.mockResolvedValue(mockCategories);

      const result = await controller.listCategories(mockUser);

      expect(mockInboxCategoryService.list).toHaveBeenCalledWith(mockUser.uid);
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.categories).toEqual(mockCategories);
      expect(result.data!.total).toBe(2);
    });

    it('should return unauthorized error when user is not authenticated', async () => {
      const result = await controller.listCategories(undefined);

      expect(mockInboxCategoryService.list).not.toHaveBeenCalled();
      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('should return database error when service throws', async () => {
      mockInboxCategoryService.list.mockRejectedValue(new Error('Database error'));

      const result = await controller.listCategories(mockUser);

      expect(result.code).toBe(ErrorCode.DB_ERROR);
    });
  });

  describe('createCategory', () => {
    it('should create a new category for authenticated user', async () => {
      const dto = { name: 'design' };
      const createdCategory = {
        id: 3,
        uid: 'test-user-uid',
        name: 'design',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInboxCategoryService.create.mockResolvedValue(createdCategory);

      const result = await controller.createCategory(dto, mockUser);

      expect(mockInboxCategoryService.create).toHaveBeenCalledWith(mockUser.uid, 'design');
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).toEqual(createdCategory);
    });

    it('should trim whitespace from category name', async () => {
      const dto = { name: '  design  ' };
      const createdCategory = {
        id: 3,
        uid: 'test-user-uid',
        name: 'design',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInboxCategoryService.create.mockResolvedValue(createdCategory);

      const result = await controller.createCategory(dto, mockUser);

      expect(mockInboxCategoryService.create).toHaveBeenCalledWith(mockUser.uid, 'design');
      expect(result.code).toBe(ErrorCode.SUCCESS);
    });

    it('should return unauthorized error when user is not authenticated', async () => {
      const dto = { name: 'design' };

      const result = await controller.createCategory(dto, undefined);

      expect(mockInboxCategoryService.create).not.toHaveBeenCalled();
      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('should return params error when name is empty', async () => {
      const dto = { name: '' };

      const result = await controller.createCategory(dto, mockUser);

      expect(mockInboxCategoryService.create).not.toHaveBeenCalled();
      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
    });

    it('should return params error when name is only whitespace', async () => {
      const dto = { name: '   ' };

      const result = await controller.createCategory(dto, mockUser);

      expect(mockInboxCategoryService.create).not.toHaveBeenCalled();
      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
    });

    it('should return database error when service throws', async () => {
      const dto = { name: 'design' };
      mockInboxCategoryService.create.mockRejectedValue(new Error('Database error'));

      const result = await controller.createCategory(dto, mockUser);

      expect(result.code).toBe(ErrorCode.DB_ERROR);
    });
  });
});
