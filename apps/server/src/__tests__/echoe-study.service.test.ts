import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

import { sql } from 'drizzle-orm';

import { EchoeStudyService } from '../services/echoe-study.service.js';
import { State } from '../services/fsrs.service.js';
import { getDatabase } from '../db/connection.js';
import { calculateRetrievability, getRetrievabilitySqlExpr } from '../utils/fsrs-retrievability.js';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

describe('EchoeStudyService - FSRS input building', () => {
  let service: EchoeStudyService;
  let createCardMock: jest.Mock;

  beforeEach(() => {
    mockedGetDatabase.mockReset();
    createCardMock = jest.fn((now?: Date) => ({
      due: now ?? new Date('2026-03-13T00:00:00.000Z'),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: State.New,
      last_review: undefined,
    }));

    service = new EchoeStudyService(
      {
        createCard: createCardMock,
      } as any,
      {
        getDeckAndSubdeckIds: jest.fn(),
      } as any
    );
  });

  const buildCard = (overrides: Record<string, unknown> = {}) => ({
    id: 1001,
    did: 2001,
    queue: 2,
    due: new Date('2026-03-20T00:00:00.000Z').getTime(),
    stability: 12.5,
    difficulty: 2.35,
    lastReview: new Date('2026-03-10T00:00:00.000Z').getTime(),
    ivl: 30,
    left: 0,
    reps: 10,
    lapses: 1,
    type: State.Review,
    ...overrides,
  });

  const buildFSRSCardInput = (card: Record<string, unknown>, now: Date) => {
    return (service as any).buildFSRSCardInput(card, now);
  };

  const getFSRSConfig = (deckConfig: Record<string, unknown>) => {
    return (service as any).getFSRSConfig(deckConfig);
  };

  it('should derive elapsed_days from now - last_review instead of ivl', () => {
    const now = new Date('2026-03-13T12:00:00.000Z');
    const card = buildCard({
      ivl: 99,
      lastReview: new Date('2026-03-11T12:00:00.000Z').getTime(),
    });

    const fsCardInput = buildFSRSCardInput(card, now);

    expect(fsCardInput.elapsed_days).toBeCloseTo(2, 8);
    expect(fsCardInput.scheduled_days).toBe(99);
    expect(fsCardInput.elapsed_days).not.toBeCloseTo(99, 8);
    expect(fsCardInput.last_review?.toISOString()).toBe('2026-03-11T12:00:00.000Z');
  });

  it('should clamp future last_review to now to avoid negative elapsed_days', () => {
    const now = new Date('2026-03-13T00:00:00.000Z');
    const card = buildCard({
      lastReview: new Date('2026-03-15T00:00:00.000Z').getTime(),
    });

    const fsCardInput = buildFSRSCardInput(card, now);

    expect(fsCardInput.elapsed_days).toBe(0);
    expect(fsCardInput.last_review?.toISOString()).toBe('2026-03-13T00:00:00.000Z');
  });

  it('should keep elapsed_days=0 and last_review undefined when lastReview is 0', () => {
    const now = new Date('2026-03-13T00:00:00.000Z');
    const card = buildCard({
      lastReview: 0,
    });

    const fsCardInput = buildFSRSCardInput(card, now);

    expect(fsCardInput.elapsed_days).toBe(0);
    expect(fsCardInput.last_review).toBeUndefined();
  });

  it('should cap elapsed_days for extreme clock drift values', () => {
    const now = new Date('2200-01-01T00:00:00.000Z');
    const card = buildCard({
      lastReview: new Date('1970-01-02T00:00:00.000Z').getTime(),
    });

    const fsCardInput = buildFSRSCardInput(card, now);

    expect(fsCardInput.elapsed_days).toBe(36500);
    expect(fsCardInput.last_review?.toISOString()).toBe('1970-01-02T00:00:00.000Z');
  });

  it('should use native FSRS initialization for uninitialized new cards', () => {
    const now = new Date('2026-03-13T09:00:00.000Z');
    const nativeCard = {
      due: now,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: State.New,
      last_review: undefined,
    };
    createCardMock.mockReturnValue(nativeCard);

    const card = buildCard({
      queue: 0,
      type: State.New,
      stability: 0,
      difficulty: 0,
      lastReview: 0,
      ivl: 0,
      reps: 0,
      lapses: 0,
      left: 0,
    });

    const fsCardInput = buildFSRSCardInput(card, now);

    expect(createCardMock).toHaveBeenCalledWith(now);
    expect(fsCardInput).toBe(nativeCard);
  });

  it('should reuse timing context in legacy fallback path', () => {
    const now = new Date('2026-03-13T00:00:00.000Z');
    const card = buildCard({
      stability: 0,
      difficulty: 0,
      ivl: 42,
      lastReview: new Date('2026-03-10T00:00:00.000Z').getTime(),
      type: State.Review,
    });

    const fsCardInput = buildFSRSCardInput(card, now);

    expect(fsCardInput.elapsed_days).toBeCloseTo(3, 8);
    expect(fsCardInput.scheduled_days).toBe(42);
    expect(fsCardInput.difficulty).toBe(2.5);
    expect(fsCardInput.last_review?.toISOString()).toBe('2026-03-10T00:00:00.000Z');
    expect(createCardMock).not.toHaveBeenCalled();
  });

  describe('timing boundary scenarios', () => {
    it('should keep elapsed_days near zero when crossing midnight by seconds', () => {
      const lastReview = new Date('2026-03-13T23:59:59.000Z').getTime();
      const now = new Date('2026-03-14T00:00:01.000Z');
      const card = buildCard({ lastReview });

      const fsCardInput = buildFSRSCardInput(card, now);

      expect(fsCardInput.elapsed_days).toBeLessThan(0.001);
      expect(fsCardInput.last_review?.toISOString()).toBe('2026-03-13T23:59:59.000Z');
    });

    it('should use absolute timestamp when timezone representation changes', () => {
      const lastReviewInBeijing = new Date('2026-03-13T21:00:00+08:00').getTime();
      const nowInLondon = new Date('2026-03-13T13:00:00.000Z');
      const card = buildCard({ lastReview: lastReviewInBeijing });

      const fsCardInput = buildFSRSCardInput(card, nowInLondon);

      expect(fsCardInput.elapsed_days).toBe(0);
      expect(fsCardInput.last_review?.toISOString()).toBe('2026-03-13T13:00:00.000Z');
    });

    it('should clamp elapsed_days when system time rolls back', () => {
      const lastReview = new Date('2026-03-13T12:00:00.000Z').getTime();
      const now = new Date('2026-03-13T10:00:00.000Z');
      const card = buildCard({ lastReview });

      const fsCardInput = buildFSRSCardInput(card, now);

      expect(fsCardInput.elapsed_days).toBe(0);
      expect(fsCardInput.last_review?.toISOString()).toBe('2026-03-13T10:00:00.000Z');
    });
  });

  it('should prefer fsrs sub-config over legacy deck fields', () => {
    const config = getFSRSConfig({
      id: 99,
      newConfig: JSON.stringify({ steps: [1, 10] }),
      revConfig: JSON.stringify({
        maxInterval: 120,
        fsrs: {
          requestRetention: 0.93,
          maxInterval: 45,
          enableFuzz: false,
          enableShortTerm: true,
          learningSteps: [2, 15],
          relearningSteps: ['20m'],
        },
      }),
      lapseConfig: JSON.stringify({ steps: [10] }),
    });

    expect(config.requestRetention).toBe(0.93);
    expect(config.maxInterval).toBe(45);
    expect(config.enableFuzz).toBe(false);
    expect(config.enableShortTerm).toBe(true);
    expect(config.learningSteps).toEqual(['2m', '15m']);
    expect(config.relearningSteps).toEqual(['20m']);
  });

  it('should fallback to legacy fields when fsrs sub-config is missing', () => {
    const config = getFSRSConfig({
      id: 100,
      newConfig: JSON.stringify({ delays: [3, 12] }),
      revConfig: JSON.stringify({ maxInterval: 180 }),
      lapseConfig: JSON.stringify({ delays: [25] }),
    });

    expect(config.learningSteps).toEqual(['3m', '12m']);
    expect(config.relearningSteps).toEqual(['25m']);
    expect(config.maxInterval).toBe(180);
    expect(config.requestRetention).toBe(0.9);
    expect(config.enableFuzz).toBe(true);
    expect(config.enableShortTerm).toBe(false);
  });

  it('should fallback invalid fsrs values to safe defaults', () => {
    const config = getFSRSConfig({
      id: 101,
      newConfig: JSON.stringify({ delays: [6, 16] }),
      revConfig: JSON.stringify({
        maxInterval: 150,
        fsrs: {
          requestRetention: 1.5,
          maxInterval: -20,
          enableFuzz: 'no',
          enableShortTerm: 1,
          learningSteps: ['bad-step'],
          relearningSteps: [0],
        },
      }),
      lapseConfig: JSON.stringify({ delays: [11] }),
    });

    expect(config.learningSteps).toEqual(['6m', '16m']);
    expect(config.relearningSteps).toEqual(['11m']);
    expect(config.maxInterval).toBe(150);
    expect(config.requestRetention).toBe(0.9);
    expect(config.enableFuzz).toBe(true);
    expect(config.enableShortTerm).toBe(false);
  });
});

