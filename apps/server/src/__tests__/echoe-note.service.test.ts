import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../db/transaction.js', () => ({
  withTransaction: jest.fn((cb: (tx: any) => Promise<any>) => cb({ insert: jest.fn(), delete: jest.fn() })),
}));

jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return {
    ...actual,
    and: jest.fn((...args) => ({ __type: 'and', args })),
    eq: jest.fn((col, val) => ({ __type: 'eq', col, val })),
  };
});

import { getDatabase } from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { EchoeNoteService } from '../services/echoe-note.service.js';
import { logger } from '../utils/logger.js';
import { and, eq } from 'drizzle-orm';

const mockedWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

describe('EchoeNoteService - bulk forget consistency', () => {
  let forgetCardsMock: jest.Mock;

  beforeEach(() => {
    forgetCardsMock = jest.fn().mockResolvedValue(2);
    mockedGetDatabase.mockReset();
  });

  it('should delegate bulk forget to study service FSRS reset flow', async () => {
    const updateMock = jest.fn();

    mockedGetDatabase.mockReturnValue({
      update: updateMock,
    } as any);

    const service = new EchoeNoteService(
      { forgetCards: forgetCardsMock } as any,
      {} as any,
    );

    const result = await service.bulkCardOperation('test-uid', {
      cardIds: ['ec_1001', 'ec_1002'],
      action: 'forget',
    });

    expect(forgetCardsMock).toHaveBeenCalledWith('test-uid', ['ec_1001', 'ec_1002']);
    expect(updateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, affected: 2 });
  });

  it('should return affected count from study service forget result', async () => {
    forgetCardsMock.mockResolvedValue(1);

    mockedGetDatabase.mockReturnValue({} as any);

    const service = new EchoeNoteService(
      { forgetCards: forgetCardsMock } as any,
      {} as any,
    );

    const result = await service.bulkCardOperation('test-uid', {
      cardIds: ['ec_1001', 'ec_9999'],
      action: 'forget',
    });

    expect(result).toEqual({ success: true, affected: 1 });
  });
});

describe('EchoeNoteService - unsuspend/unbury relearning restore', () => {
  const setupQueueRestoreDb = (cards: Array<{ id: number; type: number }>) => {
    const whereSelectMock = jest.fn().mockResolvedValue(cards);
    const fromMock = jest.fn().mockReturnValue({ where: whereSelectMock });
    const selectMock = jest.fn().mockReturnValue({ from: fromMock });

    const whereUpdateMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereUpdateMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    mockedGetDatabase.mockReturnValue({
      select: selectMock,
      update: updateMock,
    } as any);

    return {
      setMock,
      whereUpdateMock,
      whereSelectMock,
    };
  };

  beforeEach(() => {
    mockedGetDatabase.mockReset();
    jest.restoreAllMocks();
  });

  it('should restore relearning cards to queue=3 when unsuspending', async () => {
    const { setMock, whereUpdateMock } = setupQueueRestoreDb([{ id: 2001, type: 3 }]);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    const result = await service.bulkCardOperation('test-uid', {
      cardIds: ['ec_2001'],
      action: 'unsuspend',
    });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 3,
        usn: 0,
      })
    );
    expect(whereUpdateMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, affected: 1 });
  });

  it('should restore relearning cards to queue=3 when unburying', async () => {
    const { setMock, whereUpdateMock } = setupQueueRestoreDb([{ id: 2002, type: 3 }]);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    const result = await service.bulkCardOperation('test-uid', {
      cardIds: ['ec_2002'],
      action: 'unbury',
    });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 3,
        usn: 0,
      })
    );
    expect(whereUpdateMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, affected: 1 });
  });

  it('should fallback unknown card types to queue=0 and emit warn log', async () => {
    const { setMock, whereUpdateMock } = setupQueueRestoreDb([{ id: 3001, type: 99 }]);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    const result = await service.bulkCardOperation('test-uid', {
      cardIds: ['ec_3001'],
      action: 'unsuspend',
    });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 0,
        usn: 0,
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Fallback queue restore for unknown card type in unsuspend',
      expect.objectContaining({
        uid: 'test-uid',
        fallbackQueue: 0,
      })
    );
    expect(whereUpdateMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, affected: 1 });
  });

  it('should lock type-to-queue mapping semantics for unsuspend', async () => {
    const { setMock, whereUpdateMock } = setupQueueRestoreDb([
      { id: 4001, type: 0 },
      { id: 4002, type: 1 },
      { id: 4003, type: 2 },
      { id: 4004, type: 3 },
    ]);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    const result = await service.bulkCardOperation('test-uid', {
      cardIds: ['ec_4001', 'ec_4002', 'ec_4003', 'ec_4004'],
      action: 'unsuspend',
    });

    const restoredQueues = setMock.mock.calls.map((call) => call[0].queue).sort((a, b) => a - b);

    expect(restoredQueues).toEqual([0, 1, 2, 3]);
    expect(whereUpdateMock).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ success: true, affected: 4 });
  });

  it('should fallback unknown card types and log action context for unbury', async () => {
    const { setMock, whereUpdateMock } = setupQueueRestoreDb([{ id: 5001, type: 98 }]);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    const result = await service.bulkCardOperation('test-uid', {
      cardIds: ['ec_5001'],
      action: 'unbury',
    });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 0,
        usn: 0,
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Fallback queue restore for unknown card type in unbury',
      expect.objectContaining({
        uid: 'test-uid',
        fallbackQueue: 0,
      })
    );
    expect(whereUpdateMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, affected: 1 });
  });
});

