import { Service } from '@rabjs/react';
import { getNoteTypes, getNote, createNote, updateNote, deleteNote, getCard, uploadMedia, getDecks } from '../api/echoe';
import type {
  EchoeNoteTypeDto,
  EchoeNoteDto,
  CreateEchoeNoteDto,
  UpdateEchoeNoteDto,
  EchoeDeckWithCountsDto,
} from '@echoe/dto';

/**
 * Echoe Note Service
 * Manages note types, notes, and related state
 */
export class EchoeNoteService extends Service {
  // State
  noteTypes: EchoeNoteTypeDto[] = [];
  notes: EchoeNoteDto[] = [];
  decks: EchoeDeckWithCountsDto[] = [];
  currentNote: EchoeNoteDto | null = null;
  currentCard: { cardId: number; noteId: number; did: number; note: EchoeNoteDto } | null = null;
  isLoading = false;
  error: string | null = null;

  /**
   * Load all note types
   */
  async loadNoteTypes(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await getNoteTypes();
      this.noteTypes = response.data;
    } catch (err) {
      this.error = 'Failed to load note types';
      console.error('Load note types error:', err);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load all decks (for deck selector)
   */
  async loadDecks(): Promise<void> {
    try {
      const response = await getDecks();
      this.decks = response.data;
    } catch (err) {
      console.error('Load decks error:', err);
    }
  }

  /**
   * Load a note by ID for editing
   */
  async loadNote(noteId: number): Promise<boolean> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await getNote(noteId);
      this.currentNote = response.data;
      return true;
    } catch (err) {
      this.error = 'Failed to load note';
      console.error('Load note error:', err);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load a card by ID for editing
   */
  async loadCard(cardId: number): Promise<boolean> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await getCard(cardId);
      this.currentCard = {
        cardId: response.data.id,
        noteId: response.data.nid,
        did: response.data.did,
        note: response.data.note,
      };
      this.currentNote = response.data.note;
      return true;
    } catch (err) {
      this.error = 'Failed to load card';
      console.error('Load card error:', err);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Create a new note
   */
  async createNewNote(data: CreateEchoeNoteDto): Promise<EchoeNoteDto | null> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await createNote(data);
      return response.data;
    } catch (err) {
      this.error = 'Failed to create note';
      console.error('Create note error:', err);
      return null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Update a note
   */
  async updateExistingNote(noteId: number, data: UpdateEchoeNoteDto): Promise<boolean> {
    this.isLoading = true;
    this.error = null;

    try {
      await updateNote(noteId, data);
      await this.loadNote(noteId);
      return true;
    } catch (err) {
      this.error = 'Failed to update note';
      console.error('Update note error:', err);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Delete a note
   */
  async deleteExistingNote(noteId: number): Promise<boolean> {
    try {
      await deleteNote(noteId);
      return true;
    } catch (err) {
      this.error = 'Failed to delete note';
      console.error('Delete note error:', err);
      return false;
    }
  }

  /**
   * Upload media file
   */
  async uploadMediaFile(file: File): Promise<{ filename: string; url: string } | null> {
    try {
      const response = await uploadMedia(file);
      return response.data;
    } catch (err) {
      console.error('Upload media error:', err);
      return null;
    }
  }

  /**
   * Get note type by ID
   */
  getNoteTypeById(id: number): EchoeNoteTypeDto | undefined {
    return this.noteTypes.find((nt) => nt.id === id);
  }

  /**
   * Get deck by ID
   */
  getDeckById(id: number): EchoeDeckWithCountsDto | undefined {
    return this.decks.find((d) => d.id === id);
  }

  /**
   * Clear current note state
   */
  clearCurrentNote(): void {
    this.currentNote = null;
    this.currentCard = null;
  }

  /**
   * Get all unique tags from notes
   */
  getAllTags(): string[] {
    const tagSet = new Set<string>();
    this.notes.forEach((note) => {
      note.tags?.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
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
  getDeckChildren(parentName: string): EchoeDeckWithCountsDto[] {
    const prefix = parentName + '::';
    return this.decks.filter(
      (deck) => deck.name.startsWith(prefix) && !deck.name.slice(prefix.length).includes('::')
    );
  }
}