describe('EchoeStudyService - revlog type mapping', () => {
  let service: EchoeStudyService;

  beforeEach(() => {
    mockedGetDatabase.mockReset();
    service = new EchoeStudyService(
      {
        createCard: jest.fn(),
      } as any,
      {
        getDeckAndSubdeckIds: jest.fn(),
      } as any
    );
  });

  const resolveRevlogType = (cardOverrides: Record<string, unknown>, deckOverrides: Record<string, unknown> = {}) => {
    return (service as any).resolveRevlogType(
      {
        id: 1001,
        queue: 0,
        type: State.New,
        ...cardOverrides,
      },
      {
        dyn: 0,
        ...deckOverrides,
      }
    );
  };

  it('should map new and learning states to revlog learn type', () => {
    expect(resolveRevlogType({ queue: 0, type: State.New })).toBe(0);
    expect(resolveRevlogType({ queue: 1, type: State.Learning })).toBe(0);
  });

  it('should map review state to revlog review type', () => {
    expect(resolveRevlogType({ queue: 2, type: State.Review })).toBe(1);
  });

  it('should map relearning state to revlog relearn type', () => {
    expect(resolveRevlogType({ queue: 3, type: State.Relearning })).toBe(2);
  });

  it('should keep custom study type for filtered decks', () => {
    expect(resolveRevlogType({ queue: 2, type: State.Review }, { dyn: 1 })).toBe(4);
  });
});

