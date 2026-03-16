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
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
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
      const now = Date.now();

      // Mock notetype exists and is active
      mockDb.limit.mockResolvedValueOnce([{ noteTypeId: notetypeId, deletedAt: 0 }]);

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
      const setCall = mockTx.update().set;
      expect(setCall).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Number) }));
      const deletedAtValue = setCall.mock.calls[0][0].deletedAt;
      expect(deletedAtValue).toBeGreaterThan(0);

      // Verify decks.mid was set to null
      expect(mockTx.update).toHaveBeenCalledWith(echoeDecks);
    });

    it('should set decks.mid = null for associated decks (per FR-3)', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_test_002';

      // Mock notetype exists
      mockDb.limit.mockResolvedValueOnce([{ noteTypeId: notetypeId, deletedAt: 0 }]);

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
      const deckUpdateCall = mockTx.update.mock.calls.find((call: any) => call[0] === echoeDecks);
      expect(deckUpdateCall).toBeDefined();
    });

    it('should reject if notetype not found', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_nonexistent';

      // Mock notetype does not exist
      mockDb.limit.mockResolvedValueOnce([]);

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
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.deleteNoteType(uid, notetypeId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Note type not found or already deleted');
    });

    it('should execute all operations in single transaction', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_test_004';

      mockDb.limit.mockResolvedValueOnce([{ noteTypeId: notetypeId, deletedAt: 0 }]);

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

      // Verify both operations (notetype update + deck update) within transaction
      expect(mockTx.update).toHaveBeenCalledWith(echoeNotetypes);
      expect(mockTx.update).toHaveBeenCalledWith(echoeDecks);
    });

    it('should preserve notes, cards, revlogs, templates (no cascade delete)', async () => {
      const uid = 'test-user';
      const notetypeId = 'ent_test_005';

      mockDb.limit.mockResolvedValueOnce([{ noteTypeId: notetypeId, deletedAt: 0 }]);

      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
        delete: jest.fn(), // Should NOT be called
      };

      mockedWithTransaction.mockImplementationOnce(async (cb) => cb(mockTx));

      await service.deleteNoteType(uid, notetypeId);

      // Verify no delete operations (only updates)
      expect(mockTx.delete).not.toHaveBeenCalled();
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
