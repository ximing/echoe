import { Service } from 'typedi';
import { eq, and, sql } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { inboxSource } from '../db/schema/inbox-source.js';
import { logger } from '../utils/logger.js';

import type { InboxSource, NewInboxSource } from '../db/schema/inbox-source.js';

/**
 * Default source values to seed on first access
 */
const DEFAULT_SOURCES = ['manual', 'web', 'api', 'extension', 'other'];

@Service()
export class InboxSourceService {
  /**
   * Get all sources for a user
   */
  async list(uid: string): Promise<InboxSource[]> {
    try {
      const db = getDatabase();

      // Ensure default sources exist for this user
      await this.seedDefaultData(uid);

      const sources = await db
        .select()
        .from(inboxSource)
        .where(eq(inboxSource.uid, uid))
        .orderBy(inboxSource.createdAt);

      return sources;
    } catch (error) {
      logger.error('Error listing inbox sources:', error);
      throw error;
    }
  }

  /**
   * Get a source by name for a user
   */
  async getByName(uid: string, name: string): Promise<InboxSource | null> {
    try {
      const db = getDatabase();

      const [source] = await db
        .select()
        .from(inboxSource)
        .where(and(eq(inboxSource.uid, uid), eq(inboxSource.name, name)))
        .limit(1);

      return source || null;
    } catch (error) {
      logger.error('Error getting inbox source by name:', error);
      throw error;
    }
  }

  /**
   * Create a new source for a user
   */
  async create(uid: string, name: string): Promise<InboxSource> {
    try {
      const db = getDatabase();

      // Check if source already exists
      const existing = await this.getByName(uid, name);
      if (existing) {
        return existing;
      }

      const newSource: NewInboxSource = {
        uid,
        name,
      };

      await db.insert(inboxSource).values(newSource);

      // Fetch the created source
      const [createdSource] = await db
        .select()
        .from(inboxSource)
        .where(and(eq(inboxSource.uid, uid), eq(inboxSource.name, name)))
        .limit(1);

      logger.info(`Inbox source created for user ${uid}: ${name}`);

      return createdSource;
    } catch (error) {
      logger.error('Error creating inbox source:', error);
      throw error;
    }
  }

  /**
   * Delete a source by ID
   */
  async delete(uid: string, id: number): Promise<void> {
    try {
      const db = getDatabase();

      // Delete the source (ensures uid scoping)
      await db
        .delete(inboxSource)
        .where(and(eq(inboxSource.id, id), eq(inboxSource.uid, uid)));

      logger.info(`Inbox source deleted: ${id} for user ${uid}`);
    } catch (error) {
      logger.error('Error deleting inbox source:', error);
      throw error;
    }
  }

  /**
   * Seed default sources for a user on first access
   */
  async seedDefaultData(uid: string): Promise<void> {
    try {
      const db = getDatabase();

      // Check if user already has sources
      const existingSources = await db
        .select({ count: sql<number>`count(*)` })
        .from(inboxSource)
        .where(eq(inboxSource.uid, uid));

      const count = existingSources[0]?.count || 0;

      // If user has no sources, seed default values
      if (count === 0) {
        const defaultSources: NewInboxSource[] = DEFAULT_SOURCES.map((name) => ({
          uid,
          name,
        }));

        await db.insert(inboxSource).values(defaultSources);

        logger.info(`Seeded default sources for user ${uid}`);
      }
    } catch (error) {
      logger.error('Error seeding default inbox sources:', error);
      throw error;
    }
  }
}
