/**
 * Echoe DTOs
 */

export interface EchoeDeckDto {
  /** Deck ID */
  id: number;
  /** Deck name (supports '::' for sub-decks) */
  name: string;
  /** Deck config ID */
  conf: number;
  /** Extend new cards limit */
  extendNew: number;
  /** Extend review limit */
  extendRev: number;
  /** Whether deck is collapsed in UI */
  collapsed: boolean;
  /** Whether deck is a filtered deck (0=normal, 1=filtered) */
  dyn: number;
  /** Deck description */
  desc: string;
  /** Last note type used */
  mid: number;
  /** Last modified time (Unix timestamp in seconds) */
  mod: number;
}

export interface EchoeDeckWithCountsDto extends EchoeDeckDto {
  /** Number of new cards due today */
  newCount: number;
  /** Number of learning cards */
  learnCount: number;
  /** Number of review cards due */
  reviewCount: number;
  /** Total number of cards in this deck */
  totalCount: number;
  /** Number of mature cards (stability >= 21 days) */
  matureCount: number;
  /** Number of difficult cards (retrievability < 0.9) */
  difficultCount: number;
  /** Average retrievability of cards in this deck (0-1) */
  averageRetrievability: number;
  /** Last studied timestamp (Unix ms), null if never studied */
  lastStudiedAt: number | null;
  /** Child decks */
  children: EchoeDeckWithCountsDto[];
}

export interface CreateEchoeDeckDto {
  /** Deck name (supports '::' separator for sub-decks) */
  name: string;
  /** Optional deck description */
  desc?: string;
  /** Optional deck config ID (defaults to 1) */
  conf?: number;
  /** Whether this is a filtered deck (dyn=1) */
  dyn?: boolean;
  /** Search query for filtered deck */
  searchQuery?: string;
}

export interface CreateFilteredDeckDto {
  /** Deck name */
  name: string;
  /** Search query (Echoe search syntax) */
  searchQuery: string;
  /** Rebuild daily (resets counts each day) */
  rebuildDaily?: boolean;
}

export interface FilteredDeckPreviewDto {
  /** Total number of matching cards */
  count: number;
  /** Sample cards (first 5) */
  sampleCards: EchoeCardListItemDto[];
}

export interface UpdateEchoeDeckDto {
  /** New deck name */
  name?: string;
  /** New deck description */
  desc?: string;
}

export interface EchoeDeckConfigDto {
  /** Config ID */
  id: number;
  /** Config name */
  name: string;
  /** Replay queue on answer */
  replayq: boolean;
  /** Show timer (0=off, 1=on) */
  timer: number;
  /** Max time taken (seconds) */
  maxTaken: number;
  /** Auto-play audio mode: 'front' | 'back' | 'both' | 'never' */
  autoplay: string;
  /** TTS speed (0.5 to 2.0) */
  ttsSpeed: number;
  /** Last modified time */
  mod: number;
  /** New card settings (JSON) */
  newConfig: EchoeNewCardConfigDto;
  /** Review settings (JSON) */
  revConfig: EchoeReviewConfigDto;
  /** Lapse settings (JSON) */
  lapseConfig: EchoeLapseConfigDto;
  /** Normalized FSRS scheduling settings */
  fsrsConfig: EchoeFsrsConfigDto;
}

export interface EchoeFsrsConfigDto {
  /** Target retention rate (0.7 - 0.99) */
  requestRetention: number;
  /** Maximum interval in days */
  maxInterval: number;
  /** Whether to enable scheduling fuzz */
  enableFuzz: boolean;
  /** Whether to enable short-term scheduler */
  enableShortTerm: boolean;
  /** Learning steps in minutes */
  learningSteps: number[];
  /** Relearning steps in minutes */
  relearningSteps: number[];
}

export interface EchoeNewCardConfigDto {
  /** Steps in minutes (e.g., [1, 10]) */
  steps: number[];
  /** Initial intervals in days */
  initialInterval: number;
  /** Graduating interval in days */
  graduatingInterval: number;
  /** Easy interval in days */
  easyInterval: number;
  /** Maximum new cards per day */
  perDay: number;
}