describe('EchoeStudyService - forgetCards', () => {
  let service: EchoeStudyService;
  let forgetCardMock: jest.Mock;

  beforeEach(() => {
    mockedGetDatabase.mockReset();

    // forgetCard returns a reset Card with stability=0, difficulty=0
    forgetCardMock = jest.fn((_card, _now, _keepStats) => ({
      due: new Date('2026-03-13T00:00:00.000Z'),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0, // State.New
      last_review: undefined,
    }));

    service = new EchoeStudyService(
      {
        createCard: jest.fn(),
        toFSCard: jest.fn((input) => input),
        forgetCard: forgetCardMock,
      } as any,
      {
        getDeckAndSubdeckIds: jest.fn(),
      } as any
    );
  });

  it('should reset FSRS core fields when forgetting cards, factor must be 0 not 2500', async () => {
    const whereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    const mockCard = {
      id: 1001,
      due: new Date('2026-03-10T00:00:00.000Z').getTime(),
      stability: 12.5,
      difficulty: 2.35,
      ivl: 30,
      left: 0,
      reps: 10,
      lapses: 1,
      type: 2, // State.Review
      lastReview: new Date('2026-03-01T00:00:00.000Z').getTime(),
    };

    mockedGetDatabase.mockReturnValue({
      update: updateMock,
      query: {
        echoeCards: {
          findFirst: jest.fn().mockResolvedValue(mockCard),
        },
      },
    } as any);

    await service.forgetCards([1001]);

    expect(forgetCardMock).toHaveBeenCalledTimes(1);
    expect(forgetCardMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      false
    );

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        factor: 0,       // ← stability=0 → factor=0，修复前错误值为 2500
        stability: 0,
        difficulty: 0,
        ivl: 0,
        reps: 0,
        lapses: 0,
        type: 0,
        queue: 0,
        lastReview: 0,
      })
    );
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it('should skip cards that are not found in database', async () => {
    const updateMock = jest.fn();

    mockedGetDatabase.mockReturnValue({
      update: updateMock,
      query: {
        echoeCards: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
    } as any);

    await service.forgetCards([9999]);

    expect(forgetCardMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('should process each card individually', async () => {
    const whereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    const makeCard = (id: number) => ({
      id,
      due: Date.now(),
      stability: 5,
      difficulty: 3,
      ivl: 10,
      left: 0,
      reps: 5,
      lapses: 0,
      type: 2,
      lastReview: Date.now() - 86400000,
    });

    mockedGetDatabase.mockReturnValue({
      update: updateMock,
      query: {
        echoeCards: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(makeCard(1001))
            .mockResolvedValueOnce(makeCard(1002)),
        },
      },
    } as any);

    await service.forgetCards([1001, 1002]);

    expect(forgetCardMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(whereMock).toHaveBeenCalledTimes(2);
  });
});

describe('EchoeStudyService - unburyAtDayBoundary ownership guard', () => {
  let service: EchoeStudyService;

  beforeEach(() => {
    mockedGetDatabase.mockReset();
    service = new EchoeStudyService(
      {
        createCard: jest.fn(),
      } as any,
      {
        getDeckAndSubdeckIds: jest.fn(),
      } as any
    );
  });

  it('should skip unbury when uid is missing', async () => {
    const selectDistinctMock = jest.fn();

    mockedGetDatabase.mockReturnValue({
      selectDistinct: selectDistinctMock,
    } as any);

    const count = await service.unburyAtDayBoundary('');

    expect(count).toBe(0);
    expect(selectDistinctMock).not.toHaveBeenCalled();
  });

  it('should use leftJoin and unbury cards owned by uid', async () => {
    const whereSelectMock = jest.fn().mockResolvedValue([
      { id: 1001, type: 0 },
      { id: 1002, type: 3 },
    ]);
    const leftJoinMock = jest.fn().mockReturnValue({ where: whereSelectMock });
    const fromMock = jest.fn().mockReturnValue({ leftJoin: leftJoinMock });
    const selectDistinctMock = jest.fn().mockReturnValue({ from: fromMock });

    const whereUpdateMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereUpdateMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    mockedGetDatabase.mockReturnValue({
      selectDistinct: selectDistinctMock,
      update: updateMock,
    } as any);

    const count = await service.unburyAtDayBoundary('user-a');

    expect(count).toBe(2);
    expect(selectDistinctMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledTimes(1);
    // Must use leftJoin (not innerJoin) so cards with no revlog are also unburied
    expect(leftJoinMock).toHaveBeenCalledTimes(1);
    expect(whereSelectMock).toHaveBeenCalledTimes(1);

    expect(setMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        queue: 0,
        usn: -1,
      })
    );
    expect(setMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        queue: 3,
        usn: -1,
      })
    );
    expect(whereUpdateMock).toHaveBeenCalledTimes(2);
  });

  it('should unbury new cards with no revlog (sibling-buried before first review)', async () => {
    // Simulate a card that was sibling-buried (queue=-3) but has never been reviewed
    // (no revlog entry). With the old INNER JOIN it would never be found; with the
    // new LEFT JOIN + IS NULL condition it must be included.
    const whereSelectMock = jest.fn().mockResolvedValue([
      { id: 2001, type: 0 }, // new card, no revlog
    ]);
    const leftJoinMock = jest.fn().mockReturnValue({ where: whereSelectMock });
    const fromMock = jest.fn().mockReturnValue({ leftJoin: leftJoinMock });
    const selectDistinctMock = jest.fn().mockReturnValue({ from: fromMock });

    const whereUpdateMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereUpdateMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    mockedGetDatabase.mockReturnValue({
      selectDistinct: selectDistinctMock,
      update: updateMock,
    } as any);

    const count = await service.unburyAtDayBoundary('user-b');

    // The card must be unburied despite having no revlog
    expect(count).toBe(1);
    expect(leftJoinMock).toHaveBeenCalledTimes(1);
    // New card (type=0) should be restored to queue=0
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 0,
        usn: -1,
      })
    );
    expect(whereUpdateMock).toHaveBeenCalledTimes(1);
  });
});

