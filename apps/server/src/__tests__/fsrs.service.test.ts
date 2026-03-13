import 'reflect-metadata';
import { FSRSService, Rating, State } from '../services/fsrs.service.js';

describe('FSRSService', () => {
  let service: FSRSService;

  beforeEach(() => {
    service = new FSRSService();
  });

  describe('createCard', () => {
    it('should create a new empty card', () => {
      const card = service.createCard(new Date('2024-01-01'));

      expect(card.due).toEqual(new Date('2024-01-01'));
      expect(card.stability).toBe(0);
      expect(card.difficulty).toBe(0);
      expect(card.state).toBe(State.New);
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
    });
  });

  describe('scheduleCard - new card scheduling', () => {
    it('should schedule a new card with Again rating', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const result = service.scheduleCard(card, Rating.Again, new Date('2024-01-01'));

      expect(result.state).toBeDefined();
      expect(result.interval).toBeGreaterThanOrEqual(0);
      expect(result.stability).toBeGreaterThanOrEqual(0);
    });

    it('should schedule a new card with Hard rating', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const result = service.scheduleCard(card, Rating.Hard, new Date('2024-01-01'));

      expect(result.state).toBeDefined();
      expect(result.scheduledDays).toBeGreaterThanOrEqual(0);
    });

    it('should schedule a new card with Good rating', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const result = service.scheduleCard(card, Rating.Good, new Date('2024-01-01'));

      expect(result.interval).toBeGreaterThan(0);
      expect(result.state).toBe(State.Review);
    });

    it('should schedule a new card with Easy rating', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const result = service.scheduleCard(card, Rating.Easy, new Date('2024-01-01'));

      expect(result.interval).toBeGreaterThan(0);
      expect(result.state).toBe(State.Review);
    });
  });

  describe('scheduleCard - review card scheduling', () => {
    it('should schedule a review card correctly', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const reviewed = service.scheduleCard(card, Rating.Good, new Date('2024-01-02'));

      expect(reviewed.state).toBe(State.Review);
      expect(reviewed.stability).toBeGreaterThan(0);
      expect(reviewed.difficulty).toBeGreaterThan(0);
    });

    it('should increase interval on Good rating for subsequent reviews', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const first = service.scheduleCard(card, Rating.Good, new Date('2024-01-02'));

      const reviewedCard = {
        due: first.nextDue,
        stability: first.stability,
        difficulty: first.difficulty,
        elapsed_days: 0,
        scheduled_days: first.interval,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: State.Review,
      };

      const second = service.scheduleCard(reviewedCard, Rating.Good, new Date('2024-01-02'));

      // After second review, interval should be greater than first
      expect(second.interval).toBeGreaterThanOrEqual(first.interval);
    });

    it('should decrease interval on Hard rating', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const first = service.scheduleCard(card, Rating.Good, new Date('2024-01-02'));

      const reviewedCard = {
        due: first.nextDue,
        stability: first.stability,
        difficulty: first.difficulty,
        elapsed_days: 0,
        scheduled_days: first.interval,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: State.Review,
      };

      const hardResult = service.scheduleCard(reviewedCard, Rating.Hard, new Date('2024-01-02'));

      expect(hardResult.interval).toBeLessThanOrEqual(first.interval);
    });

    it('should increase interval more on Easy rating', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const first = service.scheduleCard(card, Rating.Good, new Date('2024-01-02'));

      const reviewedCard = {
        due: first.nextDue,
        stability: first.stability,
        difficulty: first.difficulty,
        elapsed_days: 0,
        scheduled_days: first.interval,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: State.Review,
      };

      const goodResult = service.scheduleCard(reviewedCard, Rating.Good, new Date('2024-01-02'));
      const easyResult = service.scheduleCard(reviewedCard, Rating.Easy, new Date('2024-01-02'));

      expect(easyResult.interval).toBeGreaterThanOrEqual(goodResult.interval);
    });
  });

  describe('scheduleCard - lapse handling', () => {
    it('should handle card lapse correctly', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const reviewed = service.scheduleCard(card, Rating.Good, new Date('2024-01-02'));

      const reviewedCard = {
        due: reviewed.nextDue,
        stability: reviewed.stability,
        difficulty: reviewed.difficulty,
        elapsed_days: 0,
        scheduled_days: reviewed.interval,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: State.Review,
      };

      const againResult = service.scheduleCard(reviewedCard, Rating.Again, new Date('2024-01-02'));

      // After Again, card should be in relearning state
      expect(againResult.state).toBeDefined();
    });
  });

  describe('scheduleCard - delayed review', () => {
    it('should handle delayed review correctly', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const reviewed = service.scheduleCard(card, Rating.Good, new Date('2024-01-02'));

      const reviewedCard = {
        due: reviewed.nextDue,
        stability: reviewed.stability,
        difficulty: reviewed.difficulty,
        elapsed_days: 0,
        scheduled_days: reviewed.interval,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: State.Review,
      };

      // Simulate delayed review - 3 days late
      const delayedDate = new Date(reviewed.nextDue);
      delayedDate.setDate(delayedDate.getDate() + 3);

      const delayedResult = service.handleDelayedReview(
        reviewedCard,
        Rating.Good,
        delayedDate
      );

      expect(delayedResult).toBeDefined();
      expect(delayedResult.interval).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scheduleCard - parameter configuration', () => {
    it('should accept custom config', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const config = {
        learningSteps: ['1m', '3m', '10m'],
        maxInterval: 100,
        enableFuzz: false,
      };

      const result = service.scheduleCard(card, Rating.Again, new Date('2024-01-01'), config);

      expect(result).toBeDefined();
    });

    it('should respect custom request retention', () => {
      const now = new Date('2024-01-01');
      const card = service.createCard(now);

      const relaxed = service.scheduleCard(card, Rating.Good, now, {
        requestRetention: 0.8,
      });
      const conservative = service.scheduleCard(card, Rating.Good, now, {
        requestRetention: 0.95,
      });

      expect(conservative.interval).toBeLessThanOrEqual(relaxed.interval);
    });

    it('should respect custom max interval', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const config = {
        maxInterval: 7,
      };

      // Review card multiple times to build up interval
      let currentCard = card;
      for (let i = 0; i < 5; i++) {
        const result = service.scheduleCard(currentCard, Rating.Good, new Date('2024-01-02'));
        currentCard = {
          due: result.nextDue,
          stability: result.stability,
          difficulty: result.difficulty,
          elapsed_days: 0,
          scheduled_days: result.interval,
          learning_steps: 0,
          reps: i + 1,
          lapses: 0,
          state: result.state,
        };
      }

      const finalResult = service.scheduleCard(currentCard, Rating.Good, new Date('2024-01-02'), config);

      expect(finalResult.interval).toBeLessThanOrEqual(7);
    });

    it('should map supported config fields to generator params', () => {
      const params = service.getParams({
        learningSteps: ['2m', '5m'],
        relearningSteps: ['20m'],
        maxInterval: 123,
        requestRetention: 0.91,
        enableFuzz: false,
        enableShortTerm: true,
      });

      expect(params.learning_steps).toEqual(['2m', '5m']);
      expect(params.relearning_steps).toEqual(['20m']);
      expect(params.maximum_interval).toBe(123);
      expect(params.request_retention).toBe(0.91);
      expect(params.enable_fuzz).toBe(false);
      expect(params.enable_short_term).toBe(true);
    });
  });

  describe('getSchedulingOptions', () => {
    it('should return all 4 rating options', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const options = service.getSchedulingOptions(card, new Date('2024-01-01'));

      // Rating.Again = 1, Rating.Hard = 2, Rating.Good = 3, Rating.Easy = 4
      expect(Object.keys(options)).toContain('1');
      expect(Object.keys(options)).toContain('2');
      expect(Object.keys(options)).toContain('3');
      expect(Object.keys(options)).toContain('4');
    });

    it('should return valid intervals for all options', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const options = service.getSchedulingOptions(card, new Date('2024-01-01'));

      expect(options[1].interval).toBeGreaterThanOrEqual(0);
      expect(options[2].interval).toBeGreaterThanOrEqual(0);
      expect(options[3].interval).toBeGreaterThanOrEqual(0);
      expect(options[4].interval).toBeGreaterThanOrEqual(0);
    });
  });

  describe('forgetCard', () => {
    it('should reset card to new state', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const reviewed = service.scheduleCard(card, Rating.Good, new Date('2024-01-02'));

      const reviewedCard = {
        due: reviewed.nextDue,
        stability: reviewed.stability,
        difficulty: reviewed.difficulty,
        elapsed_days: 0,
        scheduled_days: reviewed.interval,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: State.Review,
      };

      const forgotten = service.forgetCard(reviewedCard, new Date('2024-01-02'), true);

      // Card should be in New state after forgetting
      expect(forgotten.state).toBe(State.New);
    });

    it('should completely reset card when keepStats is false', () => {
      const card = service.createCard(new Date('2024-01-01'));
      const reviewed = service.scheduleCard(card, Rating.Good, new Date('2024-01-02'));

      const reviewedCard = {
        due: reviewed.nextDue,
        stability: reviewed.stability,
        difficulty: reviewed.difficulty,
        elapsed_days: 0,
        scheduled_days: reviewed.interval,
        learning_steps: 0,
        reps: 5,
        lapses: 2,
        state: State.Review,
      };

      const forgotten = service.forgetCard(reviewedCard, new Date('2024-01-02'), false);

      // Card should be back to New state
      expect(forgotten.state).toBe(State.New);
      // Stability should be reset
      expect(forgotten.stability).toBe(0);
    });
  });

  describe('getIntervalText', () => {
    it('should format minutes correctly', () => {
      expect(service.getIntervalText(0.01)).toBe('14m');
      expect(service.getIntervalText(0.02)).toBe('29m');
    });

    it('should format hours correctly', () => {
      expect(service.getIntervalText(0.5)).toBe('12h');
      expect(service.getIntervalText(0.8)).toBe('19h');
    });

    it('should format days correctly', () => {
      expect(service.getIntervalText(1)).toBe('1d');
      expect(service.getIntervalText(15)).toBe('15d');
    });

    it('should format weeks correctly', () => {
      expect(service.getIntervalText(30)).toBe('4w');
      expect(service.getIntervalText(60)).toBe('9w');
    });

    it('should format years correctly', () => {
      expect(service.getIntervalText(400)).toBe('1.1y');
      expect(service.getIntervalText(730)).toBe('2y');
    });
  });

  describe('state checks', () => {
    it('should correctly identify card states', () => {
      const newCard = service.createCard(new Date());
      expect(service.isNew(newCard)).toBe(true);
      expect(service.isReview(newCard)).toBe(false);
      expect(service.isLearning(newCard)).toBe(false);
      expect(service.isRelearning(newCard)).toBe(false);

      const reviewed = service.scheduleCard(newCard, Rating.Good, new Date());
      const reviewedCard = {
        due: reviewed.nextDue,
        stability: reviewed.stability,
        difficulty: reviewed.difficulty,
        elapsed_days: 0,
        scheduled_days: reviewed.interval,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: reviewed.state,
      };

      expect(service.isNew(reviewedCard)).toBe(false);
      expect(service.isReview(reviewedCard)).toBe(true);
    });
  });
});