describe('EchoeNoteService.getCards - cross-tenant uid filtering in JOIN conditions', () => {
  let andMock: jest.Mock;
  let eqMock: jest.Mock;

  beforeEach(() => {
    mockedGetDatabase.mockReset();
    // drizzle-orm is mocked at module level; grab the mock references
    andMock = and as unknown as jest.Mock;
    eqMock = eq as unknown as jest.Mock;
    andMock.mockClear();
    eqMock.mockClear();
  });

  const buildDbMock = () => {
    // Count query chain: db.select().from().leftJoin().where()
    const countWhereMock = jest.fn().mockResolvedValue([{ count: 0 }]);
    const countLeftJoinMock = jest.fn().mockReturnValue({ where: countWhereMock });
    const countFromMock = jest.fn().mockReturnValue({ leftJoin: countLeftJoinMock, where: countWhereMock });

    // Data query chain: db.select().from().leftJoin().leftJoin().leftJoin().where().orderBy().limit().offset()
    const offsetMock = jest.fn().mockResolvedValue([]);
    const limitMock = jest.fn().mockReturnValue({ offset: offsetMock });
    const orderByMock = jest.fn().mockReturnValue({ limit: limitMock });
    const whereMock = jest.fn().mockReturnValue({ orderBy: orderByMock });
    const innerLeftJoinMock = jest.fn().mockReturnValue({ where: whereMock });
    const midLeftJoinMock = jest.fn().mockReturnValue({ leftJoin: innerLeftJoinMock });
    const outerLeftJoinMock = jest.fn().mockReturnValue({ leftJoin: midLeftJoinMock });
    const fromMock = jest.fn().mockReturnValue({ leftJoin: outerLeftJoinMock });

    let selectCallCount = 0;
    const selectMock = jest.fn().mockImplementation(() => {
      selectCallCount++;
      return selectCallCount === 1 ? { from: countFromMock } : { from: fromMock };
    });

    mockedGetDatabase.mockReturnValue({ select: selectMock } as any);
    return { outerLeftJoinMock, midLeftJoinMock, innerLeftJoinMock };
  };

  it('should include uid in echoeDecks leftJoin condition to prevent cross-tenant metadata leak', async () => {
    const uid = 'user-A';
    buildDbMock();

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      { getDeckAndSubdeckIds: jest.fn().mockResolvedValue([1001]) } as any,
    );

    await service.getCards(uid, { page: 1, limit: 10 });

    // At least one `and()` call must include an eq for the uid value
    // (covers both echoeDecks.uid and echoeNotetypes.uid JOIN conditions)
    const andCalls = andMock.mock.calls;
    const hasUidFilter = andCalls.some((args: any[]) =>
      args.some((arg: any) => arg?.__type === 'eq' && arg?.val === uid)
    );
    expect(hasUidFilter).toBe(true);
  });

  it('should include uid in both echoeDecks and echoeNotetypes leftJoin conditions', async () => {
    const uid = 'user-B';
    buildDbMock();

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      { getDeckAndSubdeckIds: jest.fn().mockResolvedValue([]) } as any,
    );

    await service.getCards(uid, { page: 1, limit: 10 });

    const andCalls = andMock.mock.calls;
    // There must be at least 2 `and()` calls that include uid filtering (one for decks, one for notetypes)
    const uidFilterCount = andCalls.filter((args: any[]) =>
      args.some((arg: any) => arg?.__type === 'eq' && arg?.val === uid)
    ).length;
    expect(uidFilterCount).toBeGreaterThanOrEqual(2);
  });
});