export interface EchoeReviewConfigDto {
  /** Maximum reviews per day */
  perDay: number;
  /** Easy bonus */
  easyBonus: number;
  /** Interval multiplier */
  intervalModifier: number;
  /** Maximum interval in days */
  maxInterval: number;
}

export interface EchoeLapseConfigDto {
  /** Steps in minutes */
  steps: number[];
  /** Minimum interval in days */
  minInterval: number;
  /** Multiplier for lapsed cards */
  mult: number;
  /** Number of leech threshold */
  leechThreshold: number;
  /** Leech action (0=suspend, 1=mark only) */
  leechAction: number;
}

export interface UpdateEchoeDeckConfigDto {
  /** Config name */
  name?: string;
  /** Replay queue on answer */
  replayq?: boolean;
  /** Show timer */
  timer?: number;
  /** Max time taken */
  maxTaken?: number;
  /** Auto-play audio mode: 'front' | 'back' | 'both' | 'never' */
  autoplay?: string;
  /** TTS speed (0.5 to 2.0) */
  ttsSpeed?: number;
  /** New card settings (JSON) */
  newConfig?: Partial<EchoeNewCardConfigDto>;
  /** Review settings (JSON) */
  revConfig?: Partial<EchoeReviewConfigDto>;
  /** Lapse settings (JSON) */
  lapseConfig?: Partial<EchoeLapseConfigDto>;
  /** FSRS scheduling settings */
  fsrsConfig?: Partial<EchoeFsrsConfigDto>;
}

// ===== Note Types =====

export interface EchoeNoteTypeDto {
  /** Note type ID */
  id: number;
  /** Note type name */
  name: string;
  /** Last modified time */
  mod: number;
  /** Sort field index */
  sortf: number;
  /** Last deck used */
  did: number;
  /** Templates (JSON array) */
  tmpls: EchoeTemplateDto[];
  /** Fields (JSON array) */
  flds: EchoeFieldDto[];
  /** CSS */
  css: string;
  /** Note type (0=standard, 1=cloze) */
  type: number;
  /** LaTeX pre */
  latexPre: string;
  /** LaTeX post */
  latexPost: string;
  /** Required fields (JSON) */
  req: string;
  /** Number of notes using this note type */
  noteCount?: number;
  /** Clone from note type ID (used when creating by cloning) */
  cloneFrom?: number;
}

export interface EchoeTemplateDto {
  /** Template ID */
  id: number;
  /** Template name */
  name: string;
  /** Ordinal */
  ord: number;
  /** Question format */
  qfmt: string;
  /** Answer format */
  afmt: string;
  /** Back question format */
  bqfmt: string;
  /** Back answer format */
  bafmt: string;
  /** Target deck ID */
  did: number;
}

export interface EchoeFieldDto {
  /** Field name */
  name: string;
  /** Field ord */
  ord: number;
  /** Sticky */
  sticky: boolean;
  /** RTL */
  rtl: boolean;
  /** Font */
  font: string;
  /** Font size */
  size: number;
  /** Description */
  description: string;
  /** MathJax */
  mathjax: boolean;
  /** Hidden */
  hidden: boolean;
}

export interface CreateEchoeNoteTypeDto {
  /** Note type name */
  name: string;
  /** Clone from note type ID */
  cloneFrom?: number;
  /** CSS */
  css?: string;
  /** LaTeX pre */
  latexPre?: string;
  /** LaTeX post */
  latexPost?: string;
  /** Fields */
  flds?: CreateEchoeFieldDto[];
  /** Templates */
  tmpls?: CreateEchoeTemplateDto[];
}

export interface CreateEchoeFieldDto {
  /** Field name */
  name: string;
}

export interface CreateEchoeTemplateDto {
  /** Template name */
  name: string;
  /** Question format */
  qfmt: string;
  /** Answer format */
  afmt?: string;
}

export interface UpdateEchoeNoteTypeDto {
  /** Note type name */
  name?: string;
  /** CSS */
  css?: string;
  /** LaTeX pre */
  latexPre?: string;
  /** LaTeX post */
  latexPost?: string;
  /** Fields to add */
  flds?: CreateEchoeFieldDto[];
  /** Templates to add */
  tmpls?: CreateEchoeTemplateDto[];
}

// ===== Notes =====

