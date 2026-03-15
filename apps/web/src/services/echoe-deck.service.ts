import { Service } from '@rabjs/react';
import { getDecks, createDeck, updateDeck, deleteDeck } from '../api/echoe';
import type {
  EchoeDeckWithCountsDto,
  CreateEchoeDeckDto,
  UpdateEchoeDeckDto,
} from '@echoe/dto';

/**
 * Echoe Deck Service
 * Manages deck list state and operations
 */
export class EchoeDeckService extends Service {
  // State
  decks: EchoeDeckWithCountsDto[] = [];
  isLoading = false;
  error: string | null = null;

  // Expanded state for sub-decks (persisted in localStorage)
  private readonly expandedDecksStorageKey = 'echoe_cards_expanded_decks_v1';
  expandedDecks: Set<string> = this.loadExpandedDecksFromStorage();

  /**
   * Load all decks with counts
   */
  async loadDecks(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await getDecks();
      this.decks = response.data;
      this.syncExpandedDecksWithLoadedTree();
    } catch (err) {
      this.error = 'Failed to load decks';
      console.error('Load decks error:', err);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Create a new deck
   */
  async createNewDeck(data: CreateEchoeDeckDto): Promise<boolean> {
    try {
      await createDeck(data);
      await this.loadDecks();
      return true;
    } catch (err) {
      this.error = 'Failed to create deck';
      console.error('Create deck error:', err);
      return false;
    }
  }

  /**
   * Update a deck
   */
  async updateDeckData(id: string, data: UpdateEchoeDeckDto): Promise<boolean> {
    try {
      await updateDeck(id, data);
      await this.loadDecks();
      return true;
    } catch (err) {
      this.error = 'Failed to update deck';
      console.error('Update deck error:', err);
      return false;
    }
  }

  /**
   * Delete a deck
   */
  async deleteDeckData(id: string, deleteCards: boolean = false): Promise<boolean> {
    try {
      await deleteDeck(id, deleteCards);
      await this.loadDecks();
      return true;
    } catch (err) {
      this.error = 'Failed to delete deck';
      console.error('Delete deck error:', err);
      return false;
    }
  }

  /**
   * Toggle deck expansion
   */
  toggleExpanded(deckId: string): void {
    const nextExpandedDecks = new Set(this.expandedDecks);

    if (nextExpandedDecks.has(deckId)) {
      nextExpandedDecks.delete(deckId);
    } else {
      nextExpandedDecks.add(deckId);
    }

    this.expandedDecks = nextExpandedDecks;
    this.persistExpandedDecks();
  }

  /**
   * Check if deck is expanded
   */
  isExpanded(deckId: string): boolean {
    return this.expandedDecks.has(deckId);
  }

  /**
   * Get total cards due today across all decks
   */
  getTotalDue(): number {
    return this.decks.reduce((total, deck) => {
      return total + deck.newCount + deck.learnCount + deck.reviewCount;
    }, 0);
  }

  /**
   * Get root decks from server-provided hierarchy
   */
  getRootDecks(): EchoeDeckWithCountsDto[] {
    return this.decks;
  }

  /**
   * Read expanded deck IDs from localStorage.
   */
  private loadExpandedDecksFromStorage(): Set<string> {
    if (typeof window === 'undefined') {
      return new Set();
    }

    try {
      const rawValue = window.localStorage.getItem(this.expandedDecksStorageKey);
      if (!rawValue) {
        return new Set();
      }

      const parsed = JSON.parse(rawValue) as unknown;
      if (!Array.isArray(parsed)) {
        return new Set();
      }

      return new Set(
        parsed
          .map((id) => String(id))
          .filter((id) => id && id.trim() !== '')
      );
    } catch {
      return new Set();
    }
  }

  /**
   * Persist expanded deck IDs to localStorage.
   */
  private persistExpandedDecks(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(this.expandedDecksStorageKey, JSON.stringify(Array.from(this.expandedDecks)));
    } catch {
      // Ignore storage write failures (e.g. private mode / quota exceeded)
    }
  }

  /**
   * Keep only expanded IDs that still exist in the latest deck tree.
   */
  private syncExpandedDecksWithLoadedTree(): void {
    if (this.expandedDecks.size === 0) {
      return;
    }

    const validDeckIds = this.collectDeckIds(this.decks);
    const nextExpandedDecks = new Set<string>();

    for (const deckId of this.expandedDecks) {
      if (validDeckIds.has(deckId)) {
        nextExpandedDecks.add(deckId);
      }
    }

    if (nextExpandedDecks.size !== this.expandedDecks.size) {
      this.expandedDecks = nextExpandedDecks;
      this.persistExpandedDecks();
    }
  }

  /**
   * Collect all deck IDs from hierarchy.
   */
  private collectDeckIds(decks: EchoeDeckWithCountsDto[]): Set<string> {
    const deckIds = new Set<string>();

    const visit = (items: EchoeDeckWithCountsDto[]) => {
      for (const item of items) {
        deckIds.add(item.deckId);
        if (item.children.length > 0) {
          visit(item.children);
        }
      }
    };

    visit(decks);
    return deckIds;
  }
}