describe('EchoeNoteService.updateNoteType - multi-field batch add', () => {
  beforeEach(() => {
    mockedGetDatabase.mockReset();
  });

  /**
   * Helper: builds the DB mock chains needed by updateNoteType.
   * - select().from().where().limit(1)  → returns notetype row
   * - update().set().where()            → captured for assertion
   * - select().from().where().limit(1)  → getNoteTypeById at the end (returns null to simplify)
   */
  const buildUpdateNoteTypeDbMock = (existingFlds: any[]) => {
    const updateWhereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: updateWhereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    const limitMock = jest.fn();
    let selectCallCount = 0;
    limitMock
      .mockResolvedValueOnce([
        {
          id: 1,
          uid: 'test-uid',
          flds: JSON.stringify(existingFlds),
          tmpls: JSON.stringify([]),
          name: 'Test',
          type: 0,
          mod: 0,
          usn: 0,
          sortf: 0,
          did: null,
          css: '',
          latexPre: '',
          latexPost: '',
        },
      ])
      // second call from getNoteTypeById – return empty to skip full return value check
      .mockResolvedValue([]);

    const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    selectCallCount = 0;
    const selectMock = jest.fn().mockImplementation(() => {
      selectCallCount++;
      return { from: fromMock };
    });

    mockedGetDatabase.mockReturnValue({
      select: selectMock,
      update: updateMock,
    } as any);

    return { setMock, updateWhereMock };
  };

  it('should save ALL fields when dto.flds contains multiple new fields', async () => {
    const existingFlds = [{ name: 'Front', ord: 0 }];
    const { setMock } = buildUpdateNoteTypeDbMock(existingFlds);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await service.updateNoteType('test-uid', 'ent_test_001', {
      flds: [{ name: 'Back' }, { name: 'Extra' }],
    } as any);

    // update().set() must be called exactly twice:
    // once for the base fields (mod/usn) and once for flds
    const fldsCall = setMock.mock.calls.find(
      (call: any[]) => call[0] && call[0].flds !== undefined
    );
    expect(fldsCall).toBeDefined();

    const savedFields = JSON.parse(fldsCall![0].flds);
    expect(savedFields).toHaveLength(3); // 1 existing + 2 new
    expect(savedFields[0].name).toBe('Front');
    expect(savedFields[1].name).toBe('Back');
    expect(savedFields[2].name).toBe('Extra');
  });

  it('should write flds to DB exactly once regardless of how many fields are added', async () => {
    const existingFlds: any[] = [];
    const { setMock } = buildUpdateNoteTypeDbMock(existingFlds);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await service.updateNoteType('test-uid', 'ent_test_001', {
      flds: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    } as any);

    const fldsCalls = setMock.mock.calls.filter(
      (call: any[]) => call[0] && call[0].flds !== undefined
    );
    // Must be exactly ONE DB write for the flds section
    expect(fldsCalls).toHaveLength(1);

    const savedFields = JSON.parse(fldsCalls[0][0].flds);
    expect(savedFields).toHaveLength(3);
    expect(savedFields.map((f: any) => f.name)).toEqual(['A', 'B', 'C']);
  });

  it('should assign correct ord values to all new fields', async () => {
    const existingFlds = [{ name: 'Q', ord: 0 }, { name: 'A', ord: 1 }];
    const { setMock } = buildUpdateNoteTypeDbMock(existingFlds);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await service.updateNoteType('test-uid', 'ent_test_001', {
      flds: [{ name: 'Hint' }, { name: 'Source' }],
    } as any);

    const fldsCall = setMock.mock.calls.find(
      (call: any[]) => call[0] && call[0].flds !== undefined
    );
    const savedFields = JSON.parse(fldsCall![0].flds);
    expect(savedFields[2].ord).toBe(2); // newOrd + 0
    expect(savedFields[3].ord).toBe(3); // newOrd + 1
  });
});

