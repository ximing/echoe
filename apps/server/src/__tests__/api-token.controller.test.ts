import 'reflect-metadata';

import { ErrorCode } from '../constants/error-codes.js';
import { ApiTokenController } from '../controllers/v1/api-token.controller.js';

// Mock the ApiTokenService
jest.mock('../services/api-token.service.js', () => ({
  ApiTokenService: class MockApiTokenService {
    createToken = jest.fn();
    listTokens = jest.fn();
    deleteToken = jest.fn();
  },
}));

// Import after mock
import { ApiTokenService } from '../services/api-token.service.js';

describe('ApiTokenController', () => {
  let controller: ApiTokenController;
  let mockApiTokenService: jest.Mocked<ApiTokenService>;

  // Mock user data
  const mockUser = {
    uid: 'test-user-uid',
    email: 'test@example.com',
    nickname: 'Test User',
  };

  // Mock API token data
  const mockTokens = [
    {
      tokenId: 'at1234567890',
      uid: 'test-user-uid',
      name: 'Token 1',
      tokenHash: 'hash1',
      deletedAt: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      tokenId: 'at0987654321',
      uid: 'test-user-uid',
      name: 'Token 2',
      tokenHash: 'hash2',
      deletedAt: null,
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
    },
  ];

  beforeEach(() => {
    // Create mock service
    mockApiTokenService = {
      createToken: jest.fn(),
      listTokens: jest.fn(),
      deleteToken: jest.fn(),
      findTokenByIdAndUid: jest.fn(),
      validateToken: jest.fn(),
    } as unknown as jest.Mocked<ApiTokenService>;

    // Create controller with mock service
    controller = new ApiTokenController(mockApiTokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/api-tokens', () => {
    it('should list tokens for authenticated user with JWT', async () => {
      // Setup mock
      mockApiTokenService.listTokens.mockResolvedValue(mockTokens);

      // Create mock request with JWT auth (no apiTokenId)
      const mockRequest = {
        apiTokenId: undefined, // JWT auth
      } as any;

      // Call controller
      const result = await controller.listTokens(mockUser, mockRequest);

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.tokens).toHaveLength(2);
      expect(result.data!.total).toBe(2);
      expect(mockApiTokenService.listTokens).toHaveBeenCalledWith(mockUser.uid);
    });

    it('should reject API token authentication', async () => {
      // Create mock request with API token auth
      const mockRequest = {
        apiTokenId: 'at1234567890', // API token auth
      } as any;

      // Call controller
      const result = await controller.listTokens(mockUser, mockRequest);

      // Verify
      expect(result.code).toBe(ErrorCode.FORBIDDEN);
      expect(mockApiTokenService.listTokens).not.toHaveBeenCalled();
    });

    it('should return empty array when user has no tokens', async () => {
      mockApiTokenService.listTokens.mockResolvedValue([]);

      const mockRequest = {
        apiTokenId: undefined,
      } as any;

      const result = await controller.listTokens(mockUser, mockRequest);

      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.tokens).toHaveLength(0);
      expect(result.data!.total).toBe(0);
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const mockRequest = {
        apiTokenId: undefined,
      } as any;

      const result = await controller.listTokens({} as any, mockRequest);

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('POST /api/v1/api-tokens', () => {
    it('should create token and return plaintext once with JWT', async () => {
      // Setup mock
      const createResult = {
        tokenId: 'atnewtoken123',
        plaintextToken: 'a'.repeat(40),
      };
      mockApiTokenService.createToken.mockResolvedValue(createResult);
      mockApiTokenService.listTokens.mockResolvedValue([
        {
          ...mockTokens[0],
          tokenId: createResult.tokenId,
          name: 'New Token',
          createdAt: new Date(),
        },
      ]);

      // Create mock request with JWT auth
      const mockRequest = {
        apiTokenId: undefined, // JWT auth
      } as any;

      // Call controller
      const result = await controller.createToken({ name: 'New Token' }, mockUser, mockRequest);

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(result.data).not.toBeNull();
      expect(result.data!.token.token).toBe(createResult.plaintextToken);
      expect(result.data!.token.tokenId).toBe(createResult.tokenId);
      expect(result.data!.message).toContain('not be shown again');
      expect(mockApiTokenService.createToken).toHaveBeenCalledWith(mockUser.uid, 'New Token');
    });

    it('should reject API token authentication for creating tokens', async () => {
      // Create mock request with API token auth
      const mockRequest = {
        apiTokenId: 'at1234567890', // API token auth
      } as any;

      // Call controller
      const result = await controller.createToken({ name: 'New Token' }, mockUser, mockRequest);

      // Verify
      expect(result.code).toBe(ErrorCode.FORBIDDEN);
      expect(mockApiTokenService.createToken).not.toHaveBeenCalled();
    });

    it('should return error when token name is empty', async () => {
      const mockRequest = {
        apiTokenId: undefined,
      } as any;

      const result = await controller.createToken({ name: '' }, mockUser, mockRequest);

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
    });

    it('should return error when token name exceeds 255 characters', async () => {
      const mockRequest = {
        apiTokenId: undefined,
      } as any;

      const result = await controller.createToken({ name: 'a'.repeat(256) }, mockUser, mockRequest);

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
    });

    it('should trim whitespace from token name', async () => {
      const createResult = {
        tokenId: 'atnewtoken123',
        plaintextToken: 'a'.repeat(40),
      };
      mockApiTokenService.createToken.mockResolvedValue(createResult);
      mockApiTokenService.listTokens.mockResolvedValue([
        {
          ...mockTokens[0],
          tokenId: createResult.tokenId,
          name: 'Trimmed Token',
          createdAt: new Date(),
        },
      ]);

      const mockRequest = {
        apiTokenId: undefined,
      } as any;

      const result = await controller.createToken({ name: '  Trimmed Token  ' }, mockUser, mockRequest);

      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(mockApiTokenService.createToken).toHaveBeenCalledWith(mockUser.uid, 'Trimmed Token');
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const mockRequest = {
        apiTokenId: undefined,
      } as any;

      const result = await controller.createToken({ name: 'New Token' }, {} as any, mockRequest);

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('DELETE /api/v1/api-tokens/:tokenId', () => {
    it('should delete token with JWT auth', async () => {
      // Setup mock
      mockApiTokenService.deleteToken.mockResolvedValue(true);

      // Create mock request with JWT auth
      const mockRequest = {
        apiTokenId: undefined, // JWT auth
      } as any;

      // Call controller
      const result = await controller.deleteToken('at1234567890', mockUser, mockRequest);

      // Verify
      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(mockApiTokenService.deleteToken).toHaveBeenCalledWith(mockUser.uid, 'at1234567890');
    });

    it('should reject API token authentication for deleting tokens', async () => {
      // Create mock request with API token auth
      const mockRequest = {
        apiTokenId: 'at1234567890', // API token auth
      } as any;

      // Call controller
      const result = await controller.deleteToken('at1234567890', mockUser, mockRequest);

      // Verify
      expect(result.code).toBe(ErrorCode.FORBIDDEN);
      expect(mockApiTokenService.deleteToken).not.toHaveBeenCalled();
    });

    it('should return error when tokenId is empty', async () => {
      const mockRequest = {
        apiTokenId: undefined,
      } as any;

      const result = await controller.deleteToken('', mockUser, mockRequest);

      expect(result.code).toBe(ErrorCode.PARAMS_ERROR);
    });

    it('should return not found when token does not exist', async () => {
      mockApiTokenService.deleteToken.mockImplementation(() => {
        throw new Error('Token not found');
      });

      const mockRequest = {
        apiTokenId: undefined,
      } as any;

      const result = await controller.deleteToken('nonexistent', mockUser, mockRequest);

      expect(result.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should trim whitespace from tokenId', async () => {
      mockApiTokenService.deleteToken.mockResolvedValue(true);

      const mockRequest = {
        apiTokenId: undefined,
      } as any;

      const result = await controller.deleteToken('  at1234567890  ', mockUser, mockRequest);

      expect(result.code).toBe(ErrorCode.SUCCESS);
      expect(mockApiTokenService.deleteToken).toHaveBeenCalledWith(mockUser.uid, 'at1234567890');
    });

    it('should return unauthorized when user is not authenticated', async () => {
      const mockRequest = {
        apiTokenId: undefined,
      } as any;

      const result = await controller.deleteToken('at1234567890', {} as any, mockRequest);

      expect(result.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });
});
