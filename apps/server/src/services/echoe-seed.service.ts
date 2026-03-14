import { Service } from 'typedi';
import { eq, and, gt, lt, inArray, sql, or } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import {
  echoeCol,
  echoeDecks,
  echoeDeckConfig,
  echoeNotetypes,
  echoeCards,
  echoeRevlog,
  echoeConfig,
} from '../db/schema/index.js';
import { logger } from '../utils/logger.js';

const DEFAULT_DECK_ID = 1;
const DEFAULT_DECK_CONFIG_ID = 1;
const DUE_MS_REPAIR_KEY = 'migration_due_ms_v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const SECOND_MS = 1000;
const LEGACY_DAY_DUE_MAX = 10_000_000;
const LEGACY_SECOND_DUE_MAX = 100_000_000_000;

// Temporary placeholder UID for global seed data (will be replaced by per-user workspace in US-010)
const SEED_UID = 'SYSTEM';

// Default note type IDs (must match across seeds for compatibility)
const NOTE_TYPE_BASIC = 1;
const NOTE_TYPE_BASIC_REVERSED = 2;
const NOTE_TYPE_BASIC_OPTIONAL_REVERSED = 3;
const NOTE_TYPE_BASIC_TYPE_IN_ANSWER = 4;
const NOTE_TYPE_CLOZE = 5;

// Default field definitions
const BASIC_FIELDS = JSON.stringify([
  { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false },
  { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false },
]);

const CLOZE_FIELDS = JSON.stringify([
  { name: 'Text', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false },
  { name: 'Extra', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false },
]);

// Basic CSS
const DEFAULT_CSS = `
.card {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
`;

// Basic note type template
function createBasicTemplate(name: string, qfmt: string, afmt: string, ord: number) {
  return {
    name,
    ord,
    qfmt,
    afmt,
    bqfmt: '',
    bafmt: '',
    did: null,
    mod: Math.floor(Date.now() / 1000),
    usn: -1,
  };
}

// Note type definitions matching Anki 2.1 default structure
function createNoteType(id: number, name: string, fields: string, templates: ReturnType<typeof createBasicTemplate>[], type: number = 0) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    uid: SEED_UID,
    name,
    mod: now,
    usn: -1,
    sortf: 0,
    did: 0,
    tmpls: JSON.stringify(templates),
    flds: fields,
    css: DEFAULT_CSS,
    type,
    latexPre: '',
    latexPost: '',
    req: JSON.stringify(templates.map((t, i) => [i, 'any', []])),
  };
}

const NOTE_TYPES = [
  // Basic
  createNoteType(
    NOTE_TYPE_BASIC,
    'Basic',
    BASIC_FIELDS,
    [createBasicTemplate('Card 1', '{{Front}}', '{{FrontSide}}<hr id="answer">{{Back}}', 0)]
  ),
  // Basic (Reversed)
  createNoteType(
    NOTE_TYPE_BASIC_REVERSED,
    'Basic (Reversed)',
    BASIC_FIELDS,
    [
      createBasicTemplate('Card 1', '{{Front}}', '{{FrontSide}}<hr id="answer">{{Back}}', 0),
      createBasicTemplate('Card 2', '{{Back}}', '{{FrontSide}}<hr id="answer">{{Front}}', 1),
    ]
  ),
  // Basic (Optional Reversed)
  createNoteType(
    NOTE_TYPE_BASIC_OPTIONAL_REVERSED,
    'Basic (Optional Reversed)',
    JSON.stringify([
      { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false },
      { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false },
      { name: 'Add Reverse', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false },
    ]),
    [
      createBasicTemplate('Card 1', '{{Front}}', '{{FrontSide}}<hr id="answer">{{Back}}', 0),
      createBasicTemplate('Card 2', '{{#Add Reverse}}{{Back}}{{/Add Reverse}}', '{{FrontSide}}<hr id="answer">{{Front}}', 1),
    ]
  ),
  // Basic (Type in the answer)
  createNoteType(
    NOTE_TYPE_BASIC_TYPE_IN_ANSWER,
    'Basic (Type in the answer)',
    BASIC_FIELDS,
    [createBasicTemplate('Card 1', '{{Front}}<br>{{type:Back}}', '{{FrontSide}}<hr id="answer">{{Back}}', 0)]
  ),
  // Cloze
  createNoteType(
    NOTE_TYPE_CLOZE,
    'Cloze',
    CLOZE_FIELDS,
    [
      createBasicTemplate('Card 1', '{{cloze:Text}}', '{{cloze:Text}}<br>{{Extra}}', 0),
    ],
    1 // type 1 = cloze
  ),
];

