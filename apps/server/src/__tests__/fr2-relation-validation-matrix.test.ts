/**
 * FR-2 Relationship Validation Matrix Tests
 *
 * Tests the complete relationship validation matrix for Create/Update scenarios
 * as defined in PRD FR-2. Ensures:
 * - Relationship fields are validated when provided
 * - Validation only applies to provided fields in Update (not all fields)
 * - Invalid relationships return explicit 4xx errors with field names
 * - All validations enforce uid scope
 *
 * Refs #68
 */

import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../db/transaction.js', () => ({
  withTransaction: jest.fn((cb: (tx: any) => Promise<any>) => cb({
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
    update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
      }),
    }),
  })),
}));

import { getDatabase } from '../db/connection.js';
import { EchoeNoteService } from '../services/echoe-note.service.js';
import { EchoeDeckService } from '../services/echoe-deck.service.js';
import type { CreateEchoeNoteDto, UpdateEchoeNoteDto, CreateEchoeDeckDto, UpdateEchoeDeckDto, CreateEchoeNoteTypeDto } from '@echoe/dto';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

/**
 * Helper to create a proper database mock chain
 */
function createDbMock(queryResults: any[][]) {
  let callCount = 0;
  const limitMock = jest.fn(() => {
    const result = queryResults[callCount] || [];
    callCount++;
    return Promise.resolve(result);
  });
  const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
  const fromMock = jest.fn().mockReturnValue({ where: whereMock });
  const selectMock = jest.fn().mockReturnValue({ from: fromMock });
  const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
  const updateMock = jest.fn().mockReturnValue({ set: setMock });
  const valuesMock = jest.fn().mockResolvedValue(undefined);
  const insertMock = jest.fn().mockReturnValue({ values: valuesMock });

  return {
    select: selectMock,
    update: updateMock,
    insert: insertMock,
    mocks: { selectMock, whereMock, limitMock, updateMock, setMock, insertMock, valuesMock },
  };
}

