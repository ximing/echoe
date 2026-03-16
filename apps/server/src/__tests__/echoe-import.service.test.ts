import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../services/echoe-media.service.js', () => ({
  EchoeMediaService: class EchoeMediaServiceMock {},
}));

type MockSourceRow = Record<string, unknown>;
type MockCollectionPayload = {
  tables: Record<string, MockSourceRow[]>;
  colRow?: { models?: string; decks?: string };
};

class MockSqliteDatabase {
  private payload: MockCollectionPayload;

  constructor(source: Buffer | string) {
    if (Buffer.isBuffer(source)) {
      this.payload = JSON.parse(source.toString('utf8')) as MockCollectionPayload;
      return;
    }

    this.payload = { tables: {} };
  }

  prepare(sql: string) {
    const normalized = sql.trim().toLowerCase();

    return {
      all: () => {
        if (normalized.includes('from sqlite_master')) {
          return Object.keys(this.payload.tables).map((name) => ({ name }));
        }

        if (normalized.includes('from revlog') && normalized.includes('order by id desc')) {
          const rows = this.payload.tables.revlog || [];
          return [...rows].sort((a, b) => Number(b.id) - Number(a.id));
        }

        if (normalized.includes('select id, flds from notetypes')) {
          const rows = this.payload.tables.notetypes || [];
          return rows.map((row) => ({ id: row.id, flds: row.flds }));
        }

        const table = normalized.match(/from\s+([a-z_]+)/)?.[1];
        if (!table) {
          return [];
        }

        return this.payload.tables[table] || [];
      },
      get: () => {
        if (normalized.includes('select models, decks from col')) {
          return this.payload.colRow;
        }

        return undefined;
      },
    };
  }

  close() {
    // no-op in test mock
  }
}

jest.mock('better-sqlite3', () => ({
  __esModule: true,
  default: MockSqliteDatabase,
}));

import JSZip from 'jszip';
import { EchoeImportService } from '../services/echoe-import.service.js';
import { getDatabase } from '../db/connection.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

describe('EchoeImportService - FSRS difficulty backfill', () => {
  let service: EchoeImportService;

  beforeEach(() => {
    mockedGetDatabase.mockReset();
    service = new EchoeImportService({} as any);
  });

  it('should keep revlog-derived difficulty on ts-fsrs scale without 0-1 clamp', () => {
    const now = new Date('2026-03-13T00:00:00.000Z').getTime();

    const fsrs = (service as any).resolveCardFsrsBackfill(
      {
        type: 2,
        ivl: 14,
        factor: 2500,
        mod: 1710000000,
      } as any,
      {
        id: 1741824000000,
        ivl: 30,
        factor: 2800,
      } as any,
      now
    );

    expect(fsrs.source).toBe('revlog');
    expect(fsrs.stability).toBe(30);
    expect(fsrs.difficulty).toBeCloseTo(2.8, 8);
  });

  it('should use ts-fsrs difficulty fallback for heuristic backfill when factor is missing', () => {
    const now = new Date('2026-03-13T00:00:00.000Z').getTime();

    const fsrs = (service as any).resolveCardFsrsBackfill(
      {
        type: 2,
        ivl: 20,
        factor: 0,
        mod: 1710000000,
      } as any,
      undefined,
      now
    );

    expect(fsrs.source).toBe('heuristic');
    expect(fsrs.stability).toBe(20);
    expect(fsrs.difficulty).toBe(2.5);
  });

  it('should resolve revlog difficulty without legacy 0-1 clamp', () => {
    const fallback = { difficultyFallback: 2.5 };

    expect((service as any).resolveRevlogDifficulty(0, fallback)).toBe(2.5);
    expect((service as any).resolveRevlogDifficulty(3000, fallback)).toBe(3);
  });
});

describe('EchoeImportService - tenant boundary for card-note binding', () => {
  let service: EchoeImportService;

  beforeEach(() => {
    mockedGetDatabase.mockReset();
    service = new EchoeImportService({} as any);
  });

  it('should reject binding card to note owned by another uid', async () => {
    // With the uid condition in the query, a note owned by another user will not be found
    const noteFindFirstMock = jest.fn().mockResolvedValue(undefined);

    mockedGetDatabase.mockReturnValue({
      query: {
        echoeNotes: {
          findFirst: noteFindFirstMock,
        },
      },
    } as any);

    const allowed = await (service as any).isCardNoteBindingAllowed('user-a', 'en_shared_1');

    expect(allowed).toBe(false);
    expect(noteFindFirstMock).toHaveBeenCalledTimes(1);
  });

  it('should reject binding card when note is missing', async () => {
    const noteFindFirstMock = jest.fn().mockResolvedValue(undefined);

    mockedGetDatabase.mockReturnValue({
      query: {
        echoeNotes: {
          findFirst: noteFindFirstMock,
        },
      },
    } as any);

    const allowed = await (service as any).isCardNoteBindingAllowed('user-a', 'en_missing_1');

    expect(allowed).toBe(false);
    expect(noteFindFirstMock).toHaveBeenCalledTimes(1);
  });

  it('should allow binding card when note belongs to same uid', async () => {
    const noteFindFirstMock = jest.fn().mockResolvedValue({ uid: 'user-a' });

    mockedGetDatabase.mockReturnValue({
      query: {
        echoeNotes: {
          findFirst: noteFindFirstMock,
        },
      },
    } as any);

    const allowed = await (service as any).isCardNoteBindingAllowed('user-a', 'en_owned_1');

    expect(allowed).toBe(true);
    expect(noteFindFirstMock).toHaveBeenCalledTimes(1);
  });
});