// Default deck config
function createDefaultDeckConfig() {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: DEFAULT_DECK_CONFIG_ID,
    uid: SEED_UID,
    name: 'Default',
    replayq: 1,
    timer: 0,
    maxTaken: 60,
    autoplay: 1,
    mod: now,
    usn: -1,
    newConfig: JSON.stringify({
      bury: true,
      newBrand: 'again',
      newGood: 'good',
      newHard: 'hard',
      newInterval: 1,
      newSteps: [1, 10],
      order: 1,
      perDay: 20,
      delays: [1, 10],
    }),
    revConfig: JSON.stringify({
      bury: true,
      ease: 2.5,
      ease4: 1.3,
      fuzz: 0.05,
      hardMaxInterval: 36500,
      hardInterval: 1.2,
      maxInterval: 36500,
      minSpace: 1,
      mult: 1,
      perDay: 200,
      fsrs: {
        requestRetention: 0.9,
        maxInterval: 36500,
        enableFuzz: true,
        enableShortTerm: false,
        learningSteps: [1, 10],
        relearningSteps: [10],
      },
    }),
    lapseConfig: JSON.stringify({
      bury: true,
      delays: [10],
      leechAction: 0,
      leechFails: 8,
      minInt: 1,
      mult: 1,
      resched: true,
    }),
  };
}

// Default deck
function createDefaultDeck() {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: DEFAULT_DECK_ID,
    uid: SEED_UID,
    name: 'Default',
    conf: DEFAULT_DECK_CONFIG_ID,
    extendNew: 20,
    extendRev: 200,
    usn: -1,
    lim: 0,
    collapsed: 0,
    dyn: 0,
    mod: now,
    desc: '',
    mid: 0,
  };
}

// Collection config
function createDefaultColConfig() {
  return {
    addCurDeck: true,
    addToCur: true,
    autoPlay: true,
    backendVersion: '23.10.1',
    browserHeight: 632,
    browserWidth: 517,
    cardBrowserCol: 'noteFld',
    changed: false,
    creationOffset: 0,
    curDeck: DEFAULT_DECK_ID,
    currentTheme: 'light',
    dayLearnFirst: false,
    dueCounts: true,
    editFontSize: 12,
    escapeKeys: ' o',
    exportMedia: true,
    findAddCards: false,
    fullSearch: false,
    fwdReviewake: true,
    glueKeys: false,
    handleMode: 0,
    hardFactor: 1,
    hideAudioPlayButtons: false,
    homeUrl: 'https://ankiweb.net/',
    hwOffloadFactor: 0.8,
    idlePCTime: false,
    internalPM: true,
    lang: 'en',
    laeSubdecks: true,
    lastClick: 0,
    leftAlign: false,
    local: true,
    mergeStrategy: 2,
    mod: true,
    newCalendarID: 0,
    newSpread: 0,
    nextPos: 1,
    nightMode: false,
    notetypeLapse: true,
    notify: true,
    notifyTimer: true,
    openLastDeck: true,
    overrideDefaults: true,
    pastePNG: false,
    preload: true,
    qLayout: 0,
    randomCol: 0,
    removeSched: true,
    removeTime: true,
    replaysOnAnswer: true,
    replaceNewline: 2,
    revertToCopied: true,
    saveFreq: 10,
    searchInMulti: true,
    showBarRefresh: true,
    showCalc: false,
    showDueCounts: true,
    showEstimates: true,
    showFront: true,
    skipCheck: false,
    sortBackwards: false,
    sortOrder: 0,
    stripCV: false,
    suspendNoteOnCurrentCard: false,
    swapClipboard: false,
    syncPrimitives: true,
    theme: 'light',
    timeLimit: 0,
    timer: 0,
    transparency: 1,
    uiLock: false,
    updateMode: false,
    useHardFactor: true,
    utf8: true,
    verticalSpacing: 0,
  };
}