describe('EchoeStudyService - unburyAtDayBoundaryForAllUsers', () => {
  let service: EchoeStudyService;

  beforeEach(() => {
    mockedGetDatabase.mockReset();
    service = new EchoeStudyService(
      {
        createCard: jest.fn(),
      } as any,
      {
        getDeckAndSubdeckIds: jest.fn(),
      } as any
    );
  });

  it('should aggregate unbury counts across active users', async () => {
    const whereMock = jest.fn().mockResolvedValue([{ uid: 'user-a' }, { uid: 'user-b' }]);
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    const selectMock = jest.fn().mockReturnValue({ from: fromMock });

    mockedGetDatabase.mockReturnValue({
      select: selectMock,
    } as any);

    const unburySpy = jest
      .spyOn(service, 'unburyAtDayBoundary')
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    const result = await service.unburyAtDayBoundaryForAllUsers();

    expect(result).toEqual({ userCount: 2, unburiedCount: 5 });
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(whereMock).toHaveBeenCalledTimes(1);
    expect(unburySpy).toHaveBeenNthCalledWith(1, 'user-a');
    expect(unburySpy).toHaveBeenNthCalledWith(2, 'user-b');
  });

  it('should return zero counts when no active users exist', async () => {
    const whereMock = jest.fn().mockResolvedValue([]);
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    const selectMock = jest.fn().mockReturnValue({ from: fromMock });

    mockedGetDatabase.mockReturnValue({
      select: selectMock,
    } as any);

    const unburySpy = jest.spyOn(service, 'unburyAtDayBoundary').mockResolvedValue(1);

    const result = await service.unburyAtDayBoundaryForAllUsers();

    expect(result).toEqual({ userCount: 0, unburiedCount: 0 });
    expect(unburySpy).not.toHaveBeenCalled();
  });
});