export interface EchoeNoteDto {
  /** Note ID */
  id: number;
  /** Note GUID */
  guid: string;
  /** Note type ID */
  mid: number;
  /** Last modified time */
  mod: number;
  /** Tags (JSON array) */
  tags: string[];
  /** Field values */
  fields: Record<string, string>;
  /** Sort field */
  sfld: string;
  /** Checksum */
  csum: number;
  /** Flags */
  flags: number;
  /** Data */
  data: string;
  /** Rich text JSON for fields (keyed by field name) */
  richTextFields?: Record<string, Record<string, any>>;
}

export interface EchoeNoteWithCardsDto extends EchoeNoteDto {
  /** Cards for this note */
  cards: EchoeCardDto[];
}

export interface CreateEchoeNoteDto {
  /** Note type ID */
  notetypeId: number;
  /** Deck ID */
  deckId: number;
  /** Field values */
  fields: Record<string, string>;
  /** Tags */
  tags?: string[];
  /** Rich text JSON for fields (keyed by field name) */
  richTextFields?: Record<string, Record<string, any>>;
}

export interface UpdateEchoeNoteDto {
  /** Field values */
  fields?: Record<string, string>;
  /** Tags */
  tags?: string[];
  /** Rich text JSON for fields (keyed by field name) */
  richTextFields?: Record<string, Record<string, any>>;
}

// ===== Cards =====

export interface EchoeCardDto {
  /** Card ID */
  id: number;
  /** Note ID */
  nid: number;
  /** Deck ID */
  did: number;
  /** Template ordinal */
  ord: number;
  /** Last modified time */
  mod: number;
  /** Card type (0=new, 1=learning, 2=review, 3=relearning) */
  type: number;
  /** Queue (0=new, 1=learning, 2=review, -1=suspended, -2=buried, -3=sibling buried) */
  queue: number;
  /** Due time (Unix timestamp in milliseconds) */
  due: number;
  /** Interval in days */
  ivl: number;
  /** Ease factor (permille) */
  factor: number;
  /** Number of reviews */
  reps: number;
  /** Number of lapses */
  lapses: number;
  /** Steps remaining */
  left: number;
  /** USN */
  usn: number;
  /** Stability (days) - represents how well the card is remembered */
  stability: number;
  /** Difficulty (0-1) - probability of forgetting */
  difficulty: number;
  /** Last review timestamp (Unix ms) */
  lastReview: number;
}

export interface EchoeCardWithNoteDto extends EchoeCardDto {
  /** Full note data */
  note: EchoeNoteDto;
}

/** Card list item for browser - includes deck info */
export interface EchoeCardListItemDto {
  /** Card ID */
  id: number;
  /** Note ID */
  nid: number;
  /** Deck ID */
  did: number;
  /** Deck name */
  deckName: string;
  /** Template ordinal */
  ord: number;
  /** Card type (0=new, 1=learning, 2=review, 3=relearning) */
  type: number;
  /** Queue (0=new, 1=learning, 2=review, -1=suspended, -2=buried, -3=sibling buried) */
  queue: number;
  /** Due time (Unix timestamp in milliseconds) */
  due: number;
  /** Interval in days */
  ivl: number;
  /** Ease factor (permille) */
  factor: number;
  /** Number of reviews */
  reps: number;
  /** Number of lapses */
  lapses: number;
  /** Front field value (truncated) */
  front: string;
  /** All note fields */
  fields: Record<string, string>;
  /** Note tags */
  tags: string[];
  /** Note type ID */
  mid: number;
  /** Note type name */
  notetypeName: string;
  /** Added date (Unix timestamp in seconds) */
  addedAt: number;
  /** Modified date (Unix timestamp in seconds) */
  mod: number;
  /** Note type (0=standard, 1=cloze) */
  notetypeType: number;
}

/** Query params for card list */
export interface EchoeCardQueryParams {
  /** Filter by deck ID */
  deckId?: number;
  /** Search query */
  q?: string;
  /** Filter by status: new, learn, review, suspended, buried, leech */
  status?: 'new' | 'learn' | 'review' | 'suspended' | 'buried' | 'leech';
  /** Filter by tag */
  tag?: string;
  /** Sort field: added, due, mod */
  sort?: 'added' | 'due' | 'mod';
  /** Sort direction: asc, desc */
  order?: 'asc' | 'desc';
  /** Page number (default 1) */
  page?: number;
  /** Items per page (default 50) */
  limit?: number;
}

