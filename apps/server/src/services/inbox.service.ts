import { Service } from 'typedi';
import { eq, and, desc } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { inbox } from '../db/schema/inbox.js';
import { generateInboxId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { InboxMetricsService } from './inbox-metrics.service.js';

import type { Inbox, NewInbox } from '../db/schema/inbox.js';

export interface CreateInboxParams {
  front: string;
  back: string;
  source?: string;
  category?: string;
  isRead?: boolean;
}

export interface UpdateInboxParams {
  front?: string;
  back?: string;
  source?: string | null;
  category?: string | null;
  isRead?: boolean;
}

export interface ListInboxParams {
  category?: string;
  isRead?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListInboxResult {
  items: Inbox[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Service()
export class InboxService {
  constructor(private metricsService: InboxMetricsService) {}

  /**
   * Create a new inbox item
   */
  async create(uid: string, data: CreateInboxParams): Promise<Inbox> {
    try {
      const db = getDatabase();

      const inboxId = generateInboxId();

      const newInboxItem: NewInbox = {
        inboxId,
        uid,
        front: data.front,
        back: data.back,
        source: data.source ?? 'manual',
        category: data.category ?? 'backend',
        isRead: data.isRead ?? false,
      };

      await db.insert(inbox).values(newInboxItem);

      // Fetch the created inbox item
      const [createdInbox] = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.inboxId, inboxId), eq(inbox.deletedAt, 0)));

      logger.info(`Inbox item created for user ${uid}: ${inboxId}`);
      this.metricsService.trackInboxCreate(uid, inboxId, newInboxItem.source || 'manual');

      return createdInbox;
    } catch (error) {
      logger.error('Error creating inbox item:', error);
      throw error;
    }
  }

  /**
   * List inbox items for a user with pagination and filters
   */
  async list(uid: string, params: ListInboxParams = {}): Promise<ListInboxResult> {
    try {
      const db = getDatabase();

      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      // Build where conditions based on filters
      let conditions: any[] = [eq(inbox.uid, uid), eq(inbox.deletedAt, 0)];

      if (params.category !== undefined && params.isRead !== undefined) {
        conditions = [
          eq(inbox.uid, uid),
          eq(inbox.category, params.category),
          eq(inbox.isRead, params.isRead),
          eq(inbox.deletedAt, 0),
        ];
      } else if (params.category !== undefined) {
        conditions = [
          eq(inbox.uid, uid),
          eq(inbox.category, params.category),
          eq(inbox.deletedAt, 0),
        ];
      } else if (params.isRead !== undefined) {
        conditions = [
          eq(inbox.uid, uid),
          eq(inbox.isRead, params.isRead),
          eq(inbox.deletedAt, 0),
        ];
      }

      // Get total count
      const countResult = await db
        .select({ count: inbox.inboxId })
        .from(inbox)
        .where(and(...conditions));

      const total = countResult.length;

      // Get paginated items
      const items = await db
        .select()
        .from(inbox)
        .where(and(...conditions))
        .orderBy(desc(inbox.createdAt))
        .limit(pageSize)
        .offset(offset);

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } catch (error) {
      logger.error('Error listing inbox items:', error);
      throw error;
    }
  }

  /**
   * Update an inbox item
   */
  async update(uid: string, inboxId: string, data: UpdateInboxParams): Promise<Inbox> {
    try {
      const db = getDatabase();

      // Check if inbox item exists and belongs to user
      const existingInbox = await this.findByIdAndUid(uid, inboxId);
      if (!existingInbox) {
        throw new Error('Inbox item not found');
      }

      // Build update values
      const updateValues: Partial<NewInbox> = {};
      if (data.front !== undefined) updateValues.front = data.front;
      if (data.back !== undefined) updateValues.back = data.back;
      if (data.source !== undefined) updateValues.source = data.source;
      if (data.category !== undefined) updateValues.category = data.category;
      if (data.isRead !== undefined) updateValues.isRead = data.isRead;

      // Update inbox item
      await db
        .update(inbox)
        .set(updateValues)
        .where(and(eq(inbox.inboxId, inboxId), eq(inbox.uid, uid), eq(inbox.deletedAt, 0)));

      // Fetch updated inbox item
      const [updatedInbox] = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.inboxId, inboxId), eq(inbox.deletedAt, 0)));

      logger.info(`Inbox item updated for user ${uid}: ${inboxId}`);

      return updatedInbox;
    } catch (error) {
      logger.error('Error updating inbox item:', error);
      throw error;
    }
  }

  /**
   * Soft delete an inbox item
   */
  async delete(uid: string, inboxId: string): Promise<boolean> {
    try {
      const db = getDatabase();

      // Check if inbox item exists and belongs to user
      const existingInbox = await this.findByIdAndUid(uid, inboxId);
      if (!existingInbox) {
        throw new Error('Inbox item not found');
      }

      // Soft delete by setting deletedAt timestamp (bigint = current timestamp in ms)
      await db
        .update(inbox)
        .set({ deletedAt: Date.now() })
        .where(and(eq(inbox.inboxId, inboxId), eq(inbox.uid, uid), eq(inbox.deletedAt, 0)));

      logger.info(`Inbox item deleted for user ${uid}: ${inboxId}`);

      return true;
    } catch (error) {
      logger.error('Error deleting inbox item:', error);
      throw error;
    }
  }

  /**
   * Mark an inbox item as read
   */
  async markRead(uid: string, inboxId: string): Promise<Inbox> {
    try {
      const db = getDatabase();

      // Check if inbox item exists and belongs to user
      const existingInbox = await this.findByIdAndUid(uid, inboxId);
      if (!existingInbox) {
        throw new Error('Inbox item not found');
      }

      // Mark as read (set isRead to true)
      await db
        .update(inbox)
        .set({ isRead: true })
        .where(and(eq(inbox.inboxId, inboxId), eq(inbox.uid, uid), eq(inbox.deletedAt, 0)));

      // Fetch updated inbox item
      const [updatedInbox] = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.inboxId, inboxId), eq(inbox.deletedAt, 0)));

      logger.info(`Inbox item marked as read for user ${uid}: ${inboxId}`);

      return updatedInbox;
    } catch (error) {
      logger.error('Error marking inbox item as read:', error);
      throw error;
    }
  }

  /**
   * Mark all inbox items as read for a user
   * Returns the count of updated items
   */
  async markReadAll(uid: string): Promise<{ updatedCount: number }> {
    try {
      const db = getDatabase();

      // Find all unread items for the user
      const unreadItems = await db
        .select({ inboxId: inbox.inboxId })
        .from(inbox)
        .where(and(eq(inbox.uid, uid), eq(inbox.isRead, false), eq(inbox.deletedAt, 0)));

      const updatedCount = unreadItems.length;

      if (updatedCount > 0) {
        // Mark all as read
        await db
          .update(inbox)
          .set({ isRead: true })
          .where(and(eq(inbox.uid, uid), eq(inbox.isRead, false), eq(inbox.deletedAt, 0)));

        logger.info(`Marked ${updatedCount} inbox items as read for user ${uid}`);
      }

      return { updatedCount };
    } catch (error) {
      logger.error('Error marking all inbox items as read:', error);
      throw error;
    }
  }

  /**
   * Find an inbox item by ID and UID
   */
  async findByIdAndUid(uid: string, inboxId: string): Promise<Inbox | null> {
    try {
      const db = getDatabase();

      const results = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.uid, uid), eq(inbox.inboxId, inboxId), eq(inbox.deletedAt, 0)))
        .limit(1);

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      logger.error('Error finding inbox item:', error);
      throw error;
    }
  }
}