describe('EchoeStudyService - submitReview learning_steps persistence', () => {
  let service: EchoeStudyService;
  let scheduleCardMock: jest.Mock;

  beforeEach(() => {
    mockedGetDatabase.mockReset();

    scheduleCardMock = jest.fn();

    service = new EchoeStudyService(
      {
        createCard: jest.fn(),
        scheduleCard: scheduleCardMock,
      } as any,
      {
        getDeckAndSubdeckIds: jest.fn(),
      } as any
    );
  });

  const buildDbCard = (overrides: Record<string, unknown> = {}) => ({
    id: 1001,
    nid: 2001,
    did: 3001,
    ord: 0,
    due: Date.now() - 1000,
    ivl: 0,
    factor: 0,
    reps: 1,
    lapses: 0,
    left: 1, // 当前处于第 2 步（还剩 1 步）
    type: State.Learning,
    queue: 1,
    stability: 0.5,
    difficulty: 5.0,
    lastReview: Date.now() - 60000,
    mod: 0,
    usn: -1,
    ...overrides,
  });

  const buildMockSchedulingResult = (learningSteps: number) => ({
    nextDue: new Date(Date.now() + 600000), // 10 分钟后
    interval: 0,
    stability: 0.8,
    difficulty: 5.0,
    state: State.Learning,
    scheduledDays: 0,
    learningSteps, // ts-fsrs 更新后的步骤计数
  });

  it('should persist learning_steps from FSRS output to card.left', async () => {
    // Learning 阶段，第一步答 Good → ts-fsrs 返回 learningSteps=1（还剩第 2 步）
    const expectedLearningSteps = 1;
    scheduleCardMock.mockReturnValue(buildMockSchedulingResult(expectedLearningSteps));

    const whereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });
    const insertIntoValuesMock = jest.fn().mockResolvedValue(undefined);
    const insertMock = jest.fn().mockReturnValue({ values: insertIntoValuesMock });

    const updatedCard = { ...buildDbCard({ left: expectedLearningSteps }) };

    mockedGetDatabase.mockReturnValue({
      update: updateMock,
      insert: insertMock,
      query: {
        echoeCards: {
          findFirst: jest.fn()
            .mockResolvedValueOnce(buildDbCard())   // 第 1 次：获取原始卡片
            .mockResolvedValueOnce(updatedCard),    // 第 2 次：获取更新后卡片
        },
        echoeNotes: {
          findFirst: jest.fn().mockResolvedValue({
            id: 2001, mid: 4001, sfld: 'Front', tags: '[]',
            fieldsJson: { Front: 'Question', Back: 'Answer' },
            mod: 0, csum: 0,
          }),
        },
        echoeDecks: {
          findFirst: jest.fn().mockResolvedValue({ id: 3001, conf: 1, dyn: 0 }),
        },
        echoeDeckConfig: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        echoeNotetypes: {
          findFirst: jest.fn().mockResolvedValue({
            id: 4001, type: 0,
            tmpls: JSON.stringify([{ qfmt: '{{Front}}', afmt: '{{Back}}' }]),
          }),
        },
      },
    } as any);

    await service.submitReview({ cardId: 1001, rating: 3, timeTaken: 5000 });

    // 断言写库时 left = learningSteps（来自 FSRS 结果），而非硬编码 0
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        left: expectedLearningSteps,
      })
    );
  });

  it('should write left=0 when FSRS output has learningSteps=0 (graduated)', async () => {
    // Learning 阶段最后一步答 Good → 毕业，ts-fsrs 返回 learningSteps=0
    const expectedLearningSteps = 0;
    scheduleCardMock.mockReturnValue({
      ...buildMockSchedulingResult(expectedLearningSteps),
      state: State.Review,
      interval: 1,
      scheduledDays: 1,
    });

    const whereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });
    const insertIntoValuesMock = jest.fn().mockResolvedValue(undefined);
    const insertMock = jest.fn().mockReturnValue({ values: insertIntoValuesMock });

    const updatedCard = { ...buildDbCard({ left: 0, type: State.Review, queue: 2 }) };

    mockedGetDatabase.mockReturnValue({
      update: updateMock,
      insert: insertMock,
      query: {
        echoeCards: {
          findFirst: jest.fn()
            .mockResolvedValueOnce(buildDbCard({ left: 1 }))
            .mockResolvedValueOnce(updatedCard),
        },
        echoeNotes: {
          findFirst: jest.fn().mockResolvedValue({
            id: 2001, mid: 4001, sfld: 'Front', tags: '[]',
            fieldsJson: { Front: 'Question', Back: 'Answer' },
            mod: 0, csum: 0,
          }),
        },
        echoeDecks: {
          findFirst: jest.fn().mockResolvedValue({ id: 3001, conf: 1, dyn: 0 }),
        },
        echoeDeckConfig: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        echoeNotetypes: {
          findFirst: jest.fn().mockResolvedValue({
            id: 4001, type: 0,
            tmpls: JSON.stringify([{ qfmt: '{{Front}}', afmt: '{{Back}}' }]),
          }),
        },
      },
    } as any);

    await service.submitReview({ cardId: 1001, rating: 3, timeTaken: 5000 });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        left: 0,
      })
    );
  });
});