export type BulkCardAction =
  | 'suspend'
  | 'unsuspend'
  | 'bury'
  | 'unbury'
  | 'forget'
  | 'move'
  | 'addTag'
  | 'removeTag';

export interface BulkCardOperationDto {
  /** Card IDs */
  cardIds: number[];
  /** Action to perform */
  action: BulkCardAction;
  /** Optional payload (for move: { deckId: number }, for addTag/removeTag: { tag: string }) */
  payload?: {
    deckId?: number;
    tag?: string;
  };
}

// ===== Query Params =====

export interface EchoeNoteQueryParams {
  /** Filter by deck ID */
  deckId?: number;
  /** Filter by tags (comma-separated) */
  tags?: string;
  /** Search query */
  q?: string;
  /** Filter by status: new, learn, review, suspended, buried */
  status?: 'new' | 'learn' | 'review' | 'suspended' | 'buried';
  /** Page number (default 1) */
  page?: number;
  /** Items per page (default 20) */
  limit?: number;
}

// ===== Study Session =====

export interface StudyQueueParams {
  /** Deck ID to get queue from */
  deckId?: number;
  /** Limit number of cards to return */
  limit?: number;
  /** Number of days to look ahead for review cards */
  reviewAhead?: number;
  /** Preview mode - return new cards without modifying state */
  preview?: boolean;
}

export interface StudyQueueItemDto {
  /** Card ID */
  cardId: number;
  /** Note ID */
  noteId: number;
  /** Deck ID */
  deckId: number;
  /** Card type (0=new, 1=learning, 2=review, 3=relearning) */
  cardType: number;
  /** Queue type */
  queue: number;
  /** Due time (Unix timestamp in milliseconds) */
  due: number;
  /** Interval in days */
  interval: number;
  /** Ease factor (permille) */
  factor: number;
  /** Number of reviews */
  reps: number;
  /** Number of lapses */
  lapses: number;
  /** Remaining steps */
  left: number;
  /** Note type ID */
  notetypeId: number;
  /** Front content (rendered) */
  front: string;
  /** Back content (rendered) */
  back: string;
  /** Card template ordinal */
  templateOrd: number;
  /** Note type (0=standard, 1=cloze) */
  notetypeType: number;
  /** Cloze ordinal (1-based, for cloze cards) */
  clozeOrdinal: number;
  /**
   * Current retrievability (memory recall probability, 0-1).
   * - New cards: 1 (full retrievability)
   * - Review cards: R(t,S) = (1 + t/(9S))^(-1), where t = days since last review, S = stability
   * - null if stability/lastReview data is unavailable
   */
  retrievability: number | null;
}

export interface ReviewSubmissionDto {
  /** Card ID being reviewed */
  cardId: number;
  /** Rating: 1=Again, 2=Hard, 3=Good, 4=Easy */
  rating: 1 | 2 | 3 | 4;
  /** Time taken in milliseconds */
  timeTaken: number;
  /** Review ID being reviewed (for undo) */
  reviewId?: number;
  /** Preview mode - do not update card state or write revlog */
  preview?: boolean;
}

export interface ReviewResultDto {
  /** The reviewed card */
  card: EchoeCardWithNoteDto;
  /** Next due time (Unix timestamp in milliseconds) */
  nextDue: number;
  /** Next interval in days */
  nextInterval: number;
  /** Next ease factor */
  nextFactor: number;
  /** Whether card graduated to review */
  graduated: boolean;
  /** Whether card was detected as a leech */
  isLeech?: boolean;
}

export interface StudyCountsDto {
  /** Number of new cards */
  newCount: number;
  /** Number of learning cards */
  learnCount: number;
  /** Number of review cards due */
  reviewCount: number;
  /** Total cards to study */
  totalCount: number;
}

