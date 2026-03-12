import type {
  EchoeDeckWithCountsDto,
  CreateEchoeDeckDto,
  UpdateEchoeDeckDto,
  EchoeDeckConfigDto,
  UpdateEchoeDeckConfigDto,
  StudyQueueItemDto,
  ReviewSubmissionDto,
  ReviewResultDto,
  StudyCountsDto,
  EchoeNoteTypeDto,
  EchoeNoteDto,
  CreateEchoeNoteDto,
  UpdateEchoeNoteDto,
  EchoeNoteQueryParams,
  EchoeCardWithNoteDto,
  EchoeCardListItemDto,
  EchoeCardQueryParams,
  BulkCardOperationDto,
  StudyTodayStatsDto,
  StudyHistoryDayDto,
  CardMaturityDto,
  ForecastDayDto,
  EchoeGlobalSettingsDto,
  EchoeDeckConfigPresetDto,
  CreateFilteredDeckDto,
  FilteredDeckPreviewDto,
  EchoeMediaDto,
  CsvPreviewDto,
  CsvExecuteDto,
  CsvImportResultDto,
  FindDuplicatesDto,
  DuplicateGroupDto,
  MergeDuplicatesDto,
  ImportResultDto,
} from '@echoe/dto';
import request from '../utils/request';

/**
 * Get all decks with today's counts
 */
export const getDecks = () => {
  return request.get<unknown, { code: number; data: EchoeDeckWithCountsDto[] }>(
    '/api/v1/decks'
  );
};

/**
 * Get a single deck by ID
 */
export const getDeck = (id: number) => {
  return request.get<unknown, { code: number; data: EchoeDeckWithCountsDto }>(
    `/api/v1/decks/${id}`
  );
};

/**
 * Create a new deck
 */
export const createDeck = (data: CreateEchoeDeckDto) => {
  return request.post<unknown, { code: number; data: EchoeDeckWithCountsDto }>(
    '/api/v1/decks',
    data
  );
};

/**
 * Update a deck (rename and/or update description)
 */
export const updateDeck = (id: number, data: UpdateEchoeDeckDto) => {
  return request.put<unknown, { code: number; data: EchoeDeckWithCountsDto }>(
    `/api/v1/decks/${id}`,
    data
  );
};

/**
 * Delete a deck
 */
export const deleteDeck = (id: number, deleteCards: boolean = false) => {
  return request.delete<unknown, { code: number; data: { success: boolean } }>(
    `/api/v1/decks/${id}`,
    {
      params: { deleteCards: deleteCards.toString() },
    }
  );
};

/**
 * Get deck configuration
 */
export const getDeckConfig = (id: number) => {
  return request.get<unknown, { code: number; data: EchoeDeckConfigDto }>(
    `/api/v1/decks/${id}/config`
  );
};

/**
 * Update deck configuration
 */
export const updateDeckConfig = (id: number, data: UpdateEchoeDeckConfigDto) => {
  return request.put<unknown, { code: number; data: EchoeDeckConfigDto }>(
    `/api/v1/decks/${id}/config`,
    data
  );
};

/**
 * Create a filtered deck (custom study deck)
 */
export const createFilteredDeck = (data: CreateFilteredDeckDto) => {
  return request.post<unknown, { code: number; data: EchoeDeckWithCountsDto }>(
    '/api/v1/decks/filtered',
    data
  );
};

/**
 * Rebuild a filtered deck
 */
export const rebuildFilteredDeck = (id: number) => {
  return request.post<unknown, { code: number; data: { success: boolean } }>(
    `/api/v1/decks/${id}/rebuild`
  );
};

/**
 * Empty a filtered deck (return cards to original decks)
 */
export const emptyFilteredDeck = (id: number) => {
  return request.post<unknown, { code: number; data: { success: boolean } }>(
    `/api/v1/decks/${id}/empty`
  );
};

/**
 * Preview filtered deck results without creating
 */
export const previewFilteredDeck = (searchQuery: string, limit: number = 5) => {
  return request.get<unknown, { code: number; data: FilteredDeckPreviewDto }>(
    '/api/v1/decks/preview',
    {
      params: { q: searchQuery, limit },
    }
  );
};

