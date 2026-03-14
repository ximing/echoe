import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
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
import { EchoeNoteService } from '../services/echoe-note.service.js';
import { logger } from '../utils/logger.js';
import { and, eq } from 'drizzle-orm';

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
      cardIds: [1001, 1002],
      action: 'forget',
    });

    expect(forgetCardsMock).toHaveBeenCalledWith('test-uid', [1001, 1002]);
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
      cardIds: [1001, 9999],
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
      cardIds: [2001],
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
      cardIds: [2002],
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
      cardIds: [3001],
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
      cardIds: [4001, 4002, 4003, 4004],
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
      cardIds: [5001],
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