type ImportedRows = {
  notetypes: Array<Record<string, unknown>>;
  decks: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  cards: Array<Record<string, unknown>>;
  revlog: Array<Record<string, unknown>>;
};

function cloneRow<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveStore(rows: ImportedRows, table: unknown): Array<Record<string, unknown>> | undefined {
  if (table === echoeNotetypes) {
    return rows.notetypes;
  }
  if (table === echoeDecks) {
    return rows.decks;
  }
  if (table === echoeNotes) {
    return rows.notes;
  }
  if (table === echoeCards) {
    return rows.cards;
  }
  if (table === echoeRevlog) {
    return rows.revlog;
  }
  return undefined;
}

function createImportDbMock(uid: string): { db: unknown; rows: ImportedRows } {
  const rows: ImportedRows = {
    notetypes: [],
    decks: [],
    notes: [],
    cards: [],
    revlog: [],
  };

  const db = {
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockImplementation((table: unknown) => ({
        where: jest.fn().mockImplementation((condition: unknown) => ({
          limit: jest.fn().mockImplementation(() => {
            // Return inserted rows for validation queries
            const store = resolveStore(rows, table);
            if (store && store.length > 0) {
              // Return the first matching row (simplified - real DB would filter by condition)
              return Promise.resolve([store[store.length - 1]]);
            }
            return Promise.resolve([]);
          }),
        })),
      })),
    })),
    insert: jest.fn().mockImplementation((table: unknown) => ({
      values: jest.fn().mockImplementation((value: Record<string, unknown>) => {
        const store = resolveStore(rows, table);
        if (store) {
          store.push(cloneRow(value));
        }
        return {
          ignore: jest.fn().mockResolvedValue(undefined),
        };
      }),
    })),
    update: jest.fn().mockImplementation(() => ({
      set: jest.fn().mockImplementation(() => ({
        where: jest.fn().mockResolvedValue(undefined),
      })),
    })),
    query: {
      echoeNotes: {
        findFirst: jest.fn().mockResolvedValue({ uid }),
      },
    },
  };

  return { db, rows };
}