// ===== Study Session =====

/**
 * Get study queue - cards due for review
 */
export const getStudyQueue = (deckId?: number, limit?: number) => {
  return request.get<unknown, { code: number; data: StudyQueueItemDto[] }>(
    '/api/v1/study/queue',
    {
      params: {
        ...(deckId !== undefined && { deckId: deckId.toString() }),
        ...(limit !== undefined && { limit: limit.toString() }),
      },
    }
  );
};

/**
 * Submit a card review
 */
export const submitReview = (data: ReviewSubmissionDto) => {
  return request.post<unknown, { code: number; data: ReviewResultDto }>(
    '/api/v1/study/review',
    data
  );
};

/**
 * Undo last review
 */
export const undoReview = () => {
  return request.post<unknown, { code: number; data: { success: boolean; card?: StudyQueueItemDto } }>(
    '/api/v1/study/undo'
  );
};

/**
 * Bury cards (move to buried queue)
 */
export const buryCards = (cardIds: number[], mode: 'card' | 'note' = 'card') => {
  return request.post<unknown, { code: number; data: { success: boolean } }>(
    '/api/v1/study/bury',
    { cardIds, mode }
  );
};

/**
 * Reset cards to new (forget scheduling)
 */
export const forgetCards = (cardIds: number[]) => {
  return request.post<unknown, { code: number; data: { success: boolean } }>(
    '/api/v1/study/forget',
    { cardIds }
  );
};

/**
 * Get study counts for today
 */
export const getStudyCounts = (deckId?: number) => {
  return request.get<unknown, { code: number; data: StudyCountsDto }>(
    '/api/v1/study/counts',
    {
      params: {
        ...(deckId !== undefined && { deckId: deckId.toString() }),
      },
    }
  );
};

// ===== Note Types =====

/**
 * Get all note types with fields and templates
 */
export const getNoteTypes = () => {
  return request.get<unknown, { code: number; data: EchoeNoteTypeDto[] }>(
    '/api/v1/notetypes'
  );
};

/**
 * Get a single note type by ID
 */
export const getNoteType = (id: number) => {
  return request.get<unknown, { code: number; data: EchoeNoteTypeDto }>(
    `/api/v1/notetypes/${id}`
  );
};

/**
 * Create a new note type
 */
export const createNoteType = (data: Partial<EchoeNoteTypeDto> & { name: string }) => {
  return request.post<unknown, { code: number; data: EchoeNoteTypeDto }>(
    '/api/v1/notetypes',
    data
  );
};

/**
 * Update a note type
 */
export const updateNoteType = (id: number, data: Partial<EchoeNoteTypeDto>) => {
  return request.put<unknown, { code: number; data: EchoeNoteTypeDto }>(
    `/api/v1/notetypes/${id}`,
    data
  );
};

/**
 * Delete a note type
 */
export const deleteNoteType = (id: number) => {
  return request.delete<unknown, { code: number; data: { success: boolean } }>(
    `/api/v1/notetypes/${id}`
  );
};

// ===== Notes =====

/**
 * Get notes with filters
 */
export const getNotes = (params?: EchoeNoteQueryParams) => {
  return request.get<unknown, { code: number; data: EchoeNoteDto[] }>(
    '/api/v1/notes',
    { params }
  );
};

/**
 * Get a single note by ID
 */
export const getNote = (id: number) => {
  return request.get<unknown, { code: number; data: EchoeNoteDto }>(
    `/api/v1/notes/${id}`
  );
};

/**
 * Create a new note
 */
export const createNote = (data: CreateEchoeNoteDto) => {
  return request.post<unknown, { code: number; data: EchoeNoteDto }>(
    '/api/v1/notes',
    data
  );
};

/**
 * Update a note
 */
export const updateNote = (id: number, data: UpdateEchoeNoteDto) => {
  return request.put<unknown, { code: number; data: EchoeNoteDto }>(
    `/api/v1/notes/${id}`,
    data
  );
};

/**
 * Delete a note
 */
export const deleteNote = (id: number) => {
  return request.delete<unknown, { code: number; data: { success: boolean } }>(
    `/api/v1/notes/${id}`
  );
};

