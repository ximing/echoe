import { Service } from '@rabjs/react';

/**
 * Global service for the Card Editor Drawer.
 * Use this service to open the drawer from anywhere in the app.
 */
export class CardEditorService extends Service {
  /** Whether the drawer is open */
  isOpen = false;

  /** Note ID to edit (undefined = create mode) */
  editingNoteId: string | undefined = undefined;

  /** Pre-selected deck ID */
  prefillDeckId: string | undefined = undefined;

  /** Pre-selected notetype ID */
  prefillNotetypeId: string | undefined = undefined;

  /** Callback when card is saved */
  onSaved: (() => void) | undefined = undefined;

  /**
   * Open the drawer for creating a new card
   */
  openCreate(deckId?: string, notetypeId?: string) {
    this.isOpen = true;
    this.editingNoteId = undefined;
    this.prefillDeckId = deckId;
    this.prefillNotetypeId = notetypeId;
    this.onSaved = undefined;
  }

  /**
   * Open the drawer for editing an existing note
   */
  openEdit(noteId: string, deckId?: string, notetypeId?: string) {
    this.isOpen = true;
    this.editingNoteId = noteId;
    this.prefillDeckId = deckId;
    this.prefillNotetypeId = notetypeId;
    this.onSaved = undefined;
  }

  /**
   * Close the drawer
   */
  close() {
    this.isOpen = false;
    this.editingNoteId = undefined;
    this.prefillDeckId = undefined;
    this.prefillNotetypeId = undefined;
    this.onSaved = undefined;
  }

  /**
   * Set a callback to be called when a card is saved
   */
  setOnSaved(callback: () => void) {
    this.onSaved = callback;
  }
}
