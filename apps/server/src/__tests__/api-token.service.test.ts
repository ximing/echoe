import 'reflect-metadata';
import * as crypto from 'crypto';

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

import { getDatabase } from '../db/connection.js';
import { ApiTokenService } from '../services/api-token.service.js';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

describe('ApiTokenService', () => {
  let service: ApiTokenService;
  let mockMetricsService: any;

  beforeEach(() => {
    mockMetricsService = {
      trackTokenCreate: jest.fn(),
    };
    service = new ApiTokenService(mockMetricsService);
    mockedGetDatabase.mockClear();
  });

  describe('createToken', () => {
    it('should create a token and return plaintext once', async () => {
      let insertedData: any;
      const mockValuesFn = jest.fn().mockImplementation((data: any) => {
        insertedData = data;
        return Promise.resolve();
      });

      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: mockValuesFn,
        }),
        update: jest.fn(),
      } as any);

      const result = await service.createToken('test-uid', 'My Token');

      // Verify token ID starts with 'at' prefix (API_TOKEN type)
      expect(result.tokenId).toMatch(/^at/);

      // Verify plaintext token is 40 hex characters (20 bytes)
      expect(result.plaintextToken).toMatch(/^[0-9a-f]{40}$/);

      // Verify data was inserted
      expect(insertedData.uid).toBe('test-uid');
      expect(insertedData.name).toBe('My Token');
      expect(insertedData.tokenId).toMatch(/^at/);
      expect(insertedData.tokenHash).toBe(crypto.createHash('sha256').update(result.plaintextToken).digest('hex'));
    });

    it('should generate unique plaintext tokens', async () => {
      const mockValuesFn = jest.fn().mockResolvedValue(undefined);

      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: mockValuesFn,
        }),
        update: jest.fn(),
      } as any);

      const result1 = await service.createToken('test-uid-1', 'Token 1');
      const result2 = await service.createToken('test-uid-2', 'Token 2');

      // Plaintext tokens should be unique
      expect(result1.plaintextToken).not.toBe(result2.plaintextToken);
    });
  });

  describe('listTokens', () => {
    it('should return tokens for a user', async () => {
      const mockTokens = [
        { tokenId: 'at123', uid: 'test-uid', name: 'Token 1', tokenHash: 'hash1', createdAt: new Date() },
        { tokenId: 'at456', uid: 'test-uid', name: 'Token 2', tokenHash: 'hash2', createdAt: new Date() },
      ];

      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(mockTokens),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      const result = await service.listTokens('test-uid');

      expect(result).toEqual(mockTokens);
    });

    it('should return empty array when no tokens exist', async () => {
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

      const result = await service.listTokens('test-uid');

      expect(result).toEqual([]);
    });
  });

  describe('deleteToken', () => {
    it('should soft-delete a token', async () => {
      const mockToken = { tokenId: 'at123', uid: 'test-uid', name: 'Token 1', tokenHash: 'hash1' };

      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockToken]),
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

      const result = await service.deleteToken('test-uid', 'at123');

      expect(result).toBe(true);
    });

    it('should throw error if token not found', async () => {
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

      await expect(service.deleteToken('test-uid', 'nonexistent')).rejects.toThrow('Token not found');
    });
  });

  describe('validateToken', () => {
    it('should validate a correct token', async () => {
      const mockToken = { tokenId: 'at123', uid: 'test-uid', name: 'Token 1', tokenHash: 'hash1' };

      mockedGetDatabase.mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockToken]),
            }),
          }),
        }),
        insert: jest.fn(),
        update: jest.fn(),
      } as any);

      const plaintextToken = 'a'.repeat(40);
      const result = await service.validateToken(plaintextToken);

      expect(result).toEqual(mockToken);
    });

    it('should return null for invalid token', async () => {
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

      const result = await service.validateToken('invalid-token');

      expect(result).toBeNull();
    });
  });

  describe('token hashing', () => {
    it('should hash tokens consistently with SHA256', async () => {
      const testToken = 'test-token-12345';
      const hash1 = crypto.createHash('sha256').update(testToken).digest('hex');
      const hash2 = crypto.createHash('sha256').update(testToken).digest('hex');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 64 hex characters
    });

    it('should produce different hashes for different tokens', async () => {
      const token1 = 'token1';
      const token2 = 'token2';

      const hash1 = crypto.createHash('sha256').update(token1).digest('hex');
      const hash2 = crypto.createHash('sha256').update(token2).digest('hex');

      expect(hash1).not.toBe(hash2);
    });
  });
});