export interface RatingOptionDto {
  /** Rating: 1=Again, 2=Hard, 3=Good, 4=Easy */
  rating: 1 | 2 | 3 | 4;
  /** Rating label */
  label: string;
  /** Next interval in days */
  interval: number;
  /** Next due time (Unix timestamp in milliseconds) */
  due: number;
  /** Next stability */
  stability: number;
  /** Next difficulty */
  difficulty: number;
}

export interface StudyOptionsDto {
  /** Card ID */
  cardId: number;
  /** All rating options */
  options: RatingOptionDto[];
  /**
   * Current retrievability (memory recall probability, 0-1).
   * - New cards: 1
   * - Review cards: R(t,S) = (1 + t/(9S))^(-1)
   * - null if unavailable
   */
  retrievability: number | null;
}

export interface UndoResultDto {
  /** Whether undo was successful */
  success: boolean;
  /** Message describing the result */
  message: string;
}

export interface BuryCardsDto {
  /** Card IDs to bury */
  cardIds: number[];
  /** Bury mode: 'card' for single card (queue=-2), 'note' for all siblings (queue=-3) */
  mode?: 'card' | 'note';
}

export interface ForgetCardsDto {
  /** Card IDs to reset */
  cardIds: number[];
}

// ===== Media =====

export interface EchoeMediaDto {
  /** Media file ID */
  id: number;
  /** Stored filename */
  filename: string;
  /** Original uploaded filename */
  originalFilename: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** SHA1 hash of file */
  hash: string;
  /** Creation timestamp */
  createdAt: number;
  /** Whether file is referenced in any card */
  usedInCards: boolean;
}

export interface UploadMediaDto {
  /** File buffer */
  buffer: Buffer;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
}

export interface UploadMediaResultDto {
  /** Stored filename */
  filename: string;
  /** URL to access the file */
  url: string;
}

export interface DeleteMediaBulkDto {
  /** List of filenames to delete */
  filenames: string[];
}

export interface CheckUnusedMediaResultDto {
  /** List of unused media filenames */
  unusedFiles: string[];
}

// ===== Import =====

export interface ImportErrorDetailDto {
  /** Category of the error */
  category: 'notetype' | 'deck' | 'note' | 'card' | 'revlog' | 'media' | 'general';
  /** Error message */
  message: string;
  /** Optional identifier (e.g., note id, deck name) */
  id?: string | number;
}

export interface ImportResultDto {
  /** Number of notes added */
  notesAdded: number;
  /** Number of notes updated */
  notesUpdated: number;
  /** Number of notes skipped */
  notesSkipped: number;
  /** Number of cards added */
  cardsAdded: number;
  /** Number of cards updated */
  cardsUpdated: number;
  /** Number of decks added */
  decksAdded: number;
  /** Number of notetypes added */
  notetypesAdded: number;
  /** Number of revlog entries imported */
  revlogImported: number;
  /** Number of media files imported */
  mediaImported: number;
  /** List of errors (simple string format for backwards compatibility) */
  errors: string[];
  /** Detailed error breakdown by category */
  errorDetails?: ImportErrorDetailDto[];
  /** Number of cards with FSRS backfill from revlog */
  fsrsBackfilledFromRevlog?: number;
  /** Number of cards kept as new (no revlog, type=0) */
  fsrsNewCards?: number;
  /** Number of cards with heuristic FSRS backfill */
  fsrsHeuristic?: number;
}

// ===== Statistics =====

export interface StudyTodayStatsDto {
  /** Number of cards studied today */
  studied: number;
  /** Total time spent in milliseconds */
  timeSpent: number;
  /** Number of Again ratings */
  again: number;
  /** Number of Hard ratings */
  hard: number;
  /** Number of Good ratings */
  good: number;
  /** Number of Easy ratings */
  easy: number;
}

export interface StudyHistoryDayDto {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Number of reviews */
  count: number;
  /** Total time spent in milliseconds */
  timeSpent: number;
}

export interface CardMaturityDto {
  /** Number of new cards (interval = 0) */
  new: number;
  /** Number of learning cards (interval < 21 days) */
  learning: number;
  /** Number of young cards (interval 21-89 days) */
  young: number;
  /** Number of mature cards (interval >= 90 days) */
  mature: number;
}

export interface ForecastDayDto {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Number of cards due on this date */
  dueCount: number;
}

// ===== Global Echoe Settings =====