describe('EchoeNoteService.bulkCardOperation - move deckId ownership validation', () => {
  beforeEach(() => {
    mockedGetDatabase.mockReset();
  });

  /**
   * Builds a DB mock where:
   * - select().from().where().limit(1) → returns `deckRows` (for the ownership check)
   * - update().set().where()           → update chain (for the card move)
   */
  const buildMoveMockDb = (deckRows: any[]) => {
    const updateWhereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: updateWhereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    const limitMock = jest.fn().mockResolvedValue(deckRows);
    const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    const selectMock = jest.fn().mockReturnValue({ from: fromMock });

    mockedGetDatabase.mockReturnValue({
      select: selectMock,
      update: updateMock,
    } as any);

    return { updateMock, setMock, updateWhereMock };
  };

  it('should reject move when target deckId does not belong to uid', async () => {
    // Ownership query returns empty – deck belongs to another user
    buildMoveMockDb([]);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await expect(
      service.bulkCardOperation('user-A', {
        cardIds: ['ec_101'],
        action: 'move',
        payload: { deckId: 'ed_9999' },
      })
    ).rejects.toThrow('FORBIDDEN:');
  });

  it('should NOT update cards when deckId ownership check fails', async () => {
    const { updateMock } = buildMoveMockDb([]);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await expect(
      service.bulkCardOperation('user-A', {
        cardIds: ['ec_101', 'ec_102'],
        action: 'move',
        payload: { deckId: 'ed_9999' },
      })
    ).rejects.toThrow();

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('should allow move when target deckId belongs to uid', async () => {
    const { setMock } = buildMoveMockDb([{ id: 42 }]);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    const result = await service.bulkCardOperation('user-A', {
      cardIds: ['ec_101', 'ec_102'],
      action: 'move',
      payload: { deckId: 'ed_042' },
    });

    expect(result).toEqual({ success: true, affected: 2 });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ did: 'ed_042', usn: 0 })
    );
  });

  it('should throw when deckId is missing in move action', async () => {
    // No DB call should be needed – early guard before the ownership check
    mockedGetDatabase.mockReturnValue({} as any);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await expect(
      service.bulkCardOperation('user-A', {
        cardIds: ['ec_101'],
        action: 'move',
      })
    ).rejects.toThrow('deckId is required for move action');
  });
});

