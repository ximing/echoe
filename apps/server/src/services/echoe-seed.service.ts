import { Service } from 'typedi';
import { eq, sql } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { echoeCol, echoeDecks, echoeDeckConfig, echoeNotetypes, echoeTemplates } from '../db/schema/index.js';
import { logger } from '../utils/logger.js';

const DEFAULT_DECK_ID = 1;
const DEFAULT_DECK_CONFIG_ID = 1;

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
   */
  async seedIfNeeded(): Promise<void> {
    const db = getDatabase();

    // Check if collection already exists
    const existingCol = await db.select().from(echoeCol).limit(1);
    if (existingCol.length > 0) {
      logger.info('Echoe collection already exists, skipping seed');
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
  }
}
