import 'reflect-metadata';

import { ErrorCode } from '../constants/error-codes.js';
import { InboxController } from '../controllers/v1/inbox.controller.js';
import { InboxCategory, InboxSource } from '@echoe/dto';

// Mock the InboxService
jest.mock('../services/inbox.service.js', () => ({
  InboxService: class MockInboxService {
    create = jest.fn();
    list = jest.fn();
    update = jest.fn();
    delete = jest.fn();
    markRead = jest.fn();
    markReadAll = jest.fn();
    findByIdAndUid = jest.fn();
  },
}));

// Import after mock
import { InboxService } from '../services/inbox.service.js';

describe('InboxController', () => {
  let controller: InboxController;
  let mockInboxService: jest.Mocked<InboxService>;

  // Mock user data
  const mockUser = {
    uid: 'test-user-uid',
    email: 'test@example.com',
    nickname: 'Test User',
  };

  // Mock inbox item data
  const mockInboxItems = [
    {
      inboxId: 'i1234567890',
      uid: 'test-user-uid',
      front: 'Front content 1',
      back: 'Back content 1',
      source: 'manual',
      category: 'backend',
      isRead: 0,
      deletedAt: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      inboxId: 'i0987654321',
      uid: 'test-user-uid',
      front: 'Front content 2',
      back: 'Back content 2',
      source: 'web',
      category: 'frontend',
      isRead: 1,
      deletedAt: null,
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
    },
  ];

  beforeEach(() => {
    // Create mock service
    mockInboxService = {
      create: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      markRead: jest.fn(),
      markReadAll: jest.fn(),
      findByIdAndUid: jest.fn(),
    } as unknown as jest.Mocked<InboxService>;

    // Create controller with mock service
    controller = new InboxController(mockInboxService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/inbox', () => {
    it('should list inbox items for authenticated user', async () => {
      // Setup mock
      const listResult = {
        items: mockInboxItems,
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };
      mockInboxService.list.mockResolvedValue(listResult);

      // Call controller
      const result = await controller.getInboxItems(
        undefined, // category
        undefined, // isRead
        1, // page
        20, // limit
        mockUser
      );

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.items).toHaveLength(2);
      expect(result.data!.total).toBe(2);
      expect(mockInboxService.list).toHaveBeenCalledWith(mockUser.uid, {
        category: undefined,
        isRead: undefined,
        page: 1,
        pageSize: 20,
      });
    });

    it('should filter by category and isRead', async () => {
      // Setup mock
      mockInboxService.list.mockResolvedValue({
        items: [mockInboxItems[0]],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      // Call controller
      const result = await controller.getInboxItems(
        'backend', // category
        0, // isRead (unread)
        1,
        20,
        mockUser
      );

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(mockInboxService.list).toHaveBeenCalledWith(mockUser.uid, {
        category: 'backend',
        isRead: 0,
        page: 1,
        pageSize: 20,
      });
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.getInboxItems(
        undefined,
        undefined,
        1,
        20,
        undefined
      );

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('should return empty array when user has no inbox items', async () => {
      mockInboxService.list.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });

      const result = await controller.getInboxItems(
        undefined,
        undefined,
        1,
        20,
        mockUser
      );

      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data!.items).toHaveLength(0);
      expect(result.data!.total).toBe(0);
    });
  });

  describe('GET /api/v1/inbox/:inboxId', () => {
    it('should return inbox item by ID', async () => {
      // Setup mock
      mockInboxService.findByIdAndUid.mockResolvedValue(mockInboxItems[0]);

      // Call controller
      const result = await controller.getInboxById('i1234567890', mockUser);

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.inboxId).toBe('i1234567890');
      expect(mockInboxService.findByIdAndUid).toHaveBeenCalledWith(mockUser.uid, 'i1234567890');
    });

    it('should return not found when inbox item does not exist', async () => {
      mockInboxService.findByIdAndUid.mockResolvedValue(null);

      const result = await controller.getInboxById('nonexistent', mockUser);

      expect(result.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.getInboxById('i1234567890', undefined);

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('POST /api/v1/inbox', () => {
    it('should create inbox item', async () => {
      // Setup mock
      mockInboxService.create.mockResolvedValue(mockInboxItems[0]);

      // Call controller
      const result = await controller.createInboxItem(
        {
          front: 'Front content 1',
          back: 'Back content 1',
          source: InboxSource.MANUAL,
          category: InboxCategory.BACKEND,
        },
        mockUser
      );

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.front).toBe('Front content 1');
      expect(mockInboxService.create).toHaveBeenCalledWith(mockUser.uid, {
        front: 'Front content 1',
        back: 'Back content 1',
        source: InboxSource.MANUAL,
        category: InboxCategory.BACKEND,
      });
    });

    it('should return error when front is empty', async () => {
      const result = await controller.createInboxItem(
        {
          front: '',
          back: 'Back content',
        },
        mockUser
      );

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(mockInboxService.create).not.toHaveBeenCalled();
    });

    it('should return error when back is empty', async () => {
      const result = await controller.createInboxItem(
        {
          front: 'Front content',
          back: '',
        },
        mockUser
      );

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(mockInboxService.create).not.toHaveBeenCalled();
    });

    it('should return error when front is missing', async () => {
      const result = await controller.createInboxItem(
        {
          back: 'Back content',
        } as any,
        mockUser
      );

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(mockInboxService.create).not.toHaveBeenCalled();
    });

    it('should return error when back is missing', async () => {
      const result = await controller.createInboxItem(
        {
          front: 'Front content',
        } as any,
        mockUser
      );

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
      expect(mockInboxService.create).not.toHaveBeenCalled();
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.createInboxItem(
        {
          front: 'Front content',
          back: 'Back content',
        },
        undefined
      );

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('PUT /api/v1/inbox/:inboxId', () => {
    it('should update inbox item', async () => {
      // Setup mock
      const updatedItem = { ...mockInboxItems[0], front: 'Updated front' };
      mockInboxService.update.mockResolvedValue(updatedItem);

      // Call controller
      const result = await controller.updateInboxItem(
        'i1234567890',
        { front: 'Updated front' },
        mockUser
      );

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data!.front).toBe('Updated front');
      expect(mockInboxService.update).toHaveBeenCalledWith(mockUser.uid, 'i1234567890', {
        front: 'Updated front',
      });
    });

    it('should return not found when inbox item does not exist', async () => {
      mockInboxService.update.mockImplementation(() => {
        throw new Error('Inbox item not found');
      });

      const result = await controller.updateInboxItem(
        'nonexistent',
        { front: 'Updated front' },
        mockUser
      );

      expect(result.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.updateInboxItem(
        'i1234567890',
        { front: 'Updated front' },
        undefined
      );

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('DELETE /api/v1/inbox/:inboxId', () => {
    it('should delete inbox item', async () => {
      // Setup mock
      mockInboxService.delete.mockResolvedValue(true);

      // Call controller
      const result = await controller.deleteInboxItem('i1234567890', mockUser);

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data!.success).toBe(true);
      expect(mockInboxService.delete).toHaveBeenCalledWith(mockUser.uid, 'i1234567890');
    });

    it('should return not found when inbox item does not exist', async () => {
      mockInboxService.delete.mockImplementation(() => {
        throw new Error('Inbox item not found');
      });

      const result = await controller.deleteInboxItem('nonexistent', mockUser);

      expect(result.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.deleteInboxItem('i1234567890', undefined);

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('POST /api/v1/inbox/:inboxId/read', () => {
    it('should mark inbox item as read', async () => {
      // Setup mock
      const readItem = { ...mockInboxItems[0], isRead: 1 };
      mockInboxService.markRead.mockResolvedValue(readItem);

      // Call controller
      const result = await controller.markAsRead('i1234567890', mockUser);

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data!.isRead).toBe(1);
      expect(mockInboxService.markRead).toHaveBeenCalledWith(mockUser.uid, 'i1234567890');
    });

    it('should return not found when inbox item does not exist', async () => {
      mockInboxService.markRead.mockImplementation(() => {
        throw new Error('Inbox item not found');
      });

      const result = await controller.markAsRead('nonexistent', mockUser);

      expect(result.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.markAsRead('i1234567890', undefined);

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('POST /api/v1/inbox/read-all', () => {
    it('should mark all inbox items as read', async () => {
      // Setup mock
      mockInboxService.markReadAll.mockResolvedValue({ updatedCount: 5 });

      // Call controller
      const result = await controller.markAllAsRead(mockUser);

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data!.updatedCount).toBe(5);
      expect(mockInboxService.markReadAll).toHaveBeenCalledWith(mockUser.uid);
    });

    it('should return 0 when no unread items exist', async () => {
      mockInboxService.markReadAll.mockResolvedValue({ updatedCount: 0 });

      const result = await controller.markAllAsRead(mockUser);

      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data!.updatedCount).toBe(0);
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const result = await controller.markAllAsRead(undefined);

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });
});
