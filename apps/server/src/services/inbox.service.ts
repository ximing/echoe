import { Service } from 'typedi';
import { eq, and, desc, isNull } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { inbox } from '../db/schema/inbox.js';
import { generateInboxId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { InboxMetricsService } from './inbox-metrics.service.js';
import { InboxSourceService } from './inbox-source.service.js';
import { InboxCategoryService } from './inbox-category.service.js';
import { serializeToHtml } from '../lib/prosemirror-serializer.js';

import type { Inbox, NewInbox } from '../db/schema/inbox.js';
import type { ProseMirrorJsonDoc } from '../types/note-fields.js';

export interface CreateInboxParams {
  front: string;
  back: string;
  frontJson?: Record<string, unknown>;
  backJson?: Record<string, unknown>;
  source?: string;
  category?: string;
  isRead?: boolean;
}

export interface UpdateInboxParams {
  front?: string;
  back?: string;
  frontJson?: Record<string, unknown>;
  backJson?: Record<string, unknown>;
  source?: string | null;
  category?: string | null;
  isRead?: boolean;
}

export interface ListInboxParams {
  source?: string | null;
  category?: string | null;
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
  constructor(
    private metricsService: InboxMetricsService,
    private sourceService: InboxSourceService,
    private categoryService: InboxCategoryService,
  ) {}

  /**
   * Convert plain text to TipTap JSON format
   * @param text - Plain text string
   * @returns TipTap JSON document
   */
  convertPlainTextToTipTapJson(text: string): ProseMirrorJsonDoc {
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: text,
            },
          ],
        },
      ],
    };
  }

  /**
   * Create a new inbox item
   */
  async create(uid: string, data: CreateInboxParams): Promise<Inbox> {
    try {
      const db = getDatabase();

      const inboxId = generateInboxId();

      // Auto-create source if provided and doesn't exist
      let sourceValue = data.source ?? 'manual';
      if (data.source) {
        await this.sourceService.create(uid, data.source);
      }

      // Auto-create category if provided and doesn't exist
      let categoryValue = data.category ?? 'backend';
      if (data.category) {
        await this.categoryService.create(uid, data.category);
      }

      // Process front content: JSON takes precedence over plain text
      let frontContent = data.front;
      if (data.frontJson) {
        // If JSON is provided, serialize it to HTML
        frontContent = serializeToHtml(data.frontJson as unknown as ProseMirrorJsonDoc);
      }

      // Process back content: JSON takes precedence over plain text
      let backContent = data.back;
      if (data.backJson) {
        // If JSON is provided, serialize it to HTML
        backContent = serializeToHtml(data.backJson as unknown as ProseMirrorJsonDoc);
      }

      const newInboxItem: NewInbox = {
        inboxId,
        uid,
        front: frontContent,
        back: backContent,
        source: sourceValue,
        category: categoryValue,
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
      const conditions: any[] = [eq(inbox.uid, uid), eq(inbox.deletedAt, 0)];

      // Filter by source (support null filtering)
      if (params.source !== undefined) {
        if (params.source === null) {
          conditions.push(isNull(inbox.source));
        } else {
          conditions.push(eq(inbox.source, params.source));
        }
      }

      // Filter by category (support null filtering)
      if (params.category !== undefined) {
        if (params.category === null) {
          conditions.push(isNull(inbox.category));
        } else {
          conditions.push(eq(inbox.category, params.category));
        }
      }

      // Filter by isRead
      if (params.isRead !== undefined) {
        conditions.push(eq(inbox.isRead, params.isRead));
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

      // Auto-create source if provided and not null
      if (data.source !== undefined && data.source !== null) {
        await this.sourceService.create(uid, data.source);
      }

      // Auto-create category if provided and not null
      if (data.category !== undefined && data.category !== null) {
        await this.categoryService.create(uid, data.category);
      }

      // Build update values
      const updateValues: Partial<NewInbox> = {};

      // Process front content: JSON takes precedence over plain text
      if (data.frontJson !== undefined) {
        updateValues.front = serializeToHtml(data.frontJson as unknown as ProseMirrorJsonDoc);
      } else if (data.front !== undefined) {
        updateValues.front = data.front;
      }

      // Process back content: JSON takes precedence over plain text
      if (data.backJson !== undefined) {
        updateValues.back = serializeToHtml(data.backJson as unknown as ProseMirrorJsonDoc);
      } else if (data.back !== undefined) {
        updateValues.back = data.back;
      }

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
