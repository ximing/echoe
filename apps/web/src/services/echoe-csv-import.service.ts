import { Service } from '@rabjs/react';
import { previewCsv, executeCsvImport } from '../api/echoe';
import type { CsvPreviewDto, CsvExecuteDto, CsvImportResultDto } from '@echoe/dto';

/**
 * Echoe CSV Import Service
 * Manages CSV/TSV file import state and operations
 */
export class EchoeCsvImportService extends Service {
  // State
  preview: CsvPreviewDto | null = null;
  importResult: CsvImportResultDto | null = null;
  isLoading = false;
  isImporting = false;
  error: string | null = null;

  // Column mapping state
  columnMapping: Record<number, string> = {};
  selectedNotetypeId: string | null = null;
  selectedDeckId: string | null = null;
  hasHeader = true;

  /**
   * Preview a CSV/TSV file
   */
  async loadPreview(file: File): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.preview = null;

    try {
      const response = await previewCsv(file);
      this.preview = response.data;

      // Initialize column mapping: assume first column = Front, second = Back
      if (this.preview && this.preview.rows.length > 0) {
        this.initializeColumnMapping();
      }
    } catch (err) {
      this.error = 'Failed to preview file';
      console.error('CSV preview error:', err);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Initialize default column mapping
   */
  private initializeColumnMapping(): void {
    if (!this.preview) return;

    this.columnMapping = {};
    const numColumns = this.preview.totalColumns;

    // Default mapping: column 0 -> Front, column 1 -> Back
    if (numColumns >= 1) {
      this.columnMapping[0] = 'Front';
    }
    if (numColumns >= 2) {
      this.columnMapping[1] = 'Back';
    }

    // Remaining columns default to Ignore
    for (let i = 2; i < numColumns; i++) {
      this.columnMapping[i] = 'Ignore';
    }
  }

  /**
   * Set column mapping for a specific column
   */
  setColumnMapping(columnIndex: number, field: string): void {
    this.columnMapping[columnIndex] = field;
  }

  /**
   * Set the selected note type
   */
  setNotetypeId(id: string): void {
    this.selectedNotetypeId = id;
  }

  /**
   * Set the selected deck
   */
  setDeckId(id: string): void {
    this.selectedDeckId = id;
  }

  /**
   * Set whether file has header row
   */
  setHasHeader(hasHeader: boolean): void {
    this.hasHeader = hasHeader;
  }

  /**
   * Execute the CSV import
   */
  async executeImport(file: File): Promise<boolean> {
    if (!this.selectedNotetypeId || !this.selectedDeckId) {
      this.error = 'Please select a note type and deck';
      return false;
    }

    this.isImporting = true;
    this.error = null;
    this.importResult = null;

    try {
      const dto: CsvExecuteDto = {
        columnMapping: this.columnMapping,
        notetypeId: this.selectedNotetypeId,
        deckId: this.selectedDeckId,
        hasHeader: this.hasHeader,
      };

      const response = await executeCsvImport(file, dto);
      this.importResult = response.data;
      return true;
    } catch (err) {
      this.error = 'Failed to import file';
      console.error('CSV import error:', err);
      return false;
    } finally {
      this.isImporting = false;
    }
  }

  /**
   * Reset the import state
   */
  reset(): void {
    this.preview = null;
    this.importResult = null;
    this.error = null;
    this.columnMapping = {};
    this.selectedNotetypeId = null;
    this.selectedDeckId = null;
    this.hasHeader = true;
  }
}

// Export singleton instance
export const echoeCsvImportService = new EchoeCsvImportService();