describe('EchoeNoteService.updateNoteType - fldRenames migrates existing notes fieldsJson', () => {
  beforeEach(() => {
    mockedGetDatabase.mockReset();
  });

  /**
   * Builds DB mock for updateNoteType with fldRenames:
   *  select call 1: fetch notetype row
   *  update call 1: base updates (mod/usn)
   *  update call 2: rename flds in notetype
   *  select call 2: fetch affected notes
   *  update call 3+: update each note's fieldsJson
   *  select call 3: getNoteTypeById (returns [] to simplify)
   */
  const buildFldRenamesDbMock = (existingFlds: any[], affectedNotes: Array<{ id: number; fieldsJson: Record<string, string> }>) => {
    // Track all update().set() calls in order
    const updateSetCalls: any[] = [];
    const updateWhereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockImplementation((payload: any) => {
      updateSetCalls.push(payload);
      return { where: updateWhereMock };
    });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    // select calls: 1st → notetype row, 2nd → affected notes, 3rd → getNoteTypeById returns []
    let selectCallCount = 0;
    const selectMock = jest.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // fetch notetype
        const limitMock = jest.fn().mockResolvedValue([
          {
            id: 10,
            uid: 'uid-test',
            flds: JSON.stringify(existingFlds),
            tmpls: JSON.stringify([]),
            name: 'TestType',
            type: 0,
            mod: 0,
            usn: 0,
            sortf: 0,
            did: null,
            css: '',
            latexPre: '',
            latexPost: '',
          },
        ]);
        const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
        const fromMock = jest.fn().mockReturnValue({ where: whereMock });
        return { from: fromMock };
      } else if (selectCallCount === 2) {
        // fetch affected notes
        const whereMock = jest.fn().mockResolvedValue(affectedNotes);
        const fromMock = jest.fn().mockReturnValue({ where: whereMock });
        return { from: fromMock };
      } else {
        // getNoteTypeById – return empty to keep test simple
        const limitMock = jest.fn().mockResolvedValue([]);
        const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
        const fromMock = jest.fn().mockReturnValue({ where: whereMock });
        return { from: fromMock };
      }
    });

    mockedGetDatabase.mockReturnValue({
      select: selectMock,
      update: updateMock,
    } as any);

    return { setMock, updateSetCalls };
  };

  it('should rename keys in fieldsJson of existing notes when fldRenames is provided', async () => {
    const existingFlds = [
      { name: 'Front', ord: 0 },
      { name: 'Back', ord: 1 },
    ];
    const notes = [
      { id: 101, fieldsJson: { Front: 'Hello', Back: 'World' } },
      { id: 102, fieldsJson: { Front: 'Foo', Back: 'Bar' } },
    ];

    const { updateSetCalls } = buildFldRenamesDbMock(existingFlds, notes);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await service.updateNoteType('uid-test', 'ent_test_010', {
      fldRenames: [{ from: 'Front', to: 'Question' }],
    } as any);

    // Find calls that updated fieldsJson (note updates)
    const noteUpdateCalls = updateSetCalls.filter((c: any) => c.fieldsJson !== undefined);
    expect(noteUpdateCalls).toHaveLength(2);

    // Note 101: Front → Question, Back unchanged
    const call1 = noteUpdateCalls.find((c: any) => c.fieldsJson['Question'] === 'Hello');
    expect(call1).toBeDefined();
    expect(call1.fieldsJson['Back']).toBe('World');
    expect(call1.fieldsJson['Front']).toBeUndefined();

    // Note 102: Front → Question, Back unchanged
    const call2 = noteUpdateCalls.find((c: any) => c.fieldsJson['Question'] === 'Foo');
    expect(call2).toBeDefined();
    expect(call2.fieldsJson['Back']).toBe('Bar');
    expect(call2.fieldsJson['Front']).toBeUndefined();
  });

  it('should rename field name in notetype flds array when fldRenames is provided', async () => {
    const existingFlds = [
      { name: 'OldName', ord: 0 },
      { name: 'Extra', ord: 1 },
    ];

    const { updateSetCalls } = buildFldRenamesDbMock(existingFlds, []);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await service.updateNoteType('uid-test', 'ent_test_010', {
      fldRenames: [{ from: 'OldName', to: 'NewName' }],
    } as any);

    // Find the notetype flds update call
    const fldsUpdateCall = updateSetCalls.find((c: any) => c.flds !== undefined);
    expect(fldsUpdateCall).toBeDefined();

    const updatedFlds = JSON.parse(fldsUpdateCall.flds);
    expect(updatedFlds[0].name).toBe('NewName');
    expect(updatedFlds[1].name).toBe('Extra');
  });

  it('should skip no-op renames (from === to)', async () => {
    // For no-op, fldRenames logic is skipped entirely, so only 2 select calls:
    // call 1: fetch notetype, call 2: getNoteTypeById (needs limit())
    const existingFlds = [{ name: 'Front', ord: 0 }];

    const updateWhereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: updateWhereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    let noopSelectCount = 0;
    const noopSelectMock = jest.fn().mockImplementation(() => {
      noopSelectCount++;
      // Both calls (fetch notetype + getNoteTypeById) need limit()
      const limitMock = jest.fn().mockResolvedValue(
        noopSelectCount === 1
          ? [{
              id: 10,
              uid: 'uid-test',
              flds: JSON.stringify(existingFlds),
              tmpls: JSON.stringify([]),
              name: 'TestType',
              type: 0,
              mod: 0,
              usn: 0,
              sortf: 0,
              did: null,
              css: '',
              latexPre: '',
              latexPost: '',
            }]
          : []
      );
      const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
      const fromMock = jest.fn().mockReturnValue({ where: whereMock });
      return { from: fromMock };
    });

    mockedGetDatabase.mockReturnValue({
      select: noopSelectMock,
      update: updateMock,
    } as any);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await service.updateNoteType('uid-test', 'ent_test_010', {
      fldRenames: [{ from: 'Front', to: 'Front' }],
    } as any);

    // No flds update or note fieldsJson update should happen for no-op renames
    const fldsUpdateCall = setMock.mock.calls.find((call: any[]) => call[0]?.flds !== undefined);
    expect(fldsUpdateCall).toBeUndefined();

    const noteUpdateCall = setMock.mock.calls.find((call: any[]) => call[0]?.fieldsJson !== undefined);
    expect(noteUpdateCall).toBeUndefined();
  });

  it('should not update notes if there are no notes for the notetype', async () => {
    const existingFlds = [{ name: 'Front', ord: 0 }];

    const { updateSetCalls } = buildFldRenamesDbMock(existingFlds, []);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await service.updateNoteType('uid-test', 'ent_test_010', {
      fldRenames: [{ from: 'Front', to: 'Question' }],
    } as any);

    // Only the notetype flds update should happen; no note updates
    const noteUpdateCalls = updateSetCalls.filter((c: any) => c.fieldsJson !== undefined);
    expect(noteUpdateCalls).toHaveLength(0);

    // But the notetype flds should have been renamed
    const fldsUpdateCall = updateSetCalls.find((c: any) => c.flds !== undefined);
    expect(fldsUpdateCall).toBeDefined();
    const updatedFlds = JSON.parse(fldsUpdateCall.flds);
    expect(updatedFlds[0].name).toBe('Question');
  });

  it('should preserve values of non-renamed fields in fieldsJson', async () => {
    const existingFlds = [
      { name: 'Term', ord: 0 },
      { name: 'Definition', ord: 1 },
      { name: 'Extra', ord: 2 },
    ];
    const notes = [
      {
        id: 301,
        fieldsJson: { Term: 'apple', Definition: 'a fruit', Extra: 'red' },
      },
    ];

    const { updateSetCalls } = buildFldRenamesDbMock(existingFlds, notes);

    const service = new EchoeNoteService(
      { forgetCards: jest.fn() } as any,
      {} as any,
    );

    await service.updateNoteType('uid-test', 'ent_test_010', {
      fldRenames: [{ from: 'Term', to: 'Word' }],
    } as any);

    const noteUpdateCall = updateSetCalls.find((c: any) => c.fieldsJson !== undefined);
    expect(noteUpdateCall).toBeDefined();
      expect(noteUpdateCall.fieldsJson).toEqual({
      Word: 'apple',
      Definition: 'a fruit',
      Extra: 'red',
    });
  });
});

