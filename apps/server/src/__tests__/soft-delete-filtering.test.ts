/**
 * Regression tests for soft-delete filtering (Issue #63)
 * Verifies that deleted rows are absent from normal APIs
 */

import { getDatabase } from '../db/connection.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { eq, and } from 'drizzle-orm';
import { EchoeNoteService } from '../services/echoe-note.service.js';
import { EchoeDeckService } from '../services/echoe-deck.service.js';
import { EchoeStatsService } from '../services/echoe-stats.service.js';
import { generateTypeId } from '../utils/id.js';
import { OBJECT_TYPE } from '../models/constant/type.js';

describe('Soft Delete Filtering (Issue #63)', () => {
  let noteService: EchoeNoteService;
  let deckService: EchoeDeckService;
  let statsService: EchoeStatsService;
  const testUid = 'test-soft-delete-user';
  let testDeckId: string;
  let testNoteTypeId: string;
  let testNoteId: string;
  let testCardId: string;

  beforeAll(async () => {
    const db = getDatabase();
    noteService = new EchoeNoteService({} as any, {} as any);
    deckService = new EchoeDeckService();
    statsService = new EchoeStatsService(deckService);

    // Create test deck
    testDeckId = generateTypeId(OBJECT_TYPE.ECHOE_DECK);
    await db.insert(echoeDecks).values({
      deckId: testDeckId,
      uid: testUid,
      name: 'Test Deck',
      conf: '1',
      usn: 0,
      mod: Math.floor(Date.now() / 1000),
      desc: '',
      deletedAt: 0,
    });

    // Create test notetype
    testNoteTypeId = generateTypeId(OBJECT_TYPE.ECHOE_NOTETYPE);
    await db.insert(echoeNotetypes).values({
      noteTypeId: testNoteTypeId,
      uid: testUid,
      name: 'Test Note Type',
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      sortf: 0,
      did: testDeckId,
      tmpls: JSON.stringify([]),
      flds: JSON.stringify([{ name: 'Front', ord: 0 }]),
      css: '',
      type: 0,
      latexPre: '',
      latexPost: '',
      req: JSON.stringify([]),
      deletedAt: 0,
    });

    // Create test note
    testNoteId = generateTypeId(OBJECT_TYPE.ECHOE_NOTE);
    await db.insert(echoeNotes).values({
      noteId: testNoteId,
      uid: testUid,
      guid: 'test-guid-123',
      mid: testNoteTypeId,
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      tags: JSON.stringify([]),
      flds: 'Test Front',
      sfld: 'Test Front',
      csum: '0',
      flags: 0,
      data: '{}',
      deletedAt: 0,
    });

    // Create test card
    testCardId = generateTypeId(OBJECT_TYPE.ECHOE_CARD);
    await db.insert(echoeCards).values({
      cardId: testCardId,
      uid: testUid,
      nid: testNoteId,
      did: testDeckId,
      ord: 0,
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      type: 0,
      queue: 0,
      due: 0,
      ivl: 0,
      factor: 2500,
      reps: 0,
      lapses: 0,
      left: 0,
      odue: 0,
      odid: '',
      flags: 0,
      data: '{}',
      deletedAt: 0,
    });
  });

  afterAll(async () => {
    const db = getDatabase();
    // Clean up test data
    await db.delete(echoeCards).where(eq(echoeCards.uid, testUid));
    await db.delete(echoeNotes).where(eq(echoeNotes.uid, testUid));
    await db.delete(echoeNotetypes).where(eq(echoeNotetypes.uid, testUid));
    await db.delete(echoeDecks).where(eq(echoeDecks.uid, testUid));
  });

  describe('Note queries exclude soft-deleted rows', () => {
    it('should return note before soft-delete', async () => {
      const note = await noteService.getNoteById(testUid, testNoteId);
      expect(note).not.toBeNull();
      expect(note?.noteId).toBe(testNoteId);
    });

    it('should NOT return note after soft-delete', async () => {
      const db = getDatabase();

      // Soft delete the note
      await db
        .update(echoeNotes)
        .set({ deletedAt: Date.now() })
        .where(and(eq(echoeNotes.uid, testUid), eq(echoeNotes.noteId, testNoteId)));

      // Verify it's excluded from queries
      const note = await noteService.getNoteById(testUid, testNoteId);
      expect(note).toBeNull();

      // Restore for other tests
      await db
        .update(echoeNotes)
        .set({ deletedAt: 0 })
        .where(and(eq(echoeNotes.uid, testUid), eq(echoeNotes.noteId, testNoteId)));
    });

    it('should exclude soft-deleted notes from list', async () => {
      const db = getDatabase();

      // Soft delete the note
      await db
        .update(echoeNotes)
        .set({ deletedAt: Date.now() })
        .where(and(eq(echoeNotes.uid, testUid), eq(echoeNotes.noteId, testNoteId)));

      const result = await noteService.getNotes(testUid, { page: 1, limit: 20 });
      const foundNote = result.notes.find((n) => n.noteId === testNoteId);
      expect(foundNote).toBeUndefined();

      // Restore
      await db
        .update(echoeNotes)
        .set({ deletedAt: 0 })
        .where(and(eq(echoeNotes.uid, testUid), eq(echoeNotes.noteId, testNoteId)));
    });
  });

  describe('Card queries exclude soft-deleted rows', () => {
    it('should return card before soft-delete', async () => {
      const card = await noteService.getCardById(testUid, testCardId);
      expect(card).not.toBeNull();
      expect(card?.cardId).toBe(testCardId);
    });

    it('should NOT return card after soft-delete', async () => {
      const db = getDatabase();

      // Soft delete the card
      await db
        .update(echoeCards)
        .set({ deletedAt: Date.now() })
        .where(and(eq(echoeCards.uid, testUid), eq(echoeCards.cardId, testCardId)));

      // Verify it's excluded from queries
      const card = await noteService.getCardById(testUid, testCardId);
      expect(card).toBeNull();

      // Restore
      await db
        .update(echoeCards)
        .set({ deletedAt: 0 })
        .where(and(eq(echoeCards.uid, testUid), eq(echoeCards.cardId, testCardId)));
    });

    it('should exclude soft-deleted cards from list', async () => {
      const db = getDatabase();

      // Soft delete the card
      await db
        .update(echoeCards)
        .set({ deletedAt: Date.now() })
        .where(and(eq(echoeCards.uid, testUid), eq(echoeCards.cardId, testCardId)));

      const result = await noteService.getCards(testUid, { page: 1, limit: 50 });
      const foundCard = result.cards.find((c) => c.cardId === testCardId);
      expect(foundCard).toBeUndefined();

      // Restore
      await db
        .update(echoeCards)
        .set({ deletedAt: 0 })
        .where(and(eq(echoeCards.uid, testUid), eq(echoeCards.cardId, testCardId)));
    });
  });

  describe('Deck queries exclude soft-deleted rows', () => {
    it('should return deck before soft-delete', async () => {
      const deck = await deckService.getDeckById(testUid, testDeckId);
      expect(deck).not.toBeNull();
      expect(deck?.deckId).toBe(testDeckId);
    });

    it('should NOT return deck after soft-delete', async () => {
      const db = getDatabase();

      // Soft delete the deck
      await db
        .update(echoeDecks)
        .set({ deletedAt: Date.now() })
        .where(and(eq(echoeDecks.uid, testUid), eq(echoeDecks.deckId, testDeckId)));

      // Verify it's excluded from queries
      const deck = await deckService.getDeckById(testUid, testDeckId);
      expect(deck).toBeNull();

      // Restore
      await db
        .update(echoeDecks)
        .set({ deletedAt: 0 })
        .where(and(eq(echoeDecks.uid, testUid), eq(echoeDecks.deckId, testDeckId)));
    });

    it('should exclude soft-deleted decks from list', async () => {
      const db = getDatabase();

      // Soft delete the deck
      await db
        .update(echoeDecks)
        .set({ deletedAt: Date.now() })
        .where(and(eq(echoeDecks.uid, testUid), eq(echoeDecks.deckId, testDeckId)));

      const decks = await deckService.getAllDecks(testUid);
      const foundDeck = decks.find((d: { deckId: string }) => d.deckId === testDeckId);
      expect(foundDeck).toBeUndefined();

      // Restore
      await db
        .update(echoeDecks)
        .set({ deletedAt: 0 })
        .where(and(eq(echoeDecks.uid, testUid), eq(echoeDecks.deckId, testDeckId)));
    });
  });

  describe('Stats queries exclude soft-deleted rows', () => {
    it('should exclude soft-deleted cards from maturity stats', async () => {
      const db = getDatabase();

      // Get initial stats
      const initialStats = await statsService.getMaturity(testUid);

      // Soft delete the card
      await db
        .update(echoeCards)
        .set({ deletedAt: Date.now() })
        .where(and(eq(echoeCards.uid, testUid), eq(echoeCards.cardId, testCardId)));

      // Stats should not include the deleted card
      const statsAfterDelete = await statsService.getMaturity(testUid);
      const totalInitial = initialStats.new + initialStats.learning + initialStats.young + initialStats.mature;
      const totalAfterDelete = statsAfterDelete.new + statsAfterDelete.learning + statsAfterDelete.young + statsAfterDelete.mature;

      expect(totalAfterDelete).toBeLessThan(totalInitial);

      // Restore
      await db
        .update(echoeCards)
        .set({ deletedAt: 0 })
        .where(and(eq(echoeCards.uid, testUid), eq(echoeCards.cardId, testCardId)));
    });
  });

  describe('Join queries apply active filter to all tables', () => {
    it('should exclude soft-deleted cards when joined with notes', async () => {
      const db = getDatabase();

      // Soft delete the card
      await db
        .update(echoeCards)
        .set({ deletedAt: Date.now() })
        .where(and(eq(echoeCards.uid, testUid), eq(echoeCards.cardId, testCardId)));

      // Query cards with note join (via getCards)
      const result = await noteService.getCards(testUid, { page: 1, limit: 50 });
      const foundCard = result.cards.find((c) => c.cardId === testCardId);
      expect(foundCard).toBeUndefined();

      // Restore
      await db
        .update(echoeCards)
        .set({ deletedAt: 0 })
        .where(and(eq(echoeCards.uid, testUid), eq(echoeCards.cardId, testCardId)));
    });

    it('should exclude soft-deleted notes when joined with cards', async () => {
      const db = getDatabase();

      // Soft delete the note
      await db
        .update(echoeNotes)
        .set({ deletedAt: Date.now() })
        .where(and(eq(echoeNotes.uid, testUid), eq(echoeNotes.noteId, testNoteId)));

      // Query notes with card join
      const result = await noteService.getNotes(testUid, { deckId: testDeckId, page: 1, limit: 20 });
      const foundNote = result.notes.find((n) => n.noteId === testNoteId);
      expect(foundNote).toBeUndefined();

      // Restore
      await db
        .update(echoeNotes)
        .set({ deletedAt: 0 })
        .where(and(eq(echoeNotes.uid, testUid), eq(echoeNotes.noteId, testNoteId)));
    });
  });
});