@Service()
export class EchoeSeedService {
  /**
   * Seeds the database with default Echoe data if not already seeded.
   * This is idempotent - safe to call multiple times.
   * @deprecated Use ensureUserWorkspace(uid) for per-user initialization
   */
  async seedIfNeeded(): Promise<void> {
    const db = getDatabase();

    // Check if collection already exists
    const existingCol = await db.select().from(echoeCol).limit(1);
    if (existingCol.length > 0) {
      logger.info('Echoe collection already exists, skipping seed');
      await this.repairLegacyDueToMilliseconds();
      return;
    }

    logger.info('Seeding Echoe default data...');

    // Seed deck config first (default deck references it)
    const existingConfig = await db.select().from(echoeDeckConfig).where(eq(echoeDeckConfig.id, DEFAULT_DECK_CONFIG_ID));
    if (existingConfig.length === 0) {
      await db.insert(echoeDeckConfig).values(createDefaultDeckConfig());
      logger.info('Seeded default deck config');
    }

    // Seed default deck
    const existingDeck = await db.select().from(echoeDecks).where(eq(echoeDecks.id, DEFAULT_DECK_ID));
    if (existingDeck.length === 0) {
      await db.insert(echoeDecks).values(createDefaultDeck());
      logger.info('Seeded default deck');
    }

    // Seed note types
    for (const noteType of NOTE_TYPES) {
      const existing = await db.select().from(echoeNotetypes).where(eq(echoeNotetypes.id, noteType.id));
      if (existing.length === 0) {
        await db.insert(echoeNotetypes).values(noteType);
        logger.info(`Seeded note type: ${noteType.name}`);
      }
    }

    // Seed collection
    const now = Math.floor(Date.now() / 1000);
    const colData: typeof echoeCol.$inferInsert = {
      id: now,
      uid: SEED_UID,
      crt: Math.floor(Date.now() / 1000),
      mod: now,
      scm: now,
      ver: 11,
      dty: 0,
      usn: -1,
      ls: 0,
      conf: JSON.stringify(createDefaultColConfig()),
      models: JSON.stringify({}),
      decks: JSON.stringify({}),
      dconf: JSON.stringify({}),
      tags: JSON.stringify({}),
    };
    await db.insert(echoeCol).values(colData);
    logger.info('Seeded collection');

    logger.info('Echoe seed completed successfully');

    await this.repairLegacyDueToMilliseconds();
  }

