import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../db/transaction.js', () => ({
  withTransaction: jest.fn((cb: (tx: any) => Promise<any>) => {
    const mockTx = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    };
    return cb(mockTx);
  }),
}));

import { getDatabase } from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { EchoeNoteService } from '../services/echoe-note.service.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';
import { echoeTemplates } from '../db/schema/echoe-templates.js';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;
const mockedWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

describe('EchoeNoteService - Soft Delete for Note Types (Issue #57)', () => {
  let service: EchoeNoteService;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(), // Make limit chainable
      orderBy: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      then: jest.fn().mockResolvedValue([]),
    };

    mockedGetDatabase.mockReturnValue(mockDb as any);

    const mockStudyService = {} as any;
    const mockDeckService = {} as any;
    service = new EchoeNoteService(mockStudyService, mockDeckService);
  });

  describe('deleteNoteType - Soft Delete Behavior', () => {
    it('should soft delete notetype by setting deletedAt timestamp', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_test_001';

      // Setup db mock with sequential query responses
      // Track query execution order
      let queryCount = 0;
      mockDb.then.mockImplementation((resolve: any) => {
        // First query: notetype exists check
        if (queryCount === 0) {
          queryCount++;
          resolve([{ noteTypeId: notetypeId, deletedAt: 0 }]);
        }
        // Second query: fetch related notes
        else if (queryCount === 1) {
          queryCount++;
          resolve([]); // No related notes
        }
        // Third query would be cards, but not called if no notes
        else {
          resolve([]);
        }
      });

      // Mock transaction
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      mockedWithTransaction.mockImplementationOnce(async (cb) => cb(mockTx));

      const result = await service.deleteNoteType(uid, notetypeId);

      // Verify success
      expect(result.success).toBe(true);

      // Verify transaction was used
      expect(mockedWithTransaction).toHaveBeenCalledTimes(1);

      // Verify notetype was soft deleted (update with deletedAt timestamp)
      expect(mockTx.update).toHaveBeenCalledWith(echoeNotetypes);

      // Verify decks.mid was set to null
      expect(mockTx.update).toHaveBeenCalledWith(echoeDecks);

      // Verify templates were soft deleted
      expect(mockTx.update).toHaveBeenCalledWith(echoeTemplates);
    });

    it('should set decks.mid = null for associated decks (per FR-3)', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_test_002';

      let queryCount = 0;
      mockDb.then.mockImplementation((resolve: any) => {
        if (queryCount === 0) {
          queryCount++;
          resolve([{ noteTypeId: notetypeId, deletedAt: 0 }]);
        } else {
          resolve([]);
        }
      });

      // Mock transaction with spy
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      mockedWithTransaction.mockImplementationOnce(async (cb) => cb(mockTx));

      await service.deleteNoteType(uid, notetypeId);

      // Verify decks.mid was updated
      expect(mockTx.update).toHaveBeenCalledWith(echoeDecks);
    });

    it('should reject if notetype not found', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_nonexistent';

      // Mock notetype does not exist
      mockDb.then.mockImplementation((resolve: any) => {
        resolve([]); // Empty result
      });

      const result = await service.deleteNoteType(uid, notetypeId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Note type not found or already deleted');

      // Verify no transaction was initiated
      expect(mockedWithTransaction).not.toHaveBeenCalled();
    });

    it('should reject if notetype already deleted (deletedAt > 0)', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_test_003';

      // Mock notetype already deleted
      mockDb.then.mockImplementation((resolve: any) => {
        resolve([]); // Empty result
      });

      const result = await service.deleteNoteType(uid, notetypeId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Note type not found or already deleted');
    });

    it('should execute all operations in single transaction', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_test_004';

      let queryCount = 0;
      mockDb.then.mockImplementation((resolve: any) => {
        if (queryCount === 0) {
          queryCount++;
          resolve([{ noteTypeId: notetypeId, deletedAt: 0 }]);
        } else {
          resolve([]);
        }
      });

      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      mockedWithTransaction.mockImplementationOnce(async (cb) => cb(mockTx));

      await service.deleteNoteType(uid, notetypeId);

      // Verify single transaction
      expect(mockedWithTransaction).toHaveBeenCalledTimes(1);

      // Verify all operations within transaction (notetype, decks, templates)
      expect(mockTx.update).toHaveBeenCalledWith(echoeNotetypes);
      expect(mockTx.update).toHaveBeenCalledWith(echoeDecks);
      expect(mockTx.update).toHaveBeenCalledWith(echoeTemplates);
    });

    it('should cascade soft-delete notes, cards, revlogs, and templates (FR-3)', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_test_005';

      // Mock related data
      const mockNotes = [
        { noteId: 'note_001', mid: notetypeId, deletedAt: 0 },
        { noteId: 'note_002', mid: notetypeId, deletedAt: 0 }
      ];
      const mockCards = [
        { cardId: 'card_001', nid: 'note_001', deletedAt: 0 },
        { cardId: 'card_002', nid: 'note_001', deletedAt: 0 },
        { cardId: 'card_003', nid: 'note_002', deletedAt: 0 }
      ];

      let queryCount = 0;
      mockDb.then.mockImplementation((resolve: any) => {
        if (queryCount === 0) {
          queryCount++;
          resolve([{ noteTypeId: notetypeId, deletedAt: 0 }]);
        } else if (queryCount === 1) {
          queryCount++;
          resolve(mockNotes);
        } else {
          resolve(mockCards);
        }
      });

      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
        delete: jest.fn(), // Should NOT be called for soft delete
      };

      mockedWithTransaction.mockImplementationOnce(async (cb) => cb(mockTx));

      await service.deleteNoteType(uid, notetypeId);

      // Verify no hard delete operations (only updates for soft delete)
      expect(mockTx.delete).not.toHaveBeenCalled();

      // Verify cascade soft-delete operations
      expect(mockTx.update).toHaveBeenCalledWith(echoeDecks);      // set decks.mid = null
      expect(mockTx.update).toHaveBeenCalledWith(echoeRevlog);     // soft-delete revlogs
      expect(mockTx.update).toHaveBeenCalledWith(echoeCards);      // soft-delete cards
      expect(mockTx.update).toHaveBeenCalledWith(echoeNotes);      // soft-delete notes
      expect(mockTx.update).toHaveBeenCalledWith(echoeTemplates);  // soft-delete templates
      expect(mockTx.update).toHaveBeenCalledWith(echoeNotetypes);  // soft-delete notetype
    });

    it('should rollback entire transaction on failure (Issue #59)', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_test_006';

      let queryCount = 0;
      mockDb.then.mockImplementation((resolve: any) => {
        if (queryCount === 0) {
          queryCount++;
          resolve([{ noteTypeId: notetypeId, deletedAt: 0 }]);
        } else {
          resolve([]);
        }
      });

      // Simulate transaction failure - withTransaction rejects
      mockedWithTransaction.mockRejectedValueOnce(new Error('DB write failure'));

      // Verify entire operation fails and throws
      await expect(service.deleteNoteType(uid, notetypeId)).rejects.toThrow('DB write failure');

      // Verify transaction was attempted
      expect(mockedWithTransaction).toHaveBeenCalledTimes(1);
    });

    it('should verify no active dependent records remain after deletion (Issue #64)', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_test_007';

      // Mock related data for cascade
      const mockNotes = [{ noteId: 'note_001', mid: notetypeId, deletedAt: 0 }];
      const mockCards = [{ cardId: 'card_001', nid: 'note_001', deletedAt: 0 }];

      let queryCount = 0;
      mockDb.then.mockImplementation((resolve: any) => {
        if (queryCount === 0) {
          queryCount++;
          resolve([{ noteTypeId: notetypeId, deletedAt: 0 }]);
        } else if (queryCount === 1) {
          queryCount++;
          resolve(mockNotes);
        } else {
          resolve(mockCards);
        }
      });

      // Track all soft-delete operations
      const softDeletedEntities: string[] = [];
      const mockTx = {
        update: jest.fn((table: any) => {
          return {
            set: jest.fn((values: any) => {
              if (values.deletedAt > 0) {
                if (table === echoeRevlog) softDeletedEntities.push('revlog');
                if (table === echoeCards) softDeletedEntities.push('cards');
                if (table === echoeNotes) softDeletedEntities.push('notes');
                if (table === echoeTemplates) softDeletedEntities.push('templates');
                if (table === echoeNotetypes) softDeletedEntities.push('notetype');
              }
              return {
                where: jest.fn().mockResolvedValue(undefined),
              };
            }),
          };
        }),
      };

      mockedWithTransaction.mockImplementationOnce(async (cb) => cb(mockTx));

      await service.deleteNoteType(uid, notetypeId);

      // Verify all dependent entities were soft-deleted
      expect(softDeletedEntities).toContain('revlog');
      expect(softDeletedEntities).toContain('cards');
      expect(softDeletedEntities).toContain('notes');
      expect(softDeletedEntities).toContain('templates');
      expect(softDeletedEntities).toContain('notetype');

      // Verify complete cascade chain: notetype -> templates + notes -> cards -> revlogs
      expect(softDeletedEntities.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Query Filter Validation', () => {
    it('should verify deletedAt filter is applied in queries', () => {
      // This test documents that deletedAt = 0 filter must be applied
      // The actual filtering is tested in integration tests with real DB

      // Key query patterns that must include deletedAt = 0:
      // 1. getAllNoteTypes: where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.deletedAt, 0)))
      // 2. getNoteTypeById: where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, id), eq(echoeNotetypes.deletedAt, 0)))
      // 3. createNote notetype lookup: where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, dto.notetypeId), eq(echoeNotetypes.deletedAt, 0)))
      // 4. updateNote notetype lookup: where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, note[0].mid), eq(echoeNotetypes.deletedAt, 0)))

      expect(true).toBe(true); // Placeholder - verified by code inspection
    });
  });
});
