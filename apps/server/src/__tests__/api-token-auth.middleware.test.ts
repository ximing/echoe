import 'reflect-metadata';

import type { Request, Response, NextFunction } from 'express';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('drizzle-orm', () => {
  return {
    and: jest.fn((...args) => args),
    eq: jest.fn((col, val) => ({ col, val })),
    isNull: jest.fn((col) => ({ col, op: 'isNull' })),
  };
});

import { Container } from 'typedi';
import { apiTokenAuthMiddleware } from '../middlewares/api-token-auth.middleware.js';
import { ApiTokenService } from '../services/api-token.service.js';
import { UserService } from '../services/user.service.js';

describe('ApiTokenAuthMiddleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;
  let mockSend: jest.Mock;

  beforeEach(() => {
    // Reset Container
    Container.reset();

    // Mock request
    mockRequest = {
      headers: {},
    };

    // Mock response
    mockStatus = jest.fn().mockReturnThis();
    mockJson = jest.fn().mockReturnThis();
    mockSend = jest.fn().mockReturnThis();
    mockResponse = {
      status: mockStatus,
      json: mockJson,
      send: mockSend,
    };

    // Mock next function
    nextFunction = jest.fn();
  });

  const setupMocks = (apiToken: any | null, user: any | null) => {
    const mockApiTokenService = {
      validateToken: jest.fn().mockResolvedValue(apiToken),
    } as unknown as ApiTokenService;

    const mockUserService = {
      findUserByUid: jest.fn().mockResolvedValue(user),
    } as unknown as UserService;

    Container.set(ApiTokenService, mockApiTokenService);
    Container.set(UserService, mockUserService);

    return { mockApiTokenService, mockUserService };
  };

  describe('when no Authorization header is present', () => {
    it('should call next() and not set user', async () => {
      mockRequest.headers = {};

      await apiTokenAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });
  });

  describe('when Authorization header is not Bearer format', () => {
    it('should call next() for Basic auth', async () => {
      mockRequest.headers = {
        authorization: 'Basic dXNlcjpwYXNz',
      };

      await apiTokenAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });

    it('should call next() for invalid format', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat',
      };

      await apiTokenAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });

    it('should call next() when Bearer token is empty', async () => {
      mockRequest.headers = {
        authorization: 'Bearer ',
      };

      await apiTokenAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });
  });

  describe('when Bearer token is invalid', () => {
    it('should call next() when token is not found in database', async () => {
      const { mockApiTokenService } = setupMocks(null, null);

      mockRequest.headers = {
        authorization: 'Bearer invalid-token-12345',
      };

      await apiTokenAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockApiTokenService.validateToken).toHaveBeenCalledWith('invalid-token-12345');
      expect(mockRequest.user).toBeUndefined();
    });

    it('should return 401 when user is not found', async () => {
      const apiToken = { tokenId: 'at123', uid: 'user-uid', name: 'Test Token' };
      setupMocks(apiToken, null);

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      await apiTokenAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token: user not found or deleted',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when user is soft-deleted', async () => {
      const apiToken = { tokenId: 'at123', uid: 'user-uid', name: 'Test Token' };
      const deletedUser = { uid: 'user-uid', email: 'test@test.com', deletedAt: Date.now() };
      setupMocks(apiToken, deletedUser);

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      await apiTokenAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token: user not found or deleted',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('when Bearer token is valid', () => {
    it('should set user on request and call next()', async () => {
      const apiToken = { tokenId: 'at123', uid: 'user-uid', name: 'Test Token' };
      const user = { uid: 'user-uid', email: 'test@test.com', nickname: 'Test User', deletedAt: 0 };
      const { mockApiTokenService } = setupMocks(apiToken, user);

      mockRequest.headers = {
        authorization: 'Bearer valid-token-12345',
      };

      await apiTokenAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockApiTokenService.validateToken).toHaveBeenCalledWith('valid-token-12345');
      expect(mockRequest.user).toEqual({
        uid: 'user-uid',
        email: 'test@test.com',
        nickname: 'Test User',
      });
      expect(mockRequest.apiTokenId).toBe('at123');
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should set user without optional fields when not present', async () => {
      const apiToken = { tokenId: 'at456', uid: 'user-uid-2', name: 'Test Token 2' };
      const user = { uid: 'user-uid-2', deletedAt: 0 };
      setupMocks(apiToken, user);

      mockRequest.headers = {
        authorization: 'Bearer another-valid-token',
      };

      await apiTokenAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockRequest.user).toEqual({
        uid: 'user-uid-2',
      });
      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('Token > JWT priority', () => {
    it('should allow pre-set user to bypass JWT check', async () => {
      // This test verifies that when request.user is already set,
      // the authHandler should skip JWT authentication
      const apiToken = { tokenId: 'at789', uid: 'user-uid-3', name: 'Test Token 3' };
      const user = { uid: 'user-uid-3', email: 'priority@test.com', deletedAt: 0 };
      setupMocks(apiToken, user);

      // Pre-set user (simulating what happens when token auth runs before JWT)
      mockRequest.user = {
        uid: 'pre-set-user',
        email: 'pre-set@test.com',
      };

      mockRequest.headers = {
        authorization: 'Bearer new-token',
      };

      await apiTokenAuthMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // The middleware should still process the new token and override user
      // This ensures Token > JWT priority works correctly
      expect(mockRequest.user).toEqual({
        uid: 'user-uid-3',
        email: 'priority@test.com',
      });
      expect(nextFunction).toHaveBeenCalled();
    });
  });
});
