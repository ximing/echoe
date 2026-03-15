import 'reflect-metadata';

import JSZip from 'jszip';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../services/echoe-media.service.js', () => ({
  EchoeMediaService: class EchoeMediaServiceMock {},
}));

jest.mock('better-sqlite3', () => {
  class MockSqliteDatabase {
    private tables: Record<string, Array<Record<string, unknown>>>;

    constructor(source: Buffer | string) {
      if (Buffer.isBuffer(source)) {
        const payload = JSON.parse(source.toString('utf8')) as {
          tables?: Record<string, Array<Record<string, unknown>>>;
        };
        this.tables = payload.tables ?? {};
        return;
      }

      this.tables = {};
    }

    exec(sql: string) {
      const tablePattern = /create\s+table\s+([a-z_]+)/gi;
      let match: RegExpExecArray | null;
      while ((match = tablePattern.exec(sql)) !== null) {
        const tableName = match[1];
        if (!this.tables[tableName]) {
          this.tables[tableName] = [];
        }
      }
    }

    prepare(sql: string) {
      const insertMatch = sql.match(/insert\s+into\s+([a-z_]+)\s*\(([^)]+)\)/i);
      if (insertMatch) {
        const tableName = insertMatch[1];
        const columns = insertMatch[2].split(',').map((column) => column.trim());

        return {
          run: (...values: unknown[]) => {
            if (!this.tables[tableName]) {
              this.tables[tableName] = [];
            }

            const row: Record<string, unknown> = {};
            columns.forEach((column, index) => {
              row[column] = values[index];
            });
            this.tables[tableName].push(row);
            return { changes: 1 };
          },
          get: () => undefined,
          all: () => [],
        };
      }

      const updateMatch = sql.match(/update\s+([a-z_]+)\s+set\s+([\s\S]+?)\s+where/i);
      if (updateMatch) {
        const tableName = updateMatch[1];
        const setColumns = updateMatch[2]
          .split(',')
          .map((segment) => segment.trim().split('=')[0].trim());

        return {
          run: (...values: unknown[]) => {
            if (!this.tables[tableName]) {
              this.tables[tableName] = [];
            }

            const whereId = values[values.length - 1];
            const row =
              this.tables[tableName].find((item) => item.id === whereId) ||
              (() => {
                const newRow: Record<string, unknown> = { id: whereId };
                this.tables[tableName].push(newRow);
                return newRow;
              })();

            setColumns.forEach((column, index) => {
              row[column] = values[index];
            });

            return { changes: 1 };
          },
          get: () => undefined,
          all: () => [],
        };
      }

      return {
        run: () => ({ changes: 0 }),
        get: () => undefined,
        all: () => [],
      };
    }

    export() {
      return Buffer.from(
        JSON.stringify({
          tables: this.tables,
        }),
        'utf8'
      );
    }

    close() {
      // no-op in tests
    }
  }

  return {
    __esModule: true,
    default: MockSqliteDatabase,
  };
});

import { getDatabase } from '../db/connection.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeMedia } from '../db/schema/echoe-media.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';
import { EchoeExportService } from '../services/echoe-export.service.js';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;

type ExportFixtureData = {
  decks: Array<Record<string, unknown>>;
  notetypes: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  cards: Array<Record<string, unknown>>;
  revlogs: Array<Record<string, unknown>>;
};

type ExportedCollection = {
  tables: Record<string, Array<Record<string, unknown>>>;
};

function createExportFixtureData(): ExportFixtureData {
  return {
    decks: [
      {
        id: 4001,
        deckId: 'ed_deck_1',
        name: 'Deck One',
        conf: 'edc_conf_1',
        extendNew: 20,
        extendRev: 200,
        usn: 0,
        lim: 0,
        collapsed: 0,
        dyn: 0,
        mod: 1710000000,
        desc: '',
        mid: 'ent_note_type_1',
      },
    ],
    notetypes: [
      {
        id: 1001,
        noteTypeId: 'ent_note_type_1',
        uid: 'user-1',
        name: 'Basic',
        mod: 1710000000,
        usn: 0,
        sortf: 0,
        did: 'ed_deck_1',
        tmpls: '[]',
        flds: '[]',
        css: '',
        type: 0,
        latexPre: '',
        latexPost: '',
        req: '[]',
      },
    ],
    notes: [
      {
        id: 2001,
        noteId: 'en_note_1',
        uid: 'user-1',
        guid: 'guid-note-1',
        mid: 'ent_note_type_1',
        mod: 1710000000,
        usn: 0,
        tags: '[]',
        flds: 'Front\x1fBack',
        sfld: 'Front',
        csum: '123456',
        flags: 0,
        data: '{}',
      },
    ],
    cards: [
      {
        id: 3001,
        cardId: 'ec_card_1',
        uid: 'user-1',
        nid: 'en_note_1',
        did: 'ed_deck_1',
        ord: 0,
        mod: 1710000000,
        usn: 0,
        type: 2,
        queue: 2,
        due: 20,
        ivl: 20,
        factor: 2500,
        reps: 5,
        lapses: 0,
        left: 0,
        odue: 5,
        odid: 'ed_deck_1',
        flags: 0,
        data: '{}',
      },
    ],
    revlogs: [
      {
        id: 1710000001000,
        revlogId: 'erl_revlog_1',
        uid: 'user-1',
        cid: 'ec_card_1',
        usn: 0,
        ease: 3,
        ivl: 20,
        lastIvl: 10,
        factor: 2500,
        time: 1200,
        type: 1,
      },
    ],
  };
}

