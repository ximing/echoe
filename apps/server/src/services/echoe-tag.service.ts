/**
 * Echoe Tag Service
 * Manages tags for Echoe notes
 */

import { Service } from 'typedi';
import { sql, eq, and } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { logger } from '../utils/logger.js';

import type { EchoeTagDto, RenameTagDto, MergeTagsDto } from '@echoe/dto';

@Service()
export class EchoeTagService {
  /**
   * Get all tags with usage count, sorted by count descending
   */
  async getAllTags(uid: string): Promise<EchoeTagDto[]> {
    const db = getDatabase();

    // Get all notes with tags
    const notes = await db.select({ tags: echoeNotes.tags }).from(echoeNotes).where(eq(echoeNotes.uid, uid));

    // Count tag usage
    const tagCounts = new Map<string, number>();

    for (const note of notes) {
      if (!note.tags) continue;

      try {
        const tags = JSON.parse(note.tags) as string[];
        for (const tag of tags) {
          const normalizedTag = tag.toLowerCase().trim();
          if (normalizedTag) {
            tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) || 0) + 1);
          }
        }
      } catch (e) {
        logger.warn('Failed to parse note tags', { error: e, tags: note.tags });
      }
    }

    // Convert to array and sort by count descending
    const tags: EchoeTagDto[] = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return tags;
  }

  /**
   * Search tags by prefix (for autocomplete)
   */
  async searchTags(uid: string, query: string, limit = 10): Promise<string[]> {
    const allTags = await this.getAllTags(uid);
    const normalizedQuery = query.toLowerCase().trim();

    return allTags
      .filter((tag) => tag.name.toLowerCase().includes(normalizedQuery))
      .slice(0, limit)
      .map((tag) => tag.name);
  }

  /**
   * Get usage count for a specific tag
   */
  async getTagUsageCount(uid: string, tagName: string): Promise<number> {
    const normalizedTag = tagName.toLowerCase().trim();

    const db = getDatabase();
    const result = await db
      .select({ tags: echoeNotes.tags })
      .from(echoeNotes)
      .where(and(eq(echoeNotes.uid, uid), sql`${echoeNotes.tags} LIKE ${`%"${normalizedTag}"%`}`));

    let count = 0;
    for (const note of result) {
      if (!note.tags) continue;
      try {
        const tags = JSON.parse(note.tags) as string[];
        if (tags.some((t) => t.toLowerCase().trim() === normalizedTag)) {
          count++;
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return count;
  }

  /**
   * Rename a tag across all notes
   */
  async renameTag(uid: string, oldName: string, dto: RenameTagDto): Promise<{ updated: number }> {
    const oldTag = oldName.toLowerCase().trim();
    const newTag = dto.newName.toLowerCase().trim();

    if (!newTag) {
      throw new Error('New tag name cannot be empty');
    }

    const db = getDatabase();

    // Get all notes with the old tag
    const notes = await db
      .select({ noteId: echoeNotes.noteId, tags: echoeNotes.tags })
      .from(echoeNotes)
      .where(and(eq(echoeNotes.uid, uid), sql`${echoeNotes.tags} LIKE ${`%"${oldTag}"%`}`));

    let updated = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const note of notes) {
      if (!note.tags) continue;

      try {
        const tags = JSON.parse(note.tags) as string[];
        const hasOldTag = tags.some((t) => t.toLowerCase().trim() === oldTag);

        if (hasOldTag) {
          // Replace old tag with new tag
          const newTags = tags.map((t) => (t.toLowerCase().trim() === oldTag ? dto.newName : t));

          await db
            .update(echoeNotes)
            .set({ tags: JSON.stringify(newTags), mod: now, usn: 0 })
            .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, note.noteId)));

          updated++;
        }
      } catch (e) {
        logger.warn('Failed to update note tags', { error: e, noteId: note.noteId });
      }
    }

    return { updated };
  }

  /**
   * Delete a tag (only if not in use)
   */
  async deleteTag(uid: string, tagName: string): Promise<{ deleted: boolean; message: string }> {
    const normalizedTag = tagName.toLowerCase().trim();
    const usageCount = await this.getTagUsageCount(uid, normalizedTag);

    if (usageCount > 0) {
      return {
        deleted: false,
        message: `Cannot delete tag '${tagName}': ${usageCount} notes still use this tag`,
      };
    }

    // Tag not in use, nothing to delete from notes
    // But we could clean up any tag-specific metadata if we had it
    return {
      deleted: true,
      message: `Tag '${tagName}' deleted (was not in use)`,
    };
  }

  /**
   * Merge one tag into another
   * Replaces source tag with target tag in all notes, then deletes source
   */
  async mergeTags(uid: string, dto: MergeTagsDto): Promise<{ updated: number }> {
    const sourceTag = dto.source.toLowerCase().trim();
    const targetTag = dto.target.toLowerCase().trim();

    if (!sourceTag || !targetTag) {
      throw new Error('Both source and target tags must be provided');
    }

    if (sourceTag === targetTag) {
      throw new Error('Source and target tags must be different');
    }

    const db = getDatabase();

    // Get all notes with the source tag
    const notes = await db
      .select({ noteId: echoeNotes.noteId, tags: echoeNotes.tags })
      .from(echoeNotes)
      .where(and(eq(echoeNotes.uid, uid), sql`${echoeNotes.tags} LIKE ${`%"${sourceTag}"%`}`));

    let updated = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const note of notes) {
      if (!note.tags) continue;

      try {
        const tags = JSON.parse(note.tags) as string[];
        const hasSourceTag = tags.some((t) => t.toLowerCase().trim() === sourceTag);

        if (hasSourceTag) {
          // Replace source tag with target tag, removing duplicates
          const newTags = tags
            .map((t) => (t.toLowerCase().trim() === sourceTag ? dto.target : t))
            .filter((t, index, arr) => arr.indexOf(t) === index); // Remove duplicates

          await db
            .update(echoeNotes)
            .set({ tags: JSON.stringify(newTags), mod: now, usn: 0 })
            .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, note.noteId)));

          updated++;
        }
      } catch (e) {
        logger.warn('Failed to update note tags during merge', { error: e, noteId: note.noteId });
      }
    }

    return { updated };
  }
}
