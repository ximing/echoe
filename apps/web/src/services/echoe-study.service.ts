import { Service, resolve } from '@rabjs/react';
import { ToastService } from './toast.service';
import {
  getStudyQueue,
  submitReview as apiSubmitReview,
  undoReview as apiUndoReview,
  buryCards as apiBuryCards,
  forgetCards as apiForgetCards,
  getEchoeConfig,
  getStudyOptions,
} from '../api/echoe';
import type {
  StudyQueueItemDto,
  EchoeGlobalSettingsDto,
  RatingOptionDto,
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
  cardId: string;
  previousState: StudyQueueItemDto;
  reviewId?: string;
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

  // Study options (rating previews from FSRS)
  currentCardOptions: RatingOptionDto[] = [];
  currentRetrievability: number | null = null;
  isLoadingStudyOptions = false;
  studyOptionsError: string | null = null;

  // Leech detection
  lastReviewWasLeech = false;

  // Current deck ID (if studying specific deck)
  deckId?: string;

  // Audio settings
  autoplay: string = 'never';
  ttsSpeed: number = 1;

  // Typing practice state
  typingPractice = {
    words: [] as string[],
    currentInput: '',
    validationResults: [] as Array<{
      char: string;
      isCorrect: boolean;
      shouldShake: boolean;
    }>,
    isCompleted: false,
  };

  /**
   * Load study queue
   */
  async loadQueue(deckId?: string): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.deckId = deckId;
    this.resetStudyOptionsState();

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
        const errorMsg = (response as { msg?: string }).msg || 'Failed to load study queue';
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
      this.resetTypingPractice();
    } catch {
      this.error = 'Failed to load study queue';
      this.queue = [];
      resolve(ToastService).show('Failed to load study queue', { type: 'error' });
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
    this.currentCardOptions = [];
    this.studyOptionsError = null;
    // Fetch study options (rating previews) from server
    this.fetchStudyOptions();
  }

  /**
   * Fetch study options for current card
   */
  async fetchStudyOptions(): Promise<void> {
    const card = this.getCurrentCard();
    if (!card) {
      this.resetStudyOptionsState();
      return;
    }

    const requestCardId = card.cardId;
    this.currentCardOptions = [];
    this.studyOptionsError = null;
    this.isLoadingStudyOptions = true;

    try {
      const response = await getStudyOptions(requestCardId);
      const latestCardId = this.getCurrentCard()?.cardId;
      if (latestCardId !== requestCardId) {
        return;
      }

      this.currentCardOptions = response.data?.options ?? [];
      this.currentRetrievability = response.data?.retrievability ?? null;
    } catch (error: unknown) {
      const latestCardId = this.getCurrentCard()?.cardId;
      if (latestCardId !== requestCardId) {
        return;
      }

      this.currentCardOptions = [];
      this.currentRetrievability = null;
      const optionsError = error as { msg?: string; message?: string };
      this.studyOptionsError = optionsError.msg || optionsError.message || 'Failed to load study options';
    } finally {
      const latestCardId = this.getCurrentCard()?.cardId;
      if (latestCardId === requestCardId) {
        this.isLoadingStudyOptions = false;
      }
    }
  }

  /**
   * Get study options for current card
   */
  getStudyOptions(): RatingOptionDto[] {
    return this.currentCardOptions;
  }

  private resetStudyOptionsState(): void {
    this.currentCardOptions = [];
    this.currentRetrievability = null;
    this.isLoadingStudyOptions = false;
    this.studyOptionsError = null;
  }

  /**
   * Submit review rating
   */
  async submitReview(rating: 1 | 2 | 3 | 4): Promise<boolean> {
    const card = this.getCurrentCard();
    if (!card) return false;

    const timeTaken = Date.now() - this.cardStartTime;

    try {
      const res = await apiSubmitReview({
        cardId: card.cardId,
        rating,
        timeTaken,
      });

      // Save current state for undo with exact reviewId to avoid cross-tab mismatch.
      this.undoStack.push({
        cardId: card.cardId,
        previousState: { ...card },
        reviewId: res?.data?.reviewId,
      });
      // Keep only last 10 entries
      if (this.undoStack.length > 10) {
        this.undoStack.shift();
      }

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
      this.resetStudyOptionsState();
      this.resetTypingPractice();
      this.cardStartTime = Date.now();

      // Check if session complete
      if (this.currentIndex >= this.queue.length) {
        // Add remaining card time
        this.stats.timeSpent += timeTaken;
      }

      return true;
    } catch {
      this.error = 'Failed to submit review';
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

    if (entry.reviewId == null) {
      this.error = 'Cannot undo this review reliably. Please refresh and retry.';
      return false;
    }

    try {
      await apiUndoReview(entry.reviewId);

      // Move back to previous card
      this.currentIndex = Math.max(0, this.currentIndex - 1);
      this.isShowingAnswer = false;
      this.resetStudyOptionsState();
      this.resetTypingPractice();
      this.cardStartTime = Date.now();

      // Decrease stats for the undone card
      this.stats.studied = Math.max(0, this.stats.studied - 1);

      return true;
    } catch {
      // Restore stack entry so user can retry if network/server transiently fails.
      this.undoStack.push(entry);
      this.error = 'Failed to undo';
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
      this.resetStudyOptionsState();
      this.resetTypingPractice();
      this.cardStartTime = Date.now();

      return true;
    } catch {
      this.error = 'Failed to bury card';
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
      this.resetStudyOptionsState();
      this.resetTypingPractice();
      this.cardStartTime = Date.now();

      return true;
    } catch {
      this.error = 'Failed to forget card';
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
    if (this.isLoadingStudyOptions) {
      return '...';
    }

    const option = this.currentCardOptions.find((opt) => opt.rating === rating);
    if (!option) {
      return '--';
    }

    return this.formatIntervalText(option.interval);
  }

  private formatIntervalText(interval: number): string {
    if (interval <= 0) {
      return '<1m';
    }

    if (interval < 1 / 24) {
      // 小于 1 小时，显示分钟
      const minutes = Math.round(interval * 24 * 60);
      return minutes > 0 ? `${minutes}m` : '<1m';
    }

    if (interval < 1) {
      // 小于 1 天，显示小时
      const hours = Math.round(interval * 24);
      return `${hours}h`;
    }

    if (interval < 30) {
      return `${Math.round(interval)}d`;
    }

    if (interval < 365) {
      return `${Math.round(interval / 30)}mo`;
    }

    return `${Math.round(interval / 365)}y`;
  }

  /**
   * Extract typing text from card Front field
   * Returns the main word/phrase for typing practice
   */
  extractTypingText(card: StudyQueueItemDto): string {
    if (!card.front) return '';

    // Create a temporary div to parse HTML
    const div = document.createElement('div');
    div.innerHTML = card.front;

    // Strategy 1: Try to find h1, h2, or h3 tag (most cards have the main word in heading)
    const heading = div.querySelector('h1, h2, h3');
    if (heading) {
      const text = heading.textContent || '';
      return text.trim();
    }

    // Strategy 2: If no heading, try to extract first significant text
    // Remove hidden elements
    div.querySelectorAll('[style*="display:none"], [style*="display: none"]').forEach((el) => el.remove());
    div.querySelectorAll('[style*="visibility:hidden"], [style*="visibility: hidden"]').forEach((el) => el.remove());

    // Remove audio buttons and their content
    div.querySelectorAll('button.audio-play-button').forEach((el) => el.remove());
    div.querySelectorAll('audio.cards-audio').forEach((el) => el.remove());

    // Remove type-answer input fields
    div.querySelectorAll('input.type-answer').forEach((el) => el.remove());

    // Remove TTS buttons
    div.querySelectorAll('button.tts-button').forEach((el) => el.remove());

    // Get the remaining text content
    let text = div.textContent || div.innerText || '';

    // Remove [sound:xxx] tags (plain text, not HTML)
    text = text.replace(/\[sound:[^\]]+\]/g, '');

    // Remove content in brackets (音标等)
    text = text.replace(/\[[^\]]*\]/g, '');

    // Remove content in parentheses (附加信息)
    text = text.replace(/\([^)]*\)/g, '');

    // Restore cloze deletions (if any)
    text = text.replace(/\{\{c\d+::([^:}]+)(?:::[^}]+)?\}\}/g, '$1');

    // Clean up extra spaces and trim
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Handle typing input and validate in real-time
   */
  onTypingInput(input: string): void {
    const targetText = this.typingPractice.words.join(' ');
    const results: Array<{ char: string; isCorrect: boolean; shouldShake: boolean }> = [];

    // Compare character by character
    for (let i = 0; i < input.length; i++) {
      const inputChar = input[i];
      const targetChar = targetText[i] || '';

      if (inputChar === targetChar) {
        results.push({
          char: inputChar,
          isCorrect: true,
          shouldShake: false,
        });
      } else {
        results.push({
          char: inputChar,
          isCorrect: false,
          shouldShake: true,
        });
      }
    }

    this.typingPractice.currentInput = input;
    this.typingPractice.validationResults = results;

    // Check if completed
    if (input === targetText && input.length > 0) {
      this.typingPractice.isCompleted = true;
    } else {
      this.typingPractice.isCompleted = false;
    }

    // Reset shake flag after 200ms
    setTimeout(() => {
      this.typingPractice.validationResults = this.typingPractice.validationResults.map(
        (r) => ({
          ...r,
          shouldShake: false,
        })
      );
    }, 200);
  }

  /**
   * Reset typing practice state (called when card changes)
   */
  resetTypingPractice(): void {
    const currentCard = this.getCurrentCard();
    if (currentCard) {
      const text = this.extractTypingText(currentCard);
      this.typingPractice = {
        words: text ? text.split(' ') : [],
        currentInput: '',
        validationResults: [],
        isCompleted: false,
      };
    } else {
      this.typingPractice = {
        words: [],
        currentInput: '',
        validationResults: [],
        isCompleted: false,
      };
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