describe('EchoeNoteService.createNote - deckId validation (Refs #54)', () => {
  beforeEach(() => {
    mockedGetDatabase.mockReset();
    mockedWithTransaction.mockReset();
  });

  const buildCreateNoteDbMock = (notetypeRows: any[], deckRows: any[]) => {
    let selectCallCount = 0;
    const selectMock = jest.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First call: notetype validation
        const limitMock = jest.fn().mockResolvedValue(notetypeRows);
        const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
        const fromMock = jest.fn().mockReturnValue({ where: whereMock });
        return { from: fromMock };
      }
      // Second call: deck validation
      const limitMock = jest.fn().mockResolvedValue(deckRows);
      const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
      const fromMock = jest.fn().mockReturnValue({ where: whereMock });
      return { from: fromMock };
    });

    mockedGetDatabase.mockReturnValue({ select: selectMock } as any);
    return { selectMock };
  };

  it('should reject note creation when deckId does not belong to current uid', async () => {
    // Notetype exists, but deck belongs to another user (empty result)
    const notetype = [{ id: 1, uid: 'user-A', noteTypeId: 'ent_type_001', tmpls: '[]', flds: '[]' }];
    buildCreateNoteDbMock(notetype, []);

    const service = new EchoeNoteService({} as any, {} as any);

    await expect(
      service.createNote('user-A', {
        notetypeId: 'ent_type_001',
        deckId: 'ed_9999',
        fields: {},
      } as any)
    ).rejects.toThrow(`Invalid relation: Deck 'ed_9999' not found for field 'did' (deckId)`);
  });

  it('should reject note creation when deckId belongs to different uid (cross-tenant)', async () => {
    // Notetype exists for user-A, but deck check returns empty (deck belongs to user-B)
    const notetype = [{ id: 1, uid: 'user-A', noteTypeId: 'ent_type_001', tmpls: '[]', flds: '[]' }];
    buildCreateNoteDbMock(notetype, []);

    const service = new EchoeNoteService({} as any, {} as any);

    await expect(
      service.createNote('user-A', {
        notetypeId: 'ent_type_001',
        deckId: 'ed_user_B_deck',
        fields: {},
      } as any)
    ).rejects.toThrow(`Invalid relation: Deck 'ed_user_B_deck' not found for field 'did' (deckId)`);
  });

  it('should NOT enter transaction when deckId validation fails', async () => {
    const notetype = [{ id: 1, uid: 'user-A', noteTypeId: 'ent_type_001', tmpls: '[]', flds: '[]' }];
    buildCreateNoteDbMock(notetype, []);

    mockedWithTransaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
      };
      return cb(tx);
    });

    const service = new EchoeNoteService({} as any, {} as any);

    await expect(
      service.createNote('user-A', {
        notetypeId: 'ent_type_001',
        deckId: 'ed_invalid',
        fields: {},
      } as any)
    ).rejects.toThrow();

    // Transaction should never be entered when validation fails
    expect(mockedWithTransaction).not.toHaveBeenCalled();
  });

  it('should include error message with field name and target ID when deckId not found', async () => {
    const notetype = [{ id: 1, uid: 'user-A', noteTypeId: 'ent_type_001', tmpls: '[]', flds: '[]' }];
    buildCreateNoteDbMock(notetype, []);

    const service = new EchoeNoteService({} as any, {} as any);

    await expect(
      service.createNote('user-A', {
        notetypeId: 'ent_type_001',
        deckId: 'ed_nonexistent',
        fields: {},
      } as any)
    ).rejects.toThrow(/Deck 'ed_nonexistent'/);

    // Rebuild the mock for second assertion to avoid mock state issues
    buildCreateNoteDbMock(notetype, []);

    await expect(
      service.createNote('user-A', {
        notetypeId: 'ent_type_001',
        deckId: 'ed_nonexistent',
        fields: {},
      } as any)
    ).rejects.toThrow(/field 'did'/);
  });
});

