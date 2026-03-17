import 'reflect-metadata';

import { ErrorCode } from '../constants/error-codes.js';
import { InboxSourceController } from '../controllers/v1/inbox-source.controller.js';

// Mock the InboxSourceService
jest.mock('../services/inbox-source.service.js', () => ({
  InboxSourceService: class MockInboxSourceService {
    list = jest.fn();
    create = jest.fn();
    getByName = jest.fn();
    delete = jest.fn();
    seedDefaultData = jest.fn();
  },
}));

// Import after mock
import { InboxSourceService } from '../services/inbox-source.service.js';

describe('InboxSourceController', () => {
  let controller: InboxSourceController;
  let mockInboxSourceService: jest.Mocked<InboxSourceService>;

  // Mock user data
  const mockUser = {
    uid: 'test-user-uid',
    email: 'test@example.com',
    nickname: 'Test User',
  };

  // Mock source data
  const mockSources = [
    {
      id: 1,
      uid: 'test-user-uid',
      name: 'manual',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 2,
      uid: 'test-user-uid',
      name: 'web',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
    },
  ];

  beforeEach(() => {
    // Create mock service
    mockInboxSourceService = {
      list: jest.fn(),
      create: jest.fn(),
      getByName: jest.fn(),
      delete: jest.fn(),
      seedDefaultData: jest.fn(),
    } as unknown as jest.Mocked<InboxSourceService>;

    // Create controller with mock service
    controller = new InboxSourceController(mockInboxSourceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listSources', () => {
    it('should return list of sources for authenticated user', async () => {
      mockInboxSourceService.list.mockResolvedValue(mockSources);

      const result = await controller.listSources(mockUser);

      expect(mockInboxSourceService.list).toHaveBeenCalledWith(mockUser.uid);
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.sources).toEqual(mockSources);
      expect(result.data!.total).toBe(2);
    });

    it('should return unauthorized error when user is not authenticated', async () => {
      const result = await controller.listSources(undefined);

      expect(mockInboxSourceService.list).not.toHaveBeenCalled();
      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('should return database error when service throws', async () => {
      mockInboxSourceService.list.mockRejectedValue(new Error('Database error'));

      const result = await controller.listSources(mockUser);

      expect(result.code).toBe(ErrorCode.DB_ERROR);
    });
  });

  describe('createSource', () => {
    it('should create a new source for authenticated user', async () => {
      const dto = { name: 'api' };
      const createdSource = {
        id: 3,
        uid: 'test-user-uid',
        name: 'api',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInboxSourceService.create.mockResolvedValue(createdSource);

      const result = await controller.createSource(dto, mockUser);

      expect(mockInboxSourceService.create).toHaveBeenCalledWith(mockUser.uid, 'api');
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).toEqual(createdSource);
    });

    it('should trim whitespace from source name', async () => {
      const dto = { name: '  api  ' };
      const createdSource = {
        id: 3,
        uid: 'test-user-uid',
        name: 'api',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInboxSourceService.create.mockResolvedValue(createdSource);

      const result = await controller.createSource(dto, mockUser);

      expect(mockInboxSourceService.create).toHaveBeenCalledWith(mockUser.uid, 'api');
      expect(result.code).toBe(ErrorCode.SUCCESS);
    });

    it('should return unauthorized error when user is not authenticated', async () => {
      const dto = { name: 'api' };

      const result = await controller.createSource(dto, undefined);

      expect(mockInboxSourceService.create).not.toHaveBeenCalled();
      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('should return params error when name is empty', async () => {
      const dto = { name: '' };

      const result = await controller.createSource(dto, mockUser);

      expect(mockInboxSourceService.create).not.toHaveBeenCalled();
      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
    });

    it('should return params error when name is only whitespace', async () => {
      const dto = { name: '   ' };

      const result = await controller.createSource(dto, mockUser);

      expect(mockInboxSourceService.create).not.toHaveBeenCalled();
      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
    });

    it('should return database error when service throws', async () => {
      const dto = { name: 'api' };
      mockInboxSourceService.create.mockRejectedValue(new Error('Database error'));

      const result = await controller.createSource(dto, mockUser);

      expect(result.code).toBe(ErrorCode.DB_ERROR);
    });
  });
});