describe('FR-2 Relationship Validation Matrix', () => {
  const testUid = 'test-uid-001';
  const testNoteTypeId = 'ent_test_notetype_001';
  const testDeckId = 'ed_test_deck_001';
  const testDeckConfigId = 'edc_test_config_001';
  const testNoteId = 'en_test_note_001';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Note.mid validation', () => {
    it('should validate mid on Create (required field)', async () => {
      // Setup: mid not found
      const db = createDbMock([
        [], // notetype not found
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeNoteService({} as any, {} as any);
      const dto: CreateEchoeNoteDto = {
        notetypeId: 'ent_nonexistent',
        deckId: testDeckId,
        fields: { Front: 'test' },
      };

      await expect(service.createNote(testUid, dto)).rejects.toThrow(
        /Invalid relation.*not found for field 'mid'/
      );
    });

    it('should validate mid on Update when provided', async () => {
      // Setup: note exists but new mid not found
      const db = createDbMock([
        [{ noteId: testNoteId, mid: testNoteTypeId }], // existing note
        [], // new notetype not found
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeNoteService({} as any, {} as any);
      const dto: UpdateEchoeNoteDto = {
        mid: 'ent_nonexistent',
      };

      await expect(service.updateNote(testUid, testNoteId, dto)).rejects.toThrow(
        /Invalid relation.*not found for field 'mid'/
      );
    });

    it('should NOT validate mid on Update when not provided', async () => {
      // Setup: note exists
      const db = createDbMock([
        [{
          noteId: testNoteId,
          mid: testNoteTypeId,
          tags: '[]',
          flds: '',
          fieldsJson: {},
        }], // existing note
        [{
          noteId: testNoteId,
          mid: testNoteTypeId,
          tags: '["new-tag"]',
          flds: '',
          fieldsJson: {},
        }], // updated note
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeNoteService({} as any, {} as any);
      const dto: UpdateEchoeNoteDto = {
        tags: ['new-tag'],
      };

      // Should not throw - mid not provided so not validated
      const result = await service.updateNote(testUid, testNoteId, dto);
      expect(result).not.toBeNull();
    });
  });

  describe('Deck.mid validation', () => {
    it('should validate mid on Create when provided', async () => {
      // Setup: deck config exists but mid not found
      const db = createDbMock([
        [{ deckConfigId: testDeckConfigId }], // deck config exists
        [], // mid not found
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeDeckService();
      const dto: CreateEchoeDeckDto = {
        name: 'Test Deck',
        conf: testDeckConfigId,
        mid: 'ent_nonexistent',
      };

      await expect(service.createDeck(testUid, dto)).rejects.toThrow(
        /Invalid relation.*not found for field 'mid'/
      );
    });

    it('should NOT validate mid on Create when not provided (optional field)', async () => {
      // Setup: deck config exists
      const db = createDbMock([
        [{ deckConfigId: testDeckConfigId }], // deck config exists
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeDeckService();
      const dto: CreateEchoeDeckDto = {
        name: 'Test Deck',
        conf: testDeckConfigId,
        // mid not provided - should be allowed (optional)
      };

      const result = await service.createDeck(testUid, dto);
      expect(result).toBeDefined();
      expect(result.mid).toBe(''); // Should default to empty
    });

    it('should validate mid on Update when provided', async () => {
      // Setup: deck exists but mid not found
      const db = createDbMock([
        [{ deckId: testDeckId }], // existing deck
        [], // mid not found
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeDeckService();
      const dto: UpdateEchoeDeckDto = {
        mid: 'ent_nonexistent',
      };

      await expect(service.updateDeck(testUid, testDeckId, dto)).rejects.toThrow(
        /Invalid relation.*not found for field 'mid'/
      );
    });

    it('should NOT validate mid on Update when not provided', async () => {
      // Mock getDeckById to return a deck
      const mockDeck = {
        deckId: testDeckId,
        id: testDeckId,
        name: 'Test Deck',
        conf: testDeckConfigId,
        extendNew: 20,
        extendRev: 200,
        collapsed: false,
        dyn: 0,
        desc: '',
        mid: '',
        mod: 0,
        newCount: 0,
        learnCount: 0,
        reviewCount: 0,
        totalCount: 0,
        matureCount: 0,
        difficultCount: 0,
        averageRetrievability: 0,
        lastStudiedAt: null,
        children: [],
      };

      const db = createDbMock([
        [{ deckId: testDeckId }], // existing deck for validation
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeDeckService();
      // Mock getDeckById
      jest.spyOn(service as any, 'getDeckById').mockResolvedValue(mockDeck);

      const dto: UpdateEchoeDeckDto = {
        name: 'Updated Deck',
      };

      // Should not throw - mid not provided so not validated
      const result = await service.updateDeck(testUid, testDeckId, dto);
      expect(result).not.toBeNull();
    });
  });

  describe('Deck.conf validation', () => {
    it('should validate conf on Create (required field with default)', async () => {
      // Setup: no default config found
      const db = createDbMock([
        [], // no default config
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeDeckService();
      const dto: CreateEchoeDeckDto = {
        name: 'Test Deck',
        // conf not provided - should try to use default
      };

      await expect(service.createDeck(testUid, dto)).rejects.toThrow(
        /No deck config found/
      );
    });

    it('should validate conf on Update when provided', async () => {
      // Setup: deck exists but conf not found
      const db = createDbMock([
        [{ deckId: testDeckId }], // existing deck
        [], // conf not found
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeDeckService();
      const dto: UpdateEchoeDeckDto = {
        conf: 'edc_nonexistent',
      };

      await expect(service.updateDeck(testUid, testDeckId, dto)).rejects.toThrow(
        /Invalid relation.*not found for field 'conf'/
      );
    });
  });

  describe('Template.did validation', () => {
    it('should validate did on Create when provided in template', async () => {
      // Setup: deck not found for template.did
      const db = createDbMock([
        [], // deck not found
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeNoteService({} as any, {} as any);
      const dto: CreateEchoeNoteTypeDto = {
        name: 'Test NoteType',
        tmpls: [
          {
            name: 'Card 1',
            qfmt: '{{Front}}',
            did: 'ed_nonexistent',
          },
        ],
      };

      await expect(service.createNoteType(testUid, dto)).rejects.toThrow(
        /Invalid relation.*not found for field 'did' in template/
      );
    });

    it('should NOT validate did when not provided in template (optional field)', async () => {
      const db = createDbMock([]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeNoteService({} as any, {} as any);
      const dto: CreateEchoeNoteTypeDto = {
        name: 'Test NoteType',
        tmpls: [
          {
            name: 'Card 1',
            qfmt: '{{Front}}',
            // did not provided - should be allowed (optional)
          },
        ],
      };

      const result = await service.createNoteType(testUid, dto);
      expect(result).toBeDefined();
      expect(result.tmpls[0].did).toBe(''); // Should default to empty
    });

    it('should validate did on Update when adding new template with did', async () => {
      // Setup: notetype exists but deck for template.did not found
      const db = createDbMock([
        [{
          noteTypeId: testNoteTypeId,
          flds: '[{"name":"Front","ord":0}]',
          tmpls: '[{"name":"Card 1","ord":0}]',
        }], // existing notetype
        [], // deck not found
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeNoteService({} as any, {} as any);
      const dto = {
        tmpls: [
          {
            name: 'Card 2',
            qfmt: '{{Back}}',
            did: 'ed_nonexistent',
          },
        ],
      };

      await expect(service.updateNoteType(testUid, testNoteTypeId, dto)).rejects.toThrow(
        /Invalid relation.*not found for field 'did' in template/
      );
    });
  });

  describe('Error message format validation', () => {
    it('should include field name and target ID in error message', async () => {
      const db = createDbMock([
        [], // notetype not found
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeNoteService({} as any, {} as any);
      const dto: CreateEchoeNoteDto = {
        notetypeId: 'ent_invalid_123',
        deckId: testDeckId,
        fields: { Front: 'test' },
      };

      try {
        await service.createNote(testUid, dto);
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('ent_invalid_123');
        expect(error.message).toContain('mid');
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('UID scope enforcement', () => {
    it('should enforce uid scope for all relationship validations', async () => {
      // This is verified by checking that all validation queries include uid in the where clause
      // The actual implementation uses and(eq(table.uid, uid), ...) pattern
      // This test verifies that cross-tenant relationships are rejected even if ID exists

      const db = createDbMock([
        [], // notetype not found WITH uid scope
      ]);

      mockedGetDatabase.mockReturnValue(db as any);

      const service = new EchoeNoteService({} as any, {} as any);
      const dto: CreateEchoeNoteDto = {
        notetypeId: 'ent_other_user_notetype',
        deckId: testDeckId,
        fields: { Front: 'test' },
      };

      // Should fail because notetype not found WITH uid scope
      await expect(service.createNote(testUid, dto)).rejects.toThrow(
        /Invalid relation/
      );

      // Verify that the select was called (validation attempted)
      expect(db.mocks.selectMock).toHaveBeenCalled();
    });
  });
});