describe('EchoeNoteService.deleteNote - transaction protection', () => {
  beforeEach(() => {
    mockedGetDatabase.mockReset();
    mockedWithTransaction.mockReset();
    // Default: execute callback immediately (simulates successful transaction)
    mockedWithTransaction.mockImplementation((cb: (tx: any) => Promise<any>) => {
      const tx = {
        insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
        delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      };
      return cb(tx);
    });
  });

  const buildDeleteNoteDbMock = (noteRows: any[], cardRows: any[]) => {
    // Tracks select calls: 1st → note existence check, 2nd → card fetch
    let selectCallCount = 0;
    const selectMock = jest.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // Note existence check: .select().from().where().limit(1)
        const limitMock = jest.fn().mockResolvedValue(noteRows);
        const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
        const fromMock = jest.fn().mockReturnValue({ where: whereMock });
        return { from: fromMock };
      }
      // Card fetch: .select().from().where()
      const whereMock = jest.fn().mockResolvedValue(cardRows);
      const fromMock = jest.fn().mockReturnValue({ where: whereMock });
      return { from: fromMock };
    });

    mockedGetDatabase.mockReturnValue({ select: selectMock } as any);
    return { selectMock };
  };

  it('should return false without entering transaction when note does not exist', async () => {
    buildDeleteNoteDbMock([], []);

    const service = new EchoeNoteService({} as any, {} as any);
    const result = await service.deleteNote('uid-x', 'en_999');

    expect(result).toBe(false);
    expect(mockedWithTransaction).not.toHaveBeenCalled();
  });

  it('should call withTransaction when note exists', async () => {
    buildDeleteNoteDbMock([{ id: 1 }], [{ id: 101 }, { id: 102 }]);

    const service = new EchoeNoteService({} as any, {} as any);
    const result = await service.deleteNote('uid-x', 'en_001');

    expect(result).toBe(true);
    expect(mockedWithTransaction).toHaveBeenCalledTimes(1);
  });

  it('should roll back all DB mutations when an error occurs inside the transaction', async () => {
    buildDeleteNoteDbMock([{ id: 1 }], [{ id: 201 }]);

    // Simulate transaction rollback: callback throws, withTransaction re-throws
    mockedWithTransaction.mockRejectedValue(new Error('DB write failure'));

    const service = new EchoeNoteService({} as any, {} as any);
    await expect(service.deleteNote('uid-x', 'en_001')).rejects.toThrow('DB write failure');
  });

  it('should insert card graves and note grave inside transaction before deleting', async () => {
    const cards = [{ id: 301 }, { id: 302 }];
    buildDeleteNoteDbMock([{ id: 10 }], cards);

    const txInsertValues: any[] = [];
    const txDeleteCalls: number[] = [];

    mockedWithTransaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      let callOrder = 0;
      const tx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation((v: any) => {
            txInsertValues.push(v);
            return Promise.resolve();
          }),
        }),
        delete: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => {
            txDeleteCalls.push(++callOrder);
            return Promise.resolve();
          }),
        }),
      };
      return cb(tx);
    });

    const service = new EchoeNoteService({} as any, {} as any);
    await service.deleteNote('uid-x', 'en_010');

    // Graves: 2 card graves (type=2) + 1 note grave (type=1)
    expect(txInsertValues).toHaveLength(3);
    const cardGraves = txInsertValues.filter((v: any) => v.type === 2);
    const noteGraves = txInsertValues.filter((v: any) => v.type === 1);
    expect(cardGraves).toHaveLength(2);
    expect(noteGraves).toHaveLength(1);
    expect(noteGraves[0].oid).toBe('en_010');

    // Three delete calls: revlogs, cards, then note (FR-3 cascade)
    expect(txDeleteCalls).toHaveLength(3);
  });
});