// ===== Cards =====

/**
 * Get a single card by ID with full note data
 */
export const getCard = (id: number) => {
  return request.get<unknown, { code: number; data: EchoeCardWithNoteDto }>(
    `/api/v1/cards/${id}`
  );
};

/**
 * Bulk card operations
 */
export const bulkCardOperation = (data: BulkCardOperationDto) => {
  return request.post<unknown, { code: number; data: { success: boolean } }>(
    '/api/v1/cards/bulk',
    data
  );
};

/**
 * Get cards with filters for card browser
 */
export const getCards = (params?: EchoeCardQueryParams) => {
  return request.get<unknown, { code: number; data: { cards: EchoeCardListItemDto[]; total: number } }>(
    '/api/v1/cards',
    { params }
  );
};

// ===== Media =====

/**
 * Upload a media file
 */
export const uploadMedia = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  return request.post<unknown, { code: number; data: { filename: string; url: string } }>(
    '/api/v1/media/upload',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
};

/**
 * Get all media files
 */
export const getMedia = () => {
  return request.get<unknown, { code: number; data: EchoeMediaDto[] }>(
    '/api/v1/media'
  );
};

/**
 * Check for unused media files
 */
export const checkUnusedMedia = () => {
  return request.post<unknown, { code: number; data: { unusedFiles: string[] } }>(
    '/api/v1/media/check-unused'
  );
};

/**
 * Delete media files in bulk
 */
export const deleteMediaBulk = (filenames: string[]) => {
  return request.delete<unknown, { code: number; data: { message: string } }>(
    '/api/v1/media/bulk',
    { data: { filenames } }
  );
};

// ===== Statistics =====

/**
 * Get today's study statistics
 */
export const getTodayStats = (deckId?: number) => {
  return request.get<unknown, { code: number; data: StudyTodayStatsDto }>(
    '/api/v1/stats/today',
    {
      params: {
        ...(deckId !== undefined && { deckId: deckId.toString() }),
      },
    }
  );
};

/**
 * Get study history for the last N days
 */
export const getHistory = (deckId?: number, days?: number) => {
  return request.get<unknown, { code: number; data: StudyHistoryDayDto[] }>(
    '/api/v1/stats/history',
    {
      params: {
        ...(deckId !== undefined && { deckId: deckId.toString() }),
        ...(days !== undefined && { days: days.toString() }),
      },
    }
  );
};

/**
 * Get card maturity distribution
 */
export const getMaturity = (deckId?: number) => {
  return request.get<unknown, { code: number; data: CardMaturityDto }>(
    '/api/v1/stats/maturity',
    {
      params: {
        ...(deckId !== undefined && { deckId: deckId.toString() }),
      },
    }
  );
};

/**
 * Get forecast of due cards for the next N days
 */
export const getForecast = (deckId?: number, days?: number) => {
  return request.get<unknown, { code: number; data: ForecastDayDto[] }>(
    '/api/v1/stats/forecast',
    {
      params: {
        ...(deckId !== undefined && { deckId: deckId.toString() }),
        ...(days !== undefined && { days: days.toString() }),
      },
    }
  );
};

export interface MaturityBatchDeck {
  deckId: number;
  new: number;
  learning: number;
  young: number;
  mature: number;
}

/**
 * Get user's consecutive learning day streak
 */
export const getStreak = (): Promise<{ code: number; data: { streak: number } }> => {
  return request.get<unknown, { code: number; data: { streak: number } }>(
    '/api/v1/stats/streak'
  );
};

/**
 * Get maturity distribution for all decks in one request
 */
export const getMaturityBatch = (): Promise<{ code: number; data: { decks: MaturityBatchDeck[] } }> => {
  return request.get<unknown, { code: number; data: { decks: MaturityBatchDeck[] } }>(
    '/api/v1/stats/maturity/batch'
  );
};

// ===== Global Settings =====

/**
 * Get global echoe settings
 */
export const getEchoeConfig = () => {
  return request.get<unknown, { code: number; data: EchoeGlobalSettingsDto }>(
    '/api/v1/config'
  );
};

/**
 * Update global echoe settings
 */
