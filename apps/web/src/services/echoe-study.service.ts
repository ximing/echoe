import { Service, resolve } from '@rabjs/react';
import { ToastService } from './toast.service';
import {
  getStudyQueue,
  submitReview as apiSubmitReview,
  undoReview as apiUndoReview,
  buryCards as apiBuryCards,
  forgetCards as apiForgetCards,
  getEchoeConfig,
} from '../api/echoe';
import type {
  StudyQueueItemDto,
  EchoeGlobalSettingsDto,
} from '@echoe/dto';

export interface SessionStats {
  studied: number;
  timeSpent: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export interface UndoEntry {
  cardId: number;
  previousState: StudyQueueItemDto;
  reviewId?: number;
}

/**
 * Echoe Study Service
 * Manages study session state and operations
 */
export class EchoeStudyService extends Service {
  // Queue state
  queue: StudyQueueItemDto[] = [];
  currentIndex = 0;
  isLoading = false;
  error: string | null = null;

  // UI state
  isShowingAnswer = false;
  sessionStartTime = 0;
  cardStartTime = 0;

  // Typed answers for type-in-answer cards
  typedAnswers: Record<string, string> = {};

  // Session stats
  stats: SessionStats = {
    studied: 0,
    timeSpent: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  };

  // Undo stack (max 10 entries)
  undoStack: UndoEntry[] = [];

  // Leech detection
  lastReviewWasLeech = false;

  // Current deck ID (if studying specific deck)
  deckId?: number;

  // Audio settings
  autoplay: string = 'never';
  ttsSpeed: number = 1;

  /**
   * Load study queue
   */
  async loadQueue(deckId?: number): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.deckId = deckId;

