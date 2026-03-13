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
}

export interface FSRSConfig {
  learningSteps?: readonly string[];
  relearningSteps?: readonly string[];
  maxInterval?: number;
  requestRetention?: number;
  enableFuzz?: boolean;
  enableShortTerm?: boolean;
}

const DEFAULT_CONFIG: FSRSConfig = {
  learningSteps: ['1m', '10m'] as const,
  relearningSteps: ['10m'] as const,
  maxInterval: 36500,
  requestRetention: 0.9,
  enableFuzz: true,
  enableShortTerm: false,
};

@Service()
export class FSRSService {
  private defaultParams: FSRSParameters;

  constructor() {
    this.defaultParams = this.buildParams(DEFAULT_CONFIG);
  }

  private buildParams(config: FSRSConfig): FSRSParameters {
    return generatorParameters({
      learning_steps: config.learningSteps as any,
      relearning_steps: config.relearningSteps as any,
      maximum_interval: config.maxInterval ?? DEFAULT_CONFIG.maxInterval,
      request_retention: config.requestRetention ?? DEFAULT_CONFIG.requestRetention,
      enable_fuzz: config.enableFuzz ?? DEFAULT_CONFIG.enableFuzz,
      enable_short_term: config.enableShortTerm ?? DEFAULT_CONFIG.enableShortTerm,
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
      };
    }

    return options;
  }

  /**
   * Handle delayed review - card reviewed after due date
   * Adjusts the card's elapsed days to account for the delay
   */
  handleDelayedReview(
    card: Card,
    rating: number,
    now?: Date,
    config?: FSRSConfig
  ): FSRSOutput {
    const currentTime = now ?? new Date();

    const dueDate = new Date(card.due);
    const delayDays = Math.floor(
      (currentTime.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (delayDays > 0) {
      card.elapsed_days += delayDays;
    }

    return this.scheduleCard(card, rating, currentTime, config);
  }

  /**
   * Handle relearning queue - card failed review and needs to relearn
   */
  handleRelearning(card: Card, rating: number, now?: Date, config?: FSRSConfig): FSRSOutput {
    if (card.state !== State.Relearning) {
      card.state = State.Relearning;
      card.learning_steps = 0;
    }

    return this.scheduleCard(card, rating, now, config);
  }

  /**
   * Handle learning queue - new card in learning steps
   */
  handleLearning(card: Card, rating: number, now?: Date, config?: FSRSConfig): FSRSOutput {
    if (card.state !== State.Learning) {
      card.state = State.Learning;
      card.learning_steps = 0;
    }

    return this.scheduleCard(card, rating, now, config);
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

  /**
   * Get interval text for display (e.g., "10m", "3d", "1w")
   */
  getIntervalText(days: number): string {
    if (days < 1) {
      const minutes = Math.round(days * 24 * 60);
      if (minutes < 60) {
        return `${minutes}m`;
      }
      const hours = Math.round(minutes / 60);
      return `${hours}h`;
    } else if (days < 30) {
      return `${Math.round(days)}d`;
    } else if (days < 365) {
      const weeks = Math.round(days / 7);
      return `${weeks}w`;
    } else {
      const years = Math.round(days / 365 * 10) / 10;
      return `${years}y`;
    }
  }
}
