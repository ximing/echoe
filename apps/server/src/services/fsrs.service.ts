import { Service } from 'typedi';
import {
  Card,
  createEmptyCard,
  fsrs,
  FSRSParameters,
  generatorParameters,
  Rating,
  State,
  formatDate,
} from 'ts-fsrs';

import { DEFAULT_FSRS_RUNTIME_CONFIG } from './fsrs-default-config.js';

export { Rating, State };

export interface FSRSInput {
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: Date;
}

export interface FSRSOutput {
  nextDue: Date;
  interval: number;
  stability: number;
  difficulty: number;
  state: State;
  scheduledDays: number;
  learningSteps: number; // ts-fsrs Card.learning_steps，Learning/Relearning 阶段的步骤计数器
}

export interface FSRSConfig {
  learningSteps?: readonly string[];
  relearningSteps?: readonly string[];
  maxInterval?: number;
  requestRetention?: number;
  enableFuzz?: boolean;
  enableShortTerm?: boolean;
}

@Service()
export class FSRSService {
  private defaultParams: FSRSParameters;

  constructor() {
    this.defaultParams = this.buildParams(DEFAULT_FSRS_RUNTIME_CONFIG);
  }

  private buildParams(config: FSRSConfig): FSRSParameters {
    return generatorParameters({
      learning_steps: config.learningSteps as any,
      relearning_steps: config.relearningSteps as any,
      maximum_interval: config.maxInterval ?? DEFAULT_FSRS_RUNTIME_CONFIG.maxInterval,
      request_retention: config.requestRetention ?? DEFAULT_FSRS_RUNTIME_CONFIG.requestRetention,
      enable_fuzz: config.enableFuzz ?? DEFAULT_FSRS_RUNTIME_CONFIG.enableFuzz,
      enable_short_term: config.enableShortTerm ?? DEFAULT_FSRS_RUNTIME_CONFIG.enableShortTerm,
    });
  }

  getDefaultParams(): FSRSParameters {
    return this.defaultParams;
  }

  getParams(config?: FSRSConfig): FSRSParameters {
    if (!config) {
      return this.defaultParams;
    }
    return this.buildParams(config);
  }

  /**
   * Convert database card to FSRS Card
   */
  toFSCard(input: FSRSInput): Card {
    return {
      due: input.due,
      stability: input.stability,
      difficulty: input.difficulty,
      elapsed_days: input.elapsed_days,
      scheduled_days: input.scheduled_days,
      learning_steps: input.learning_steps,
      reps: input.reps,
      lapses: input.lapses,
      state: input.state,
      last_review: input.last_review,
    };
  }

  /**
   * Create a new empty card
   */
  createCard(now?: Date): Card {
    return createEmptyCard(now);
  }

  /**
   * Schedule a card review
   * @param card - The card to schedule (can be from database or createEmptyCard)
   * @param rating - Rating: 1=Again, 2=Hard, 3=Good, 4=Easy
   * @param now - Current time (defaults to now)
   * @param config - Optional FSRS configuration
   */
  scheduleCard(
    card: Card | FSRSInput,
    rating: number,
    now?: Date,
    config?: FSRSConfig
  ): FSRSOutput {
    const f = fsrs(this.getParams(config));
    const fsCard = 'state' in card ? this.toFSCard(card as FSRSInput) : (card as Card);
    const currentTime = now ?? new Date();

    // Cast rating to the expected type
    const result = f.next(fsCard, currentTime, rating as 1 | 2 | 3 | 4);

    return {
      nextDue: result.card.due,
      interval: result.card.scheduled_days,
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      state: result.card.state,
      scheduledDays: result.card.scheduled_days,
      learningSteps: result.card.learning_steps,
    };
  }

  /**
   * Get all possible scheduling outcomes for a card
   * Useful for showing estimated intervals before user answers
   */
  getSchedulingOptions(
    card: Card | FSRSInput,
    now?: Date,
    config?: FSRSConfig
  ): Record<number, FSRSOutput> {
    const f = fsrs(this.getParams(config));
    const fsCard = 'state' in card ? this.toFSCard(card as FSRSInput) : (card as Card);
    const currentTime = now ?? new Date();

    const results = f.repeat(fsCard, currentTime);
    const options: Record<number, FSRSOutput> = {};

    for (const item of results) {
      const grade = item.log.rating as number;
      options[grade] = {
        nextDue: item.card.due,
        interval: item.card.scheduled_days,
        stability: item.card.stability,
        difficulty: item.card.difficulty,
        state: item.card.state,
        scheduledDays: item.card.scheduled_days,
        learningSteps: item.card.learning_steps,
      };
    }

    return options;
  }

  /**
   * Check if card is in learning state
   */
  isLearning(card: Card): boolean {
    return card.state === State.Learning;
  }

  /**
   * Check if card is in relearning state
   */
  isRelearning(card: Card): boolean {
    return card.state === State.Relearning;
  }

  /**
   * Check if card is new
   */
  isNew(card: Card): boolean {
    return card.state === State.New;
  }

  /**
   * Check if card is in review state
   */
  isReview(card: Card): boolean {
    return card.state === State.Review;
  }

  /**
   * Format date for logging/display
   */
  formatDueDate(date: Date): string {
    return formatDate(date);
  }

  /**
   * Reset/forget a card
   * @param card - Card to reset
   * @param now - Current time
   * @param keepStats - If true, keeps reps/lapses but resets learning state
   */
  forgetCard(card: Card, now?: Date, keepStats = false): Card {
    const f = fsrs(this.getParams());
    const currentTime = now ?? new Date();
    return f.forget(card, currentTime, keepStats).card;
  }

}