    try {
      // Load global settings for audio
      try {
        const configResponse = await getEchoeConfig();
        const settings: EchoeGlobalSettingsDto = configResponse.data;
        this.autoplay = settings.autoplay;
        this.ttsSpeed = settings.ttsSpeed;
      } catch {
        // Use defaults if config fetch fails
        this.autoplay = 'never';
        this.ttsSpeed = 1;
      }

      const response = await getStudyQueue(deckId);
      // Check if response is valid
      if (!response.data) {
        const errorMsg = (response as any).msg || 'Failed to load study queue';
        this.error = errorMsg;
        resolve(ToastService).show(errorMsg, { type: 'error' });
        this.queue = [];
        this.isLoading = false;
        return;
      }
      this.queue = response.data;
      this.currentIndex = 0;
      this.isShowingAnswer = false;
      this.stats = {
        studied: 0,
        timeSpent: 0,
        again: 0,
        hard: 0,
        good: 0,
        easy: 0,
      };
      this.undoStack = [];
      this.sessionStartTime = Date.now();
      this.cardStartTime = Date.now();
    } catch (err) {
      this.error = 'Failed to load study queue';
      this.queue = [];
      resolve(ToastService).show('Failed to load study queue', { type: 'error' });
      console.error('Load queue error:', err);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get current card
   */
  getCurrentCard(): StudyQueueItemDto | null {
    return this.queue[this.currentIndex] || null;
  }

  /**
   * Set typed answer for a field
   */
  setTypedAnswer(fieldName: string, value: string): void {
    this.typedAnswers[fieldName] = value;
  }

  /**
   * Get typed answers for current card
   */
  getTypedAnswers(): Record<string, string> {
    return this.typedAnswers;
  }

  /**
   * Clear typed answers (when moving to next card)
   */
  clearTypedAnswers(): void {
    this.typedAnswers = {};
  }

  /**
   * Get progress info
   */
  getProgress(): { current: number; total: number } {
    return {
      current: this.stats.studied + 1,
      total: this.queue.length,
    };
  }

  /**
   * Get remaining cards count
   */
  getRemainingCount(): number {
    return this.queue.length - this.currentIndex;
  }

  /**
   * Show answer
   */
  showAnswer(): void {
    this.isShowingAnswer = true;
    // Add time spent on this card to session time
    this.stats.timeSpent += Date.now() - this.cardStartTime;
    // Clear typed answers when showing answer
    this.typedAnswers = {};
  }

  /**
   * Submit review rating
   */
  async submitReview(rating: 1 | 2 | 3 | 4): Promise<boolean> {
    const card = this.getCurrentCard();
    if (!card) return false;

    const timeTaken = Date.now() - this.cardStartTime;

    // Save current state for undo
    this.undoStack.push({
      cardId: card.cardId,
      previousState: { ...card },
    });
    // Keep only last 10 entries
    if (this.undoStack.length > 10) {
      this.undoStack.shift();
    }

    try {
      const res = await apiSubmitReview({
        cardId: card.cardId,
        rating,
        timeTaken,
      });

      // Check for leech detection
      if (res?.data?.isLeech) {
        // We need to get the toast service here somehow
        // The service is already registered, so we can import it
        // But to avoid circular dependencies, let's handle it in the UI
        this.lastReviewWasLeech = true;
      }

      // Update stats
      this.stats.studied++;
      switch (rating) {
        case 1:
          this.stats.again++;
          break;
        case 2:
          this.stats.hard++;
          break;
        case 3:
          this.stats.good++;
          break;
        case 4:
          this.stats.easy++;
          break;
      }

      // Move to next card
      this.currentIndex++;
      this.isShowingAnswer = false;
      this.clearTypedAnswers();
      this.cardStartTime = Date.now();

      // Check if session complete
      if (this.currentIndex >= this.queue.length) {
        // Add remaining card time
        this.stats.timeSpent += timeTaken;
      }

      return true;
    } catch (err) {
      this.error = 'Failed to submit review';
      console.error('Submit review error:', err);
      return false;
    }
  }

  /**
   * Undo last review
   */
  async undo(): Promise<boolean> {
    if (this.undoStack.length === 0) return false;

    const entry = this.undoStack.pop();
    if (!entry) return false;

    try {
      await apiUndoReview();

      // Move back to previous card
      this.currentIndex = Math.max(0, this.currentIndex - 1);
      this.isShowingAnswer = false;
      this.cardStartTime = Date.now();

      // Decrease stats for the undone card
      this.stats.studied = Math.max(0, this.stats.studied - 1);

      return true;
    } catch (err) {
      this.error = 'Failed to undo';
      console.error('Undo error:', err);
      return false;
    }
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Bury current card
   */
  async buryCard(mode: 'card' | 'note' = 'card'): Promise<boolean> {
    const card = this.getCurrentCard();
    if (!card) return false;

    try {
      await apiBuryCards([card.cardId], mode);

      // Move to next card
      this.currentIndex++;
      this.isShowingAnswer = false;
      this.clearTypedAnswers();
      this.cardStartTime = Date.now();

      return true;
    } catch (err) {
      this.error = 'Failed to bury card';
      console.error('Bury card error:', err);
      return false;
    }
  }

  /**
   * Forget current card (reset to new)
   */
  async forgetCard(): Promise<boolean> {
    const card = this.getCurrentCard();
    if (!card) return false;

    try {
      await apiForgetCards([card.cardId]);

      // Move to next card
      this.currentIndex++;
      this.isShowingAnswer = false;
      this.clearTypedAnswers();
      this.cardStartTime = Date.now();

      return true;
    } catch (err) {
      this.error = 'Failed to forget card';
      console.error('Forget card error:', err);
      return false;
    }
  }

  /**
   * Get elapsed time formatted
   */
  getElapsedTime(): string {
    const elapsed = this.sessionStartTime > 0
      ? Date.now() - this.sessionStartTime
      : 0;
    return this.formatTime(elapsed);
  }

  /**
   * Format milliseconds to MM:SS
   */
  private formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Check if session is complete
   */
  isSessionComplete(): boolean {
    return this.currentIndex >= this.queue.length && this.queue.length > 0;
  }

  /**
   * Get session summary
   */
  getSessionSummary(): SessionStats & { totalTime: string } {
    return {
      ...this.stats,
      totalTime: this.formatTime(this.stats.timeSpent),
    };
  }

  /**
   * Calculate next interval text for a rating
   */
  getNextIntervalText(rating: 1 | 2 | 3 | 4): string {
    const card = this.getCurrentCard();
    if (!card) return '';

    // Simple estimation based on current interval and rating
    // In a real implementation, this would come from the FSRS algorithm
    const baseInterval = card.interval || 1;
    const factor = card.factor / 1000; // Convert from permille to decimal

    let multiplier: number;
    switch (rating) {
      case 1: // Again
        return '<1m';
      case 2: // Hard
        multiplier = 1.2;
        break;
      case 3: // Good
        multiplier = factor * 1.0;
        break;
      case 4: // Easy
        multiplier = factor * 1.3;
        break;
      default:
        multiplier = 1;
    }

    const nextInterval = Math.max(1, Math.round(baseInterval * multiplier));

    if (nextInterval < 1) {
      return '<1d';
    } else if (nextInterval < 30) {
      return `${nextInterval}d`;
    } else if (nextInterval < 365) {
      const months = Math.round(nextInterval / 30);
      return `${months}mo`;
    } else {
      const years = Math.round(nextInterval / 365);
      return `${years}y`;
    }
  }

  /**
   * Play audio for the current card
   * This is called by the UI to replay audio on demand
   */
  playAudio(): void {
    // This will be handled by the UI component which has access to the DOM
    // We emit a custom event that the CardContent component can listen to
    const event = new CustomEvent('cards:playAudio');
    window.dispatchEvent(event);
  }
}
