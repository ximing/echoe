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

  // Expanded state for sub-decks
  expandedDecks: Set<number> = new Set();

  /**
   * Load all decks with counts
   */
  async loadDecks(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await getDecks();
      this.decks = response.data;
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
  async updateDeckData(id: number, data: UpdateEchoeDeckDto): Promise<boolean> {
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
  async deleteDeckData(id: number, deleteCards: boolean = false): Promise<boolean> {
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
  toggleExpanded(deckId: number): void {
    if (this.expandedDecks.has(deckId)) {
      this.expandedDecks.delete(deckId);
    } else {
      this.expandedDecks.add(deckId);
    }
  }

  /**
   * Check if deck is expanded
   */
  isExpanded(deckId: number): boolean {
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
   * Get root decks (decks without parent)
   */
  getRootDecks(): EchoeDeckWithCountsDto[] {
    return this.decks.filter((deck) => !deck.name.includes('::'));
  }

  /**
   * Get children of a deck
   */
  getChildren(parentName: string): EchoeDeckWithCountsDto[] {
    const prefix = parentName + '::';
    return this.decks.filter((deck) => deck.name.startsWith(prefix) && !deck.name.slice(prefix.length).includes('::'));
  }
}