export const updateEchoeConfig = (data: Partial<EchoeGlobalSettingsDto>) => {
  return request.put<unknown, { code: number; data: EchoeGlobalSettingsDto }>(
    '/api/v1/config',
    data
  );
};

/**
 * Get deck config presets
 */
export const getDeckConfigPresets = () => {
  return request.get<unknown, { code: number; data: EchoeDeckConfigPresetDto[] }>(
    '/api/v1/config/presets'
  );
};

/**
 * Save deck config preset
 */
export const saveDeckConfigPreset = (data: { name: string; config: EchoeDeckConfigPresetDto['config'] }) => {
  return request.post<unknown, { code: number; data: EchoeDeckConfigPresetDto }>(
    '/api/v1/config/presets',
    data
  );
};

/**
 * Delete deck config preset
 */
export const deleteDeckConfigPreset = (id: string) => {
  return request.delete<unknown, { code: number; data: { deleted: boolean } }>(
    `/api/v1/config/presets/${id}`
  );
};

/**
 * Export all decks to .apkg
 */
export const exportAllDecks = (includeScheduling = false) => {
  const params = new URLSearchParams();
  params.set('includeScheduling', includeScheduling.toString());
  return request.get<Blob, { code: number }>(
    `/api/v1/export/apkg?${params.toString()}`,
    { responseType: 'blob' }
  );
};

// Tag API
export interface EchoeTagDto {
  name: string;
  count: number;
}

// Re-export EchoeMediaDto for convenience
export type { EchoeMediaDto } from '@echoe/dto';

export const getTags = () => {
  return request.get<EchoeTagDto[], { code: number; data: EchoeTagDto[] }>('/api/v1/tags');
};

export const searchTags = (query: string, limit = 10) => {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', limit.toString());
  return request.get<string[], { code: number; data: string[] }>(`/api/v1/tags/search?${params.toString()}`);
};

export const renameTag = (tag: string, newName: string) => {
  return request.put<{ updated: number }, { code: number; data: { updated: number } }>(`/api/v1/tags/${encodeURIComponent(tag)}/rename`, {
    newName,
  });
};

export const deleteTag = (tag: string) => {
  return request.delete<{ deleted: boolean; message: string }, { code: number; data: { deleted: boolean; message: string } }>(
    `/api/v1/tags/${encodeURIComponent(tag)}`
  );
};

export const mergeTags = (source: string, target: string) => {
  return request.post<{ updated: number }, { code: number; data: { updated: number } }>('/api/v1/tags/merge', {
    source,
    target,
  });
};

// ===== CSV/TSV Import =====

/**
 * Preview a CSV/TSV file - detect encoding, delimiter, return sample rows
 */
export const previewCsv = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  return request.post<unknown, { code: number; data: CsvPreviewDto }>(
    '/api/v1/csv-import/preview',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
};

/**
 * Execute CSV/TSV import with column mapping and target deck
 */
export const executeCsvImport = (file: File, dto: CsvExecuteDto) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('columnMapping', JSON.stringify(dto.columnMapping));
  formData.append('notetypeId', dto.notetypeId.toString());
  formData.append('deckId', dto.deckId.toString());
  formData.append('hasHeader', dto.hasHeader.toString());

  return request.post<unknown, { code: number; data: CsvImportResultDto }>(
    '/api/v1/csv-import/execute',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
};

// ===== Duplicate Detection =====

/**
 * Find duplicate notes by note type and field
 */
export const findDuplicates = (dto: FindDuplicatesDto) => {
  return request.post<DuplicateGroupDto[], { code: number; data: DuplicateGroupDto[] }>(
    '/api/v1/notes/find-duplicates',
    dto
  );
};

/**
 * Merge duplicates: keep one note, delete others
 */
export const mergeDuplicates = (dto: MergeDuplicatesDto) => {
  return request.post<{ success: boolean }, { code: number; data: { success: boolean } }>(
    '/api/v1/notes/merge-duplicates',
    dto
  );
};

// ===== APKG Import =====

/**
 * Import an APKG file
 */
export const importApkg = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  return request.post<unknown, { code: number; data: ImportResultDto }>(
    '/api/v1/import/apkg',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
};
