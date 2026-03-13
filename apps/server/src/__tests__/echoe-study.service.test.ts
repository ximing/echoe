import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

import { EchoeStudyService } from '../services/echoe-study.service.js';
import { State } from '../services/fsrs.service.js';
import { getDatabase } from '../db/connection.js';
import { calculateRetrievability } from '../utils/fsrs-retrievability.js';

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
    difficulty: 0.35,
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
    expect(fsCardInput.difficulty).toBe(0.3);
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

describe('EchoeStudyService - forgetCards', () => {
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

  it('should reset FSRS core fields when forgetting cards', async () => {
    const whereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    mockedGetDatabase.mockReturnValue({
      update: updateMock,
    } as any);

    await service.forgetCards([1001, 1002]);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ivl: 0,
        reps: 0,
        lapses: 0,
        type: 0,
        queue: 0,
        stability: 0,
        difficulty: 0,
        lastReview: 0,
      })
    );
    expect(whereMock).toHaveBeenCalledTimes(1);
  });
});

describe('fsrs-retrievability utility', () => {
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
});