export interface EchoeGlobalSettingsDto {
  /** Auto-play audio mode: 'front' | 'back' | 'both' | 'never' */
  autoplay: string;
  /** TTS speed (0.5 to 2.0) */
  ttsSpeed: number;
  /** Card flip animation enabled */
  flipAnimation: boolean;
  /** Default font size: 'small' | 'medium' | 'large' */
  fontSize: string;
  /** Theme: 'auto' | 'light' | 'dark' */
  theme: string;
  /** Global daily new card limit */
  newLimit: number;
  /** Global daily review card limit */
  reviewLimit: number;
  /** Daily start hour (0-23) */
  dayStartHour: number;
}

export interface UpdateEchoeGlobalSettingsDto {
  /** Auto-play audio mode: 'front' | 'back' | 'both' | 'never' */
  autoplay?: string;
  /** TTS speed (0.5 to 2.0) */
  ttsSpeed?: number;
  /** Card flip animation enabled */
  flipAnimation?: boolean;
  /** Default font size: 'small' | 'medium' | 'large' */
  fontSize?: string;
  /** Theme: 'auto' | 'light' | 'dark' */
  theme?: string;
  /** Global daily new card limit */
  newLimit?: number;
  /** Global daily review card limit */
  reviewLimit?: number;
  /** Daily start hour (0-23) */
  dayStartHour?: number;
}

// ===== Deck Config Presets =====

export interface EchoeDeckConfigPresetDto {
  id: string;
  name: string;
  config: {
    new?: {
      perDay?: number;
      learnAhead?: number;
      minSpace?: number;
      leechThreshold?: number;
    };
    rev?: {
      perDay?: number;
      ease4?: number;
      interval?: number;
      hardInterval?: number;
    };
    lapse?: {
      delCount?: number;
      minInt?: number;
      leechAction?: number;
    };
    fsrs?: Partial<EchoeFsrsConfigDto>;
    timer?: number;
    autoplay?: boolean;
    replayq?: boolean;
  };
  createdAt: number;
}

export interface CreateDeckConfigPresetDto {
  name: string;
  config: EchoeDeckConfigPresetDto['config'];
}

export interface DeleteDeckConfigPresetDto {
  id: string;
}

// Tag DTOs
export interface EchoeTagDto {
  /** Tag name */
  name: string;
  /** Number of notes using this tag */
  count: number;
}

export interface RenameTagDto {
  /** New tag name */
  newName: string;
}

export interface MergeTagsDto {
  /** Source tag to merge from */
  source: string;
  /** Target tag to merge into */
  target: string;
}

// ===== CSV/TSV Import =====

export interface CsvPreviewDto {
  /** Sample rows from the CSV/TSV file */
  rows: string[][];
  /** Detected character encoding */
  detectedEncoding: string;
  /** Detected delimiter (comma, tab, etc.) */
  detectedDelimiter: string;
  /** Total number of columns */
  totalColumns: number;
  /** Total number of rows (excluding header if present) */
  totalRows: number;
}

export interface CsvExecuteDto {
  /** Column mapping: columnIndex -> field name (Front, Back, Tags) or Ignore */
  columnMapping: Record<number, string>;
  /** Note type ID to use for imported notes */
  notetypeId: number;
  /** Deck ID to import notes into */
  deckId: number;
  /** Whether the CSV/TSV has a header row */
  hasHeader: boolean;
}

export interface CsvImportResultDto {
  /** Number of notes added */
  added: number;
  /** Number of notes updated */
  updated: number;
  /** Number of notes skipped */
  skipped: number;
  /** List of errors with row numbers and reasons */
  errors: { row: number; reason: string }[];
}

// ===== Duplicate Detection =====

export interface FindDuplicatesDto {
  /** Note type ID to search within */
  notetypeId: number;
  /** Field name to check for duplicates (e.g., "Front") */
  fieldName: string;
  /** Similarity threshold (0-1, default 1.0 for exact match) */
  threshold?: number;
}

export interface DuplicateGroupDto {
  /** Notes in this duplicate group */
  notes: EchoeNoteDto[];
}

export interface MergeDuplicatesDto {
  /** Note ID to keep */
  keepId: number;
  /** Note IDs to delete */
  deleteIds: number[];
}