function createExportDbMock(data: ExportFixtureData): unknown {
  return {
    select: jest.fn().mockImplementation((projection?: Record<string, unknown>) => ({
      from: jest.fn().mockImplementation((table: unknown) => ({
        where: jest.fn().mockImplementation(() => {
          if (table === echoeDecks) {
            return data.decks;
          }

          if (table === echoeNotes) {
            return data.notes;
          }

          if (table === echoeNotetypes) {
            return data.notetypes;
          }

          if (table === echoeRevlog) {
            return data.revlogs;
          }

          if (table === echoeMedia) {
            return [];
          }

          if (table === echoeCards) {
            if (projection && Object.prototype.hasOwnProperty.call(projection, 'nid')) {
              return data.cards.map((card) => ({ nid: card.nid }));
            }

            if (projection && Object.prototype.hasOwnProperty.call(projection, 'cardId')) {
              return data.cards.map((card) => ({ cardId: card.cardId }));
            }

            return data.cards;
          }

          return [];
        }),
        limit: jest.fn().mockImplementation((limit: number) => data.decks.slice(0, limit)),
      })),
    })),
  };
}

async function readCollectionFromApkg(buffer: Buffer): Promise<ExportedCollection> {
  const zip = await JSZip.loadAsync(buffer);
  const collectionFile = zip.file('collection.anki21') || zip.file('collection.anki2');
  if (!collectionFile) {
    throw new Error('Expected collection.anki21 in export result');
  }

  const collectionBuffer = await collectionFile.async('nodebuffer');
  return JSON.parse(collectionBuffer.toString('utf8')) as ExportedCollection;
}

describe('EchoeExportService - ID mapping integrity', () => {
  let service: EchoeExportService;

  beforeEach(() => {
    mockedGetDatabase.mockReset();
    service = new EchoeExportService({
      getMedia: jest.fn().mockResolvedValue(null),
    } as any);
  });

  it('should keep standard export model/deck/note/card/revlog IDs consistent', async () => {
    const fixture = createExportFixtureData();
    mockedGetDatabase.mockReturnValue(createExportDbMock(fixture) as any);

    const exportResult = await service.exportApkg('user-1', {
      includeScheduling: true,
      format: 'anki',
    });

    const zip = await JSZip.loadAsync(exportResult.buffer);
    const colJsonFile = zip.file('col.json');
    expect(colJsonFile).toBeDefined();

    const colJson = JSON.parse(await colJsonFile!.async('string')) as {
      models: Record<string, { id: number; did: number | null }>;
      decks: Record<string, { id: number }>;
    };

    const collection = await readCollectionFromApkg(exportResult.buffer);

    const noteRow = collection.tables.notes[0] as { id: number; mid: number };
    const cardRow = collection.tables.cards[0] as { id: number; nid: number; did: number; odid: number };
    const revlogRow = collection.tables.revlog[0] as { cid: number };

    const models = colJson.models;
    const decks = colJson.decks;

    expect(models['1001']).toBeDefined();
    expect(models['1001'].id).toBe(1001);
    expect(models['1001'].did).toBe(4001);
    expect(typeof models['1001'].did).toBe('number');

    expect(decks['4001']).toBeDefined();
    expect(decks['4001'].id).toBe(4001);

    expect(noteRow.id).toBe(2001);
    expect(noteRow.mid).toBe(1001);
    expect(typeof noteRow.mid).toBe('number');

    expect(cardRow.id).toBe(3001);
    expect(cardRow.nid).toBe(noteRow.id);
    expect(cardRow.did).toBe(4001);
    expect(cardRow.odid).toBe(4001);
    expect(typeof cardRow.nid).toBe('number');
    expect(typeof cardRow.did).toBe('number');
    expect(typeof cardRow.odid).toBe('number');

    expect(revlogRow.cid).toBe(cardRow.id);
    expect(typeof revlogRow.cid).toBe('number');
  });

  it('should keep legacy export integer references closed across tables', async () => {
    const fixture = createExportFixtureData();
    mockedGetDatabase.mockReturnValue(createExportDbMock(fixture) as any);

    const exportResult = await service.exportApkg('user-1', {
      includeScheduling: true,
      format: 'legacy',
    });

    const collection = await readCollectionFromApkg(exportResult.buffer);

    const notetypeRow = collection.tables.notetypes[0] as { id: number; did: number };
    const deckRow = collection.tables.decks[0] as { id: number; conf: number; mid: number };
    const noteRow = collection.tables.notes[0] as { id: number; mid: number };
    const cardRow = collection.tables.cards[0] as { id: number; nid: number; did: number; odid: number };
    const revlogRow = collection.tables.revlog[0] as { cid: number };

    expect(notetypeRow.id).toBe(1001);
    expect(notetypeRow.did).toBe(deckRow.id);
    expect(typeof notetypeRow.did).toBe('number');

    expect(deckRow.id).toBe(4001);
    expect(deckRow.conf).toBe(1);
    expect(deckRow.mid).toBe(notetypeRow.id);
    expect(typeof deckRow.conf).toBe('number');
    expect(typeof deckRow.mid).toBe('number');

    expect(noteRow.id).toBe(2001);
    expect(noteRow.mid).toBe(notetypeRow.id);
    expect(typeof noteRow.mid).toBe('number');

    expect(cardRow.id).toBe(3001);
    expect(cardRow.nid).toBe(noteRow.id);
    expect(cardRow.did).toBe(deckRow.id);
    expect(cardRow.odid).toBe(deckRow.id);
    expect(typeof cardRow.nid).toBe('number');
    expect(typeof cardRow.did).toBe('number');
    expect(typeof cardRow.odid).toBe('number');

    expect(revlogRow.cid).toBe(cardRow.id);
    expect(typeof revlogRow.cid).toBe('number');
  });
});
