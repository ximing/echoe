import * as crypto from 'crypto';
import { Service } from 'typedi';
import { eq, and, isNull } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { apiToken } from '../db/schema/api-token.js';
import { generateApiTokenId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { InboxMetricsService } from './inbox-metrics.service.js';

import type { ApiToken, NewApiToken } from '../db/schema/api-token.js';

@Service()
export class ApiTokenService {
  constructor(private metricsService: InboxMetricsService) {}
  /**
   * Create a new API token for a user
   * Returns plaintext token once, stores only SHA256 hash
   */
  async createToken(uid: string, name: string): Promise<{ tokenId: string; plaintextToken: string }> {
    try {
      const db = getDatabase();

      // Generate token ID and plaintext token
      const tokenId = generateApiTokenId();
      const plaintextToken = this.generatePlaintextToken();

      // Hash the plaintext token with SHA256
      const tokenHash = this.hashToken(plaintextToken);

      // Create new token record
      const newToken: NewApiToken = {
        tokenId,
        uid,
        name,
        tokenHash,
      };

      await db.insert(apiToken).values(newToken);

      logger.info(`API token created for user ${uid}: ${tokenId}`);
      this.metricsService.trackTokenCreate(uid, tokenId);

      return { tokenId, plaintextToken };
    } catch (error) {
      logger.error('Error creating API token:', error);
      throw error;
    }
  }

  /**
   * List all active tokens for a user (excluding soft-deleted)
   */
  async listTokens(uid: string): Promise<ApiToken[]> {
    try {
      const db = getDatabase();

      const results = await db
        .select()
        .from(apiToken)
        .where(and(eq(apiToken.uid, uid), isNull(apiToken.deletedAt)))
        .limit(100);

      return results;
    } catch (error) {
      logger.error('Error listing API tokens:', error);
      throw error;
    }
  }

  /**
   * Delete (soft-delete) an API token
   */
  async deleteToken(uid: string, tokenId: string): Promise<boolean> {
    try {
      const db = getDatabase();

      // Check if token exists and belongs to user
      const existingToken = await this.findTokenByIdAndUid(uid, tokenId);
      if (!existingToken) {
        throw new Error('Token not found');
      }

      // Soft delete by setting deletedAt timestamp
      await db
        .update(apiToken)
        .set({ deletedAt: new Date() })
        .where(and(eq(apiToken.tokenId, tokenId), eq(apiToken.uid, uid), isNull(apiToken.deletedAt)));

      logger.info(`API token deleted for user ${uid}: ${tokenId}`);

      return true;
    } catch (error) {
      logger.error('Error deleting API token:', error);
      throw error;
    }
  }

  /**
   * Find a token by ID and UID (for validation or ownership check)
   */
  async findTokenByIdAndUid(uid: string, tokenId: string): Promise<ApiToken | null> {
    try {
      const db = getDatabase();

      const results = await db
        .select()
        .from(apiToken)
        .where(and(eq(apiToken.uid, uid), eq(apiToken.tokenId, tokenId), isNull(apiToken.deletedAt)))
        .limit(1);

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      logger.error('Error finding API token:', error);
      throw error;
    }
  }

  /**
   * Validate a plaintext token against stored hash
   */
  async validateToken(plaintextToken: string): Promise<ApiToken | null> {
    try {
      const db = getDatabase();
      const tokenHash = this.hashToken(plaintextToken);

      const results = await db
        .select()
        .from(apiToken)
        .where(and(eq(apiToken.tokenHash, tokenHash), isNull(apiToken.deletedAt)))
        .limit(1);

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      logger.error('Error validating API token:', error);
      throw error;
    }
  }

  /**
   * Generate a random plaintext token (40 characters, hex format)
   */
  private generatePlaintextToken(): string {
    return crypto.randomBytes(20).toString('hex');
  }

  /**
   * Hash a token using SHA256
   */
  private hashToken(plaintextToken: string): string {
    return crypto.createHash('sha256').update(plaintextToken).digest('hex');
  }
}
