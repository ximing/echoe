import { Service } from 'typedi';
import { eq, inArray } from 'drizzle-orm';

import type { EchoeNoteDto, FindDuplicatesDto, DuplicateGroupDto, MergeDuplicatesDto } from '@echoe/dto';

interface NoteRecord {
  id: number;
  guid: string;
  mid: number;
  mod: number;
  usn: number;
  tags: string;
  flds: string;
  sfld: string;
  csum: number;
  flags: number;
  data: string;
  fieldsJson?: Record<string, string> | null;
}

@Service()
export class EchoeDuplicateService {
  /**
   * Calculate Levenshtein similarity between two strings (0-1)
   * Case insensitive
   */
  levenshteinSimilarity(s1: string, s2: string): number {
    const str1 = s1.toLowerCase();
    const str2 = s2.toLowerCase();

    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    const len1 = str1.length;
    const len2 = str2.length;

    // Create matrix
    const matrix: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1.0 - distance / maxLen;
  }

  /**
   * Extract field value from note's fieldsJson by field name or index
   */
  private getFieldValue(note: NoteRecord, fieldName: string): string {
    if (note.fieldsJson && typeof note.fieldsJson === 'object') {
      return note.fieldsJson[fieldName] || '';
    }
    return '';
  }

  /**
   * Find exact duplicate notes (case-insensitive match)
   */
  findExactDuplicates(notes: NoteRecord[], fieldName: string): DuplicateGroupDto[] {
    const groups: Map<string, NoteRecord[]> = new Map();

    for (const note of notes) {
      const fieldValue = this.getFieldValue(note, fieldName).toLowerCase();
      if (!fieldValue) continue;

      const existing = groups.get(fieldValue) || [];
      existing.push(note);
      groups.set(fieldValue, existing);
    }

    // Filter to only groups with more than one note
    const duplicates: DuplicateGroupDto[] = [];
    for (const [, noteRecords] of groups) {
      if (noteRecords.length > 1) {
        duplicates.push({
          notes: noteRecords.map((n) => this.mapNoteToDto(n)),
        });
      }
    }

    return duplicates;
  }

  /**
   * Find similar notes using Levenshtein similarity
   */
  findSimilarDuplicates(
    notes: NoteRecord[],
    fieldName: string,
    threshold: number
  ): DuplicateGroupDto[] {
    if (threshold >= 1.0) {
      return this.findExactDuplicates(notes, fieldName);
    }

    const processed = new Set<number>();
    const duplicates: DuplicateGroupDto[] = [];

    for (let i = 0; i < notes.length; i++) {
      if (processed.has(notes[i].id)) continue;

      const currentValue = this.getFieldValue(notes[i], fieldName);
      if (!currentValue) continue;

      const group: NoteRecord[] = [notes[i]];
      processed.add(notes[i].id);

      for (let j = i + 1; j < notes.length; j++) {
        if (processed.has(notes[j].id)) continue;

        const compareValue = this.getFieldValue(notes[j], fieldName);
        if (!compareValue) continue;

        const similarity = this.levenshteinSimilarity(currentValue, compareValue);
        if (similarity >= threshold) {
          group.push(notes[j]);
          processed.add(notes[j].id);
        }
      }

      if (group.length > 1) {
        duplicates.push({
          notes: group.map((n) => this.mapNoteToDto(n)),
        });
      }
    }

    return duplicates;
  }

  /**
   * Find duplicate notes by note type and field
   */
  async findDuplicates(uid: string, dto: FindDuplicatesDto): Promise<DuplicateGroupDto[]> {
    const { getDatabase } = await import('../db/connection.js');
    const { echoeNotes } = await import('../db/schema/echoe-notes.js');
    const { echoeNotetypes } = await import('../db/schema/echoe-notetypes.js');
    const { logger } = await import('../utils/logger.js');
    const { and, eq } = await import('drizzle-orm');

    const db = getDatabase();
    const { notetypeId, fieldName, threshold = 1.0 } = dto;

    // Get all notes of this note type
    const notes = await db
      .select()
      .from(echoeNotes)
      .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.mid, notetypeId)));

    if (notes.length === 0) {
      return [];
    }

    // Get field definitions from notetypes to find field index
    const notetypes = await db.select().from(echoeNotetypes).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, notetypeId)));

    if (notetypes.length === 0) {
      return [];
    }

    const notetype = notetypes[0];
    const fields = JSON.parse(notetype.flds as string) as Array<{ name: string }>;
    const fieldExists = fields.some((f) => f.name === fieldName);

    if (!fieldExists) {
      logger.warn(`Field ${fieldName} not found in notetype ${notetypeId}`);
      return [];
    }

    // Find duplicates based on threshold using fieldsJson
    if (threshold >= 1.0) {
      return this.findExactDuplicates(notes, fieldName);
    } else {
      return this.findSimilarDuplicates(notes, fieldName, threshold);
    }
  }

  /**
   * Merge duplicates: keep one note, delete others
   */
  async mergeDuplicates(uid: string, dto: MergeDuplicatesDto): Promise<void> {
    const { getDatabase } = await import('../db/connection.js');
    const { echoeNotes } = await import('../db/schema/echoe-notes.js');
    const { echoeCards } = await import('../db/schema/echoe-cards.js');
    const { echoeGraves } = await import('../db/schema/echoe-graves.js');
    const { logger } = await import('../utils/logger.js');
    const { and, eq, inArray } = await import('drizzle-orm');

    const db = getDatabase();
    const { keepId, deleteIds } = dto;

    // Get all cards for notes to be deleted
    const cardsToDelete = await db
      .select()
      .from(echoeCards)
      .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.nid, deleteIds)));

    // Add deleted notes to graves table
    for (const deleteId of deleteIds) {
      await db.insert(echoeGraves).values({
        uid,
        usn: -1,
        oid: deleteId,
        type: 0, // note type
      });
    }

    // Add deleted cards to graves table
    for (const card of cardsToDelete) {
      await db.insert(echoeGraves).values({
        uid,
        usn: -1,
        oid: card.id,
        type: 1, // card type
      });
    }

    // Delete cards belonging to deleted notes
    await db.delete(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.nid, deleteIds)));

    // Delete notes
    await db.delete(echoeNotes).where(and(eq(echoeNotes.uid, uid), inArray(echoeNotes.id, deleteIds)));

    logger.info(`Merged duplicates: kept note ${keepId}, deleted ${deleteIds.length} notes`);
  }

  /**
   * Map note record to DTO
   */
  private mapNoteToDto(note: NoteRecord): EchoeNoteDto {
    const fields: Record<string, string> =
      note.fieldsJson && typeof note.fieldsJson === 'object' && Object.keys(note.fieldsJson).length > 0
        ? note.fieldsJson
        : {};

    return {
      id: Number(note.id),
      guid: note.guid,
      mid: Number(note.mid),
      mod: note.mod,
      tags: note.tags ? JSON.parse(note.tags) : [],
      fields,
      sfld: note.sfld,
      csum: Number(note.csum),
      flags: note.flags,
      data: note.data,
    };
  }
}