  /**
   * Ensures a user has their own Echoe workspace initialized.
   * This is idempotent - safe to call multiple times for the same user.
   * Initializes user-scoped defaults for col, deck, deck_config, notetype, and template.
   *
   * @param uid - User ID to initialize workspace for
   */
  async ensureUserWorkspace(uid: string): Promise<void> {
    const db = getDatabase();

    // Check if user workspace already exists (check for user's collection)
    const existingCol = await db
      .select()
      .from(echoeCol)
      .where(eq(echoeCol.uid, uid))
      .limit(1);

    if (existingCol.length > 0) {
      logger.debug(`User workspace already exists for uid=${uid}, skipping initialization`);
      return;
    }

    logger.info(`Initializing Echoe workspace for user uid=${uid}`);

    const now = Math.floor(Date.now() / 1000);
    const nowMs = Date.now();

    // Generate unique IDs for user's resources using timestamp-based approach
    const deckConfigId = nowMs;
    const deckId = nowMs + 1;
    const noteTypeBasicId = nowMs + 2;
    const noteTypeBasicReversedId = nowMs + 3;
    const noteTypeBasicOptionalReversedId = nowMs + 4;
    const noteTypeBasicTypeInAnswerId = nowMs + 5;
    const noteTypeClozeId = nowMs + 6;

    // 1. Create default deck config
    const deckConfigData = {
      id: deckConfigId,
      uid,
      name: 'Default',
      replayq: 1,
      timer: 0,
      maxTaken: 60,
      autoplay: 1,
      mod: now,
      usn: -1,
      newConfig: JSON.stringify({
        bury: true,
        newBrand: 'again',
        newGood: 'good',
        newHard: 'hard',
        newInterval: 1,
        newSteps: [1, 10],
        order: 1,
        perDay: 20,
        delays: [1, 10],
      }),
      revConfig: JSON.stringify({
        bury: true,
        ease: 2.5,
        ease4: 1.3,
        fuzz: 0.05,
        hardMaxInterval: 36500,
        hardInterval: 1.2,
        maxInterval: 36500,
        minSpace: 1,
        mult: 1,
        perDay: 200,
        fsrs: {
          requestRetention: 0.9,
          maxInterval: 36500,
          enableFuzz: true,
          enableShortTerm: false,
          learningSteps: [1, 10],
          relearningSteps: [10],
        },
      }),
      lapseConfig: JSON.stringify({
        bury: true,
        delays: [10],
        leechAction: 0,
        leechFails: 8,
        minInt: 1,
        mult: 1,
        resched: true,
      }),
    };
    await db.insert(echoeDeckConfig).values(deckConfigData);
    logger.debug(`Created default deck config for uid=${uid}`);

    // 2. Create default deck
    const deckData = {
      id: deckId,
      uid,
      name: 'Default',
      conf: deckConfigId,
      extendNew: 20,
      extendRev: 200,
      usn: -1,
      lim: 0,
      collapsed: 0,
      dyn: 0,
      mod: now,
      desc: '',
      mid: 0,
    };
    await db.insert(echoeDecks).values(deckData);
    logger.debug(`Created default deck for uid=${uid}`);

    // 3. Create note types with templates
    const noteTypesData = [
      // Basic
      {
        id: noteTypeBasicId,
        uid,
        name: 'Basic',
        mod: now,
        usn: -1,
        sortf: 0,
        did: 0,
        tmpls: JSON.stringify([createBasicTemplate('Card 1', '{{Front}}', '{{FrontSide}}<hr id="answer">{{Back}}', 0)]),
        flds: BASIC_FIELDS,
        css: DEFAULT_CSS,
        type: 0,
        latexPre: '',
        latexPost: '',
        req: JSON.stringify([[0, 'any', []]]),
      },
      // Basic (Reversed)
      {
        id: noteTypeBasicReversedId,
        uid,
        name: 'Basic (Reversed)',
        mod: now,
        usn: -1,
        sortf: 0,
        did: 0,
        tmpls: JSON.stringify([
          createBasicTemplate('Card 1', '{{Front}}', '{{FrontSide}}<hr id="answer">{{Back}}', 0),
          createBasicTemplate('Card 2', '{{Back}}', '{{FrontSide}}<hr id="answer">{{Front}}', 1),
        ]),
        flds: BASIC_FIELDS,
        css: DEFAULT_CSS,
        type: 0,
        latexPre: '',
        latexPost: '',
        req: JSON.stringify([[0, 'any', []], [1, 'any', []]]),
      },
      // Basic (Optional Reversed)
      {
        id: noteTypeBasicOptionalReversedId,
        uid,
        name: 'Basic (Optional Reversed)',
        mod: now,
        usn: -1,
        sortf: 0,
        did: 0,
        tmpls: JSON.stringify([
          createBasicTemplate('Card 1', '{{Front}}', '{{FrontSide}}<hr id="answer">{{Back}}', 0),
          createBasicTemplate('Card 2', '{{#Add Reverse}}{{Back}}{{/Add Reverse}}', '{{FrontSide}}<hr id="answer">{{Front}}', 1),
        ]),
        flds: JSON.stringify([
          { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false },
          { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false },
          { name: 'Add Reverse', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false },
        ]),
        css: DEFAULT_CSS,
        type: 0,
        latexPre: '',
        latexPost: '',
        req: JSON.stringify([[0, 'any', []], [1, 'any', []]]),
      },
      // Basic (Type in the answer)
      {
        id: noteTypeBasicTypeInAnswerId,
        uid,
        name: 'Basic (Type in the answer)',
        mod: now,
        usn: -1,
        sortf: 0,
        did: 0,
        tmpls: JSON.stringify([createBasicTemplate('Card 1', '{{Front}}<br>{{type:Back}}', '{{FrontSide}}<hr id="answer">{{Back}}', 0)]),
        flds: BASIC_FIELDS,
        css: DEFAULT_CSS,
        type: 0,
        latexPre: '',
        latexPost: '',
        req: JSON.stringify([[0, 'any', []]]),
      },
      // Cloze
      {
        id: noteTypeClozeId,
        uid,
        name: 'Cloze',
        mod: now,
        usn: -1,
        sortf: 0,
        did: 0,
        tmpls: JSON.stringify([createBasicTemplate('Card 1', '{{cloze:Text}}', '{{cloze:Text}}<br>{{Extra}}', 0)]),
        flds: CLOZE_FIELDS,
        css: DEFAULT_CSS,
        type: 1, // type 1 = cloze
        latexPre: '',
        latexPost: '',
        req: JSON.stringify([[0, 'any', []]]),
      },
    ];

    for (const noteType of noteTypesData) {
      await db.insert(echoeNotetypes).values(noteType);
      logger.debug(`Created note type: ${noteType.name} for uid=${uid}`);
    }

    // 4. Create collection
    const colData: typeof echoeCol.$inferInsert = {
      id: nowMs + 7,
      uid,
      crt: now,
      mod: now,
      scm: now,
      ver: 11,
      dty: 0,
      usn: -1,
      ls: 0,
      conf: JSON.stringify({
        ...createDefaultColConfig(),
        curDeck: deckId, // Point to user's default deck
      }),
      models: JSON.stringify({}),
      decks: JSON.stringify({}),
      dconf: JSON.stringify({}),
      tags: JSON.stringify({}),
    };
    await db.insert(echoeCol).values(colData);
    logger.debug(`Created collection for uid=${uid}`);

    logger.info(`Echoe workspace initialization completed for uid=${uid}`);
  }