describe('fsrs-retrievability utility', () => {
  const extractSqlText = (expr: unknown): string => {
    const chunks = (expr as { queryChunks?: unknown[] } | null | undefined)?.queryChunks;
    if (!Array.isArray(chunks)) {
      return '';
    }

    return chunks
      .flatMap((chunk: unknown) => {
        if (typeof chunk === 'string') {
          return [chunk];
        }

        const value = (chunk as { value?: unknown } | null | undefined)?.value;
        if (Array.isArray(value)) {
          return value.filter((item): item is string => typeof item === 'string');
        }

        if (typeof value === 'string') {
          return [value];
        }

        return [];
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  it('should return null for uninitialized cards', () => {
    const now = new Date('2026-03-13T00:00:00.000Z').getTime();

    expect(calculateRetrievability(0, 10, now)).toEqual({
      value: null,
      isNew: true,
    });
    expect(calculateRetrievability(now - 1000, 0, now)).toEqual({
      value: null,
      isNew: true,
    });
  });

  it('should return 1 for future lastReview timestamps', () => {
    const now = new Date('2026-03-13T00:00:00.000Z').getTime();
    const futureLastReview = now + 24 * 60 * 60 * 1000;

    expect(calculateRetrievability(futureLastReview, 10, now)).toEqual({
      value: 1,
      isNew: false,
    });
  });

  it('should calculate retrievability consistently across day boundaries', () => {
    const stability = 10;
    const lastReview = new Date('2026-03-13T23:59:59.000Z').getTime();
    const beforeMidnight = new Date('2026-03-13T23:59:59.500Z').getTime();
    const afterMidnight = new Date('2026-03-14T00:00:00.500Z').getTime();

    const before = calculateRetrievability(lastReview, stability, beforeMidnight);
    const after = calculateRetrievability(lastReview, stability, afterMidnight);

    expect(before.value).not.toBeNull();
    expect(after.value).not.toBeNull();
    expect(Math.abs((after.value as number) - (before.value as number))).toBeLessThan(0.000001);
  });

  it('should keep extreme results within [0, 1]', () => {
    const now = new Date('2026-03-13T00:00:00.000Z').getTime();
    const veryOldReview = new Date('1970-01-02T00:00:00.000Z').getTime();
    const result = calculateRetrievability(veryOldReview, 0.01, now);

    expect(result.isNew).toBe(false);
    expect(result.value).not.toBeNull();
    expect(result.value!).toBeGreaterThanOrEqual(0);
    expect(result.value!).toBeLessThanOrEqual(1);
  });

  it('should keep SQL helper guard semantics aligned with TS', () => {
    const now = new Date('2026-03-13T00:00:00.000Z').getTime();

    expect(calculateRetrievability(0, 10, now)).toEqual({
      value: null,
      isNew: true,
    });
    expect(calculateRetrievability(now - 1000, 0, now)).toEqual({
      value: null,
      isNew: true,
    });
    expect(calculateRetrievability(now + 1000, 10, now)).toEqual({
      value: 1,
      isNew: false,
    });

    const retrievabilityExpr = getRetrievabilitySqlExpr(now, sql.raw('lastReview'), sql.raw('stability'));
    const sqlText = extractSqlText(retrievabilityExpr);

    expect(sqlText).toContain('CASE');
    expect(sqlText).toContain('<= 0 OR');
    expect(sqlText).toContain('THEN NULL');
    expect(sqlText).toContain('< 0 THEN 1');
    expect(sqlText).toContain('POWER(1 +');
  });
});
