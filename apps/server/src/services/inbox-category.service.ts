import { Service } from 'typedi';
import { eq, and, sql } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { inboxCategory } from '../db/schema/inbox-category.js';
import { logger } from '../utils/logger.js';

import type { InboxCategory, NewInboxCategory } from '../db/schema/inbox-category.js';

/**
 * Default category values to seed on first access
 */
const DEFAULT_CATEGORIES = ['backend', 'frontend', 'design', 'product', 'life', 'other'];

@Service()
export class InboxCategoryService {
  /**
   * Get all categories for a user
   */
  async list(uid: string): Promise<InboxCategory[]> {
    try {
      const db = getDatabase();

      // Ensure default categories exist for this user
      await this.seedDefaultData(uid);

      const categories = await db
        .select()
        .from(inboxCategory)
        .where(eq(inboxCategory.uid, uid))
        .orderBy(inboxCategory.createdAt);

      return categories;
    } catch (error) {
      logger.error('Error listing inbox categories:', error);
      throw error;
    }
  }

  /**
   * Get a category by name for a user
   */
  async getByName(uid: string, name: string): Promise<InboxCategory | null> {
    try {
      const db = getDatabase();

      const [category] = await db
        .select()
        .from(inboxCategory)
        .where(and(eq(inboxCategory.uid, uid), eq(inboxCategory.name, name)))
        .limit(1);

      return category || null;
    } catch (error) {
      logger.error('Error getting inbox category by name:', error);
      throw error;
    }
  }

  /**
   * Create a new category for a user
   */
  async create(uid: string, name: string): Promise<InboxCategory> {
    try {
      const db = getDatabase();

      // Check if category already exists
      const existing = await this.getByName(uid, name);
      if (existing) {
        return existing;
      }

      const newCategory: NewInboxCategory = {
        uid,
        name,
      };

      await db.insert(inboxCategory).values(newCategory);

      // Fetch the created category
      const [createdCategory] = await db
        .select()
        .from(inboxCategory)
        .where(and(eq(inboxCategory.uid, uid), eq(inboxCategory.name, name)))
        .limit(1);

      logger.info(`Inbox category created for user ${uid}: ${name}`);

      return createdCategory;
    } catch (error) {
      logger.error('Error creating inbox category:', error);
      throw error;
    }
  }

  /**
   * Delete a category by ID
   */
  async delete(uid: string, id: number): Promise<void> {
    try {
      const db = getDatabase();

      // Delete the category (ensures uid scoping)
      await db
        .delete(inboxCategory)
        .where(and(eq(inboxCategory.id, id), eq(inboxCategory.uid, uid)));

      logger.info(`Inbox category deleted: ${id} for user ${uid}`);
    } catch (error) {
      logger.error('Error deleting inbox category:', error);
      throw error;
    }
  }

  /**
   * Seed default categories for a user on first access
   */
  async seedDefaultData(uid: string): Promise<void> {
    try {
      const db = getDatabase();

      // Check if user already has categories
      const existingCategories = await db
        .select({ count: sql<number>`count(*)` })
        .from(inboxCategory)
        .where(eq(inboxCategory.uid, uid));

      const count = existingCategories[0]?.count || 0;

      // If user has no categories, seed default values
      if (count === 0) {
        const defaultCategories: NewInboxCategory[] = DEFAULT_CATEGORIES.map((name) => ({
          uid,
          name,
        }));

        await db.insert(inboxCategory).values(defaultCategories);

        logger.info(`Seeded default categories for user ${uid}`);
      }
    } catch (error) {
      logger.error('Error seeding default inbox categories:', error);
      throw error;
    }
  }
}