  /**
   * One-time repair for legacy day/second based due values.
   * Keeps idempotency via both threshold checks and a config marker key.
   */
  private async repairLegacyDueToMilliseconds(): Promise<void> {
    const db = getDatabase();

    const marker = await db
      .select({ key: echoeConfig.key })
      .from(echoeConfig)
      .where(and(eq(echoeConfig.uid, SEED_UID), eq(echoeConfig.key, DUE_MS_REPAIR_KEY)))
      .limit(1);

    if (marker.length > 0) {
      return;
    }

    const [legacyReviewCards, legacyLearningCards, legacyBuriedCards] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(echoeCards)
        .where(and(eq(echoeCards.queue, 2), gt(echoeCards.due, 0), lt(echoeCards.due, LEGACY_DAY_DUE_MAX)))
        .then((rows: Array<{ count: number | string | bigint }>) => Number(rows[0]?.count ?? 0)),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(echoeCards)
        .where(and(inArray(echoeCards.queue, [1, 3]), gt(echoeCards.due, 0), lt(echoeCards.due, LEGACY_SECOND_DUE_MAX)))
        .then((rows: Array<{ count: number | string | bigint }>) => Number(rows[0]?.count ?? 0)),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(echoeCards)
        .where(
          and(
            inArray(echoeCards.queue, [-2, -3]),
            gt(echoeCards.due, 0),
            lt(echoeCards.due, LEGACY_SECOND_DUE_MAX)
          )
        )
        .then((rows: Array<{ count: number | string | bigint }>) => Number(rows[0]?.count ?? 0)),
    ]);

    const [legacyRevlogReviewPreDue, legacyRevlogLearningPreDue] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(echoeRevlog)
        .where(and(eq(echoeRevlog.preQueue, 2), gt(echoeRevlog.preDue, 0), lt(echoeRevlog.preDue, LEGACY_DAY_DUE_MAX)))
        .then((rows: Array<{ count: number | string | bigint }>) => Number(rows[0]?.count ?? 0)),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(echoeRevlog)
        .where(
          and(
            inArray(echoeRevlog.preQueue, [1, 3]),
            gt(echoeRevlog.preDue, 0),
            lt(echoeRevlog.preDue, LEGACY_SECOND_DUE_MAX)
          )
        )
        .then((rows: Array<{ count: number | string | bigint }>) => Number(rows[0]?.count ?? 0)),
    ]);

    if (legacyReviewCards > 0) {
      await db
        .update(echoeCards)
        .set({ due: sql`${echoeCards.due} * ${DAY_MS}` })
        .where(and(eq(echoeCards.queue, 2), gt(echoeCards.due, 0), lt(echoeCards.due, LEGACY_DAY_DUE_MAX)));
    }

    if (legacyLearningCards > 0) {
      await db
        .update(echoeCards)
        .set({ due: sql`${echoeCards.due} * ${SECOND_MS}` })
        .where(and(inArray(echoeCards.queue, [1, 3]), gt(echoeCards.due, 0), lt(echoeCards.due, LEGACY_SECOND_DUE_MAX)));
    }

    if (legacyBuriedCards > 0) {
      await db
        .update(echoeCards)
        .set({
          due: sql`CASE
            WHEN ${echoeCards.type} = 2 AND ${echoeCards.due} < ${LEGACY_DAY_DUE_MAX} THEN ${echoeCards.due} * ${DAY_MS}
            WHEN ${echoeCards.type} IN (1, 3) THEN ${echoeCards.due} * ${SECOND_MS}
            ELSE ${echoeCards.due}
          END`,
        })
        .where(
          and(
            inArray(echoeCards.queue, [-2, -3]),
            gt(echoeCards.due, 0),
            lt(echoeCards.due, LEGACY_SECOND_DUE_MAX),
            or(eq(echoeCards.type, 2), inArray(echoeCards.type, [1, 3]))
          )
        );
    }

    if (legacyRevlogReviewPreDue > 0) {
      await db
        .update(echoeRevlog)
        .set({ preDue: sql`${echoeRevlog.preDue} * ${DAY_MS}` })
        .where(and(eq(echoeRevlog.preQueue, 2), gt(echoeRevlog.preDue, 0), lt(echoeRevlog.preDue, LEGACY_DAY_DUE_MAX)));
    }

    if (legacyRevlogLearningPreDue > 0) {
      await db
        .update(echoeRevlog)
        .set({ preDue: sql`${echoeRevlog.preDue} * ${SECOND_MS}` })
        .where(
          and(
            inArray(echoeRevlog.preQueue, [1, 3]),
            gt(echoeRevlog.preDue, 0),
            lt(echoeRevlog.preDue, LEGACY_SECOND_DUE_MAX)
          )
        );
    }

    const markerValue = JSON.stringify({
      repairedAt: Date.now(),
      legacyReviewCards,
      legacyLearningCards,
      legacyBuriedCards,
      legacyRevlogReviewPreDue,
      legacyRevlogLearningPreDue,
    });

    await db
      .insert(echoeConfig)
      .values({ uid: SEED_UID, key: DUE_MS_REPAIR_KEY, value: markerValue })
      .onDuplicateKeyUpdate({ set: { value: markerValue } });

    logger.info('Legacy due timestamp repair completed', {
      legacyReviewCards,
      legacyLearningCards,
      legacyBuriedCards,
      legacyRevlogReviewPreDue,
      legacyRevlogLearningPreDue,
    });
  }
}