function createCollectionBuffer(payload: MockCollectionPayload): Buffer {
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

function createStandardCollectionBuffer(): Buffer {
  return createCollectionBuffer({
    tables: {
      notes: [
        {
          id: 2001,
          guid: 'std-guid-1',
          mid: 1001,
          mod: 1710000000,
          usn: -1,
          tags: '[]',
          flds: 'Front\x1fBack',
          sfld: 'Front',
          csum: 123456,
          flags: 0,
          data: '{}',
        },
      ],
      cards: [
        {
          id: 3001,
          nid: 2001,
          did: 4001,
          ord: 0,
          mod: 1710000000,
          usn: -1,
          type: 2,
          queue: 2,
          due: 10,
          ivl: 10,
          factor: 2500,
          reps: 5,
          lapses: 0,
          left: 0,
          odue: 0,
          odid: 0,
          flags: 0,
          data: '{}',
        },
      ],
      revlog: [
        {
          id: 1710000001000,
          cid: 3001,
          usn: -1,
          ease: 3,
          ivl: 10,
          lastIvl: 5,
          factor: 2500,
          time: 1200,
          type: 1,
        },
      ],
    },
  });
}

function createLegacyCollectionBuffer(): Buffer {
  return createCollectionBuffer({
    tables: {
      notetypes: [
        {
          id: 11,
          name: 'Legacy Type',
          mtime: 1710000000,
          mod: 1710000000,
          usn: -1,
          sortf: 0,
          did: 22,
          tmpls: '[]',
          flds: JSON.stringify([{ name: 'Front' }, { name: 'Back' }]),
          css: '',
          type: 0,
          latexPre: '',
          latexPost: '',
          req: '[]',
        },
      ],
      decks: [
        {
          id: 22,
          name: 'Legacy Deck',
          mtime: 1710000000,
          mod: 1710000000,
          usn: -1,
          collapsed: 0,
          dyn: 0,
          desc: '',
          conf: 1,
          extendNew: 20,
          extendRev: 200,
          did: 22,
          lim: 0,
          mid: 11,
        },
      ],
      notes: [
        {
          id: 33,
          guid: 'legacy-guid-1',
          mid: 11,
          mod: 1710000000,
          usn: -1,
          tags: '[]',
          flds: 'Front\x1fBack',
          sfld: 'Front',
          csum: 223344,
          flags: 0,
          data: '{}',
        },
      ],
      cards: [
        {
          id: 44,
          nid: 33,
          did: 22,
          ord: 0,
          mod: 1710000000,
          usn: -1,
          type: 2,
          queue: 2,
          due: 10,
          ivl: 10,
          factor: 2500,
          reps: 3,
          lapses: 0,
          left: 0,
          odue: 0,
          odid: 0,
          flags: 0,
          data: '{}',
        },
      ],
      revlog: [
        {
          id: 1710000002000,
          cid: 44,
          usn: -1,
          ease: 3,
          ivl: 10,
          lastIvl: 5,
          factor: 2500,
          time: 800,
          type: 1,
        },
      ],
    },
  });
}

function createStandardColJson(): Record<string, unknown> {
  return {
    models: {
      '1001': {
        id: 1001,
        name: 'Standard Type',
        flds: JSON.stringify([{ name: 'Front' }, { name: 'Back' }]),
        tmpls: '[]',
        css: '',
        sortf: 0,
        did: 4001,
        type: 0,
        mod: 1710000000,
        usn: -1,
        req: '[]',
      },
    },
    decks: {
      '4001': {
        id: 4001,
        name: 'Standard Deck',
        mod: 1710000000,
        usn: -1,
        collapsed: false,
        desc: '',
        dyn: 0,
        conf: 1,
      },
    },
  };
}

async function createApkgBuffer(collectionBuffer: Buffer, colJson?: Record<string, unknown>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('collection.anki2', collectionBuffer);

  if (colJson) {
    zip.file('col.json', JSON.stringify(colJson));
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('EchoeImportService - import reference integrity', () => {
  beforeEach(() => {
    mockedGetDatabase.mockReset();
  });

  it('should map standard import references to business IDs', async () => {
    const { db, rows } = createImportDbMock('user-standard');
    mockedGetDatabase.mockReturnValue(db as any);

    const service = new EchoeImportService({ uploadMedia: jest.fn().mockResolvedValue(undefined) } as any);
    const apkgBuffer = await createApkgBuffer(createStandardCollectionBuffer(), createStandardColJson());

    const result = await service.importApkg('user-standard', apkgBuffer);

    expect(result.errors).toEqual([]);
    expect(rows.notetypes).toHaveLength(1);
    expect(rows.decks).toHaveLength(1);
    expect(rows.notes).toHaveLength(1);
    expect(rows.cards).toHaveLength(1);
    expect(rows.revlog).toHaveLength(1);

    const notetype = rows.notetypes[0] as { noteTypeId: string };
    const deck = rows.decks[0] as { deckId: string };
    const note = rows.notes[0] as { noteId: string; mid: string };
    const card = rows.cards[0] as { cardId: string; nid: string; did: string };
    const revlog = rows.revlog[0] as { cid: string };

    expect(note.mid).toBe(notetype.noteTypeId);
    expect(note.mid).not.toBe('1001');

    expect(card.nid).toBe(note.noteId);
    expect(card.nid).not.toBe('2001');
    expect(card.did).toBe(deck.deckId);
    expect(card.did).not.toBe('4001');

    expect(revlog.cid).toBe(card.cardId);
    expect(revlog.cid).not.toBe('3001');
  });

  it('should map legacy import references without internal id writes', async () => {
    const { db, rows } = createImportDbMock('user-legacy');
    mockedGetDatabase.mockReturnValue(db as any);

    const service = new EchoeImportService({ uploadMedia: jest.fn().mockResolvedValue(undefined) } as any);
    const apkgBuffer = await createApkgBuffer(createLegacyCollectionBuffer());

    const result = await service.importApkg('user-legacy', apkgBuffer);

    expect(result.errors).toEqual([]);
    expect(rows.notetypes).toHaveLength(1);
    expect(rows.decks).toHaveLength(1);
    expect(rows.notes).toHaveLength(1);
    expect(rows.cards).toHaveLength(1);
    expect(rows.revlog).toHaveLength(1);

    const notetype = rows.notetypes[0] as { noteTypeId: string };
    const deck = rows.decks[0] as { deckId: string };
    const note = rows.notes[0] as { noteId: string; mid: string };
    const card = rows.cards[0] as { cardId: string; nid: string; did: string };
    const revlog = rows.revlog[0] as { cid: string };

    expect(Object.prototype.hasOwnProperty.call(notetype, 'id')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(deck, 'id')).toBe(false);

    expect(note.mid).toBe(notetype.noteTypeId);
    expect(note.mid).not.toBe('11');

    expect(card.nid).toBe(note.noteId);
    expect(card.nid).not.toBe('33');
    expect(card.did).toBe(deck.deckId);
    expect(card.did).not.toBe('22');

    expect(revlog.cid).toBe(card.cardId);
    expect(revlog.cid).not.toBe('44');
  });
});
