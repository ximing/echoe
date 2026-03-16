import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../db/transaction.js', () => ({
  withTransaction: jest.fn((cb: (tx: any) => Promise<any>) => cb({ insert: jest.fn(), delete: jest.fn(), update: jest.fn() })),
}));

import { getDatabase } from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { EchoeDeckService } from '../services/echoe-deck.service.js';

import type { EchoeDeckWithCountsDto } from '@echoe/dto';

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>;
const mockedWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

describe('EchoeDeckService - averageRetrievability aggregation', () => {
  let service: EchoeDeckService;

  beforeEach(() => {
    service = new EchoeDeckService();
  });

  const createDeck = (overrides: Partial<EchoeDeckWithCountsDto>): EchoeDeckWithCountsDto => {
    const id = overrides.id ?? overrides.deckId ?? 'ed_test_deck_001';
    return {
      deckId: id,
      id,
      name: 'Deck',
      conf: 'edc_test_config_001',
      extendNew: 0,
      extendRev: 0,
      collapsed: false,
      dyn: 0,
      desc: '',
      mid: '',
      mod: 0,
      newCount: 0,
      learnCount: 0,
      reviewCount: 0,
      totalCount: 0,
      matureCount: 0,
      difficultCount: 0,
      averageRetrievability: 0,
      lastStudiedAt: null,
      ...overrides,
      children: overrides.children ?? [],
    };
  };

  it('should weight parent averageRetrievability by retrievability-eligible cards', () => {
    const parent = createDeck({
      id: 'ed_parent',
      name: 'Parent',
      totalCount: 10,
      averageRetrievability: 0.9,
      lastStudiedAt: 100,
    });
    const child = createDeck({
      id: 'ed_child',
      name: 'Parent::Child',
      totalCount: 10,
      averageRetrievability: 0.5,
      lastStudiedAt: 200,
    });

    const result = (service as any).buildDeckHierarchy(
      [parent, child],
      new Map<string, number>([
        ['ed_parent', 2],
        ['ed_child', 10],
      ])
    ) as EchoeDeckWithCountsDto[];

    expect(result).toHaveLength(1);
    expect(result[0].totalCount).toBe(20);
    expect(result[0].averageRetrievability).toBeCloseTo((0.9 * 2 + 0.5 * 10) / 12, 8);
    expect(result[0].lastStudiedAt).toBe(200);
  });

  it('should keep averageRetrievability at 0 when subtree has no eligible cards', () => {
    const parent = createDeck({
      id: 'ed_parent',
      name: 'Parent',
      totalCount: 5,
      averageRetrievability: 0.7,
    });
    const child = createDeck({
      id: 'ed_child',
      name: 'Parent::Child',
      totalCount: 6,
      averageRetrievability: 0.4,
    });

    const result = (service as any).buildDeckHierarchy(
      [parent, child],
      new Map<string, number>([
        ['ed_parent', 0],
        ['ed_child', 0],
      ])
    ) as EchoeDeckWithCountsDto[];

    expect(result).toHaveLength(1);
    expect(result[0].totalCount).toBe(11);
    expect(result[0].averageRetrievability).toBe(0);
  });
});

describe('EchoeDeckService.deleteDeck - transaction protection', () => {
  beforeEach(() => {
    mockedGetDatabase.mockReset();
    mockedWithTransaction.mockReset();
    // Default: execute callback immediately (simulates successful transaction)
    mockedWithTransaction.mockImplementation((cb: (tx: any) => Promise<any>) => {
      const tx = {
        insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
        delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
        update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) }),
      };
      return cb(tx);
    });
  });

  /**
   * Builds the DB mock for deleteDeck:
   *  - select call 1: deck existence check (.limit(1))
   *  - select call 2 (optional): card fetch for deleteCards path (.where())
   *  - select call 3 (optional): getDeckAndSubdeckIds → deck name fetch (.limit(1)) + sub-deck fetch (.where())
   */
  const buildDeleteDeckDbMock = (deckRows: any[]) => {
    const limitMock = jest.fn().mockResolvedValue(deckRows);
    const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    const selectMock = jest.fn().mockReturnValue({ from: fromMock });
    mockedGetDatabase.mockReturnValue({ select: selectMock } as any);
    return { selectMock, limitMock };
  };

  it('should return false without entering transaction when deck does not exist', async () => {
    buildDeleteDeckDbMock([]);

    const svc = new EchoeDeckService();
    const result = await svc.deleteDeck('uid-d', 'ed_nonexistent');

    expect(result).toBe(false);
    expect(mockedWithTransaction).not.toHaveBeenCalled();
  });

  it('should call withTransaction when deck exists (deleteCards=false)', async () => {
    buildDeleteDeckDbMock([{ id: 'ed_test', name: 'TestDeck' }]);

    const svc = new EchoeDeckService();
    const result = await svc.deleteDeck('uid-d', 'ed_test', false);

    expect(result).toBe(true);
    expect(mockedWithTransaction).toHaveBeenCalledTimes(1);
  });

  it('should roll back all DB mutations when an error occurs inside the transaction', async () => {
    buildDeleteDeckDbMock([{ id: 'ed_test', name: 'TestDeck' }]);

    // Simulate transaction failure
    mockedWithTransaction.mockRejectedValue(new Error('TX failure'));

    const svc = new EchoeDeckService();
    await expect(svc.deleteDeck('uid-d', 'ed_test')).rejects.toThrow('TX failure');
  });

  it('should insert deck grave and delete deck inside transaction (deleteCards=false)', async () => {
    buildDeleteDeckDbMock([{ id: 'ed_mydeck', name: 'MyDeck' }]);

    const txInsertValues: any[] = [];
    const txUpdateCalls: number[] = [];

    mockedWithTransaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      let callOrder = 0;
      const tx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation((v: any) => {
            txInsertValues.push(v);
            return Promise.resolve();
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation(() => {
              txUpdateCalls.push(++callOrder);
              return Promise.resolve();
            }),
          }),
        }),
      };
      return cb(tx);
    });

    const svc = new EchoeDeckService();
    await svc.deleteDeck('uid-d', 'ed_mydeck', false);

    // 1 grave insert (type=0 for deck)
    expect(txInsertValues).toHaveLength(1);
    expect(txInsertValues[0].type).toBe(0);
    expect(txInsertValues[0].oid).toBe('ed_mydeck');

    // 2 update calls: 1 for templates.did=null + 1 for soft delete deck itself
    expect(txUpdateCalls).toHaveLength(2);
  });

  it('should set templates.did to null before deleting deck (deleteCards=false)', async () => {
    buildDeleteDeckDbMock([{ id: 'ed_mydeck', name: 'MyDeck' }]);

    const txUpdateCalls: { table: string; setData: any; whereConditions: any }[] = [];

    mockedWithTransaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
        update: jest.fn().mockImplementation((table: any) => {
          return {
            set: jest.fn().mockImplementation((data: any) => {
              return {
                where: jest.fn().mockImplementation((conditions: any) => {
                  txUpdateCalls.push({ table: table.name || 'unknown', setData: data, whereConditions: conditions });
                  return Promise.resolve();
                }),
              };
            }),
          };
        }),
      };
      return cb(tx);
    });

    const svc = new EchoeDeckService();
    await svc.deleteDeck('uid-d', 'ed_mydeck', false);

    // Should have 2 update calls: 1 for templates.did = null, 1 for soft delete deck
    expect(txUpdateCalls).toHaveLength(2);
    expect(txUpdateCalls[0].setData).toEqual({ did: null });
    expect(txUpdateCalls[1].setData).toHaveProperty('deletedAt');
  });

  it('should set templates.did to null for both main deck and child decks (deleteCards=true)', async () => {
    // Mock deck existence check
    buildDeleteDeckDbMock([{ id: 'ed_parent', name: 'Parent' }]);

    // Mock getDeckAndSubdeckIds to return parent and 2 children
    const svc = new EchoeDeckService();
    jest.spyOn(svc as any, 'getDeckAndSubdeckIds').mockResolvedValue(['ed_parent', 'ed_child1', 'ed_child2']);

    const txUpdateCalls: { table: string; setData: any; whereConditions: any }[] = [];

    mockedWithTransaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
        update: jest.fn().mockImplementation((table: any) => {
          return {
            set: jest.fn().mockImplementation((data: any) => {
              return {
                where: jest.fn().mockImplementation((conditions: any) => {
                  txUpdateCalls.push({ table: table.name || 'unknown', setData: data, whereConditions: conditions });
                  return Promise.resolve();
                }),
              };
            }),
          };
        }),
      };
      return cb(tx);
    });

    // Mock the cards fetch to return empty array
    const db = mockedGetDatabase();
    const originalSelect = db.select;
    mockedGetDatabase.mockReturnValue({
      ...db,
      select: jest.fn().mockImplementation((fields?: any) => {
        // For card fetch (has nid field)
        if (fields && fields.nid) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
          };
        }
        // For other queries, use original mock
        return originalSelect.call(db, fields);
      }),
    } as any);

    await svc.deleteDeck('uid-d', 'ed_parent', true);

    // Should have 4 update calls:
    // 1. Set templates.did = null for child decks (ed_child1, ed_child2)
    // 2. Soft delete sub-decks
    // 3. Set templates.did = null for main deck (ed_parent)
    // 4. Soft delete main deck
    expect(txUpdateCalls).toHaveLength(4);
    const setNullCalls = txUpdateCalls.filter(c => c.setData.did === null);
    const softDeleteCalls = txUpdateCalls.filter(c => c.setData.deletedAt !== undefined);
    expect(setNullCalls).toHaveLength(2);
    expect(softDeleteCalls).toHaveLength(2);
  });

  it('should delete revlogs before deleting cards when deleteCards=true (FR-3)', async () => {
    // Mock deck existence check
    buildDeleteDeckDbMock([{ id: 'ed_deck', name: 'TestDeck' }]);

    // Mock getDeckAndSubdeckIds to return single deck
    const svc = new EchoeDeckService();
    jest.spyOn(svc as any, 'getDeckAndSubdeckIds').mockResolvedValue(['ed_deck']);

    // Track all transaction update operations (soft deletes) in order
    const txUpdateTables: any[] = [];

    mockedWithTransaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
        update: jest.fn().mockImplementation((table: any) => {
          // Capture the table object being updated (soft deleted)
          txUpdateTables.push(table);
          return {
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(undefined),
            }),
          };
        }),
      };
      return cb(tx);
    });

    // Import table schemas to compare against
    const { echoeRevlog } = await import('../db/schema/echoe-revlog.js');
    const { echoeCards } = await import('../db/schema/echoe-cards.js');

    // Mock the cards fetch to return cards with cardIds
    const db = mockedGetDatabase();
    const originalSelect = db.select;
    mockedGetDatabase.mockReturnValue({
      ...db,
      select: jest.fn().mockImplementation((fields?: any) => {
        // For card fetch (has nid and cardId fields)
        if (fields && fields.nid && fields.cardId) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([
                { nid: 'en_note1', cardId: 'ec_card1' },
                { nid: 'en_note1', cardId: 'ec_card2' },
              ]),
            }),
          };
        }
        // For other queries, use original mock
        return originalSelect.call(db, fields);
      }),
    } as any);

    await svc.deleteDeck('uid-d', 'ed_deck', true);

    // Verify update (soft delete) operations occurred
    expect(txUpdateTables.length).toBeGreaterThan(0);

    // Find indices of revlog and cards soft deletes
    const revlogUpdateIndex = txUpdateTables.indexOf(echoeRevlog);
    const cardsUpdateIndex = txUpdateTables.indexOf(echoeCards);

    // Verify revlogs are soft deleted before cards (FR-3 cascade requirement)
    expect(revlogUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(cardsUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(revlogUpdateIndex).toBeLessThan(cardsUpdateIndex);
  });
});

describe('EchoeDeckService - conf validation (Issue #58)', () => {
  beforeEach(() => {
    mockedGetDatabase.mockReset();
  });

  /**
   * Helper to build DB mock for createDeck validation tests:
   * - Call 1: Parent deck check (if name contains '::')
   * - Call 2: Deck config validation
   * - Call 3: Insert new deck
   */
  const buildCreateDeckDbMock = (deckConfigRows: any[], parentDeckRows: any[] = []) => {
    let selectCallCount = 0;
    const selectMock = jest.fn().mockImplementation(() => {
      selectCallCount++;
      // First call: parent deck check
      if (selectCallCount === 1 && parentDeckRows.length > 0) {
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(parentDeckRows),
            }),
          }),
        };
      }
      // Subsequent calls: deck config validation
      return {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(deckConfigRows),
          }),
        }),
      };
    });

    const insertMock = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    mockedGetDatabase.mockReturnValue({
      select: selectMock,
      insert: insertMock,
    } as any);

    return { selectMock, insertMock };
  };

  /**
   * Helper to build DB mock for updateDeck validation tests:
   * - Call 1: Deck existence check
   * - Call 2: Deck config validation (if conf provided)
   * - Call 3: Parent deck check (if name contains '::')
   * - Call 4: Update deck
   * - Call 5+: getDeckById (complex hierarchy query)
   */
  const buildUpdateDeckDbMock = (deckRows: any[], deckConfigRows: any[] = [], parentDeckRows: any[] = []) => {
    let selectCallCount = 0;
    const selectMock = jest.fn().mockImplementation(() => {
      selectCallCount++;
      // First call: deck existence check
      if (selectCallCount === 1) {
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(deckRows),
            }),
          }),
        };
      }
      // Second call: deck config validation
      if (selectCallCount === 2 && deckConfigRows.length >= 0) {
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(deckConfigRows),
            }),
          }),
        };
      }
      // Third call: parent deck check
      if (selectCallCount === 3 && parentDeckRows.length > 0) {
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(parentDeckRows),
            }),
          }),
        };
      }
      // Subsequent calls: getDeckById query (return empty to avoid complex mocking)
      return {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      };
    });

    const updateMock = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    });

    mockedGetDatabase.mockReturnValue({
      select: selectMock,
      update: updateMock,
    } as any);

    return { selectMock, updateMock };
  };

  describe('createDeck', () => {
    it('should throw error when conf is provided but does not exist for the user', async () => {
      buildCreateDeckDbMock([]); // Empty config rows = not found

      const svc = new EchoeDeckService();
      await expect(
        svc.createDeck('uid-test', {
          name: 'TestDeck',
          conf: 'edc_nonexistent',
        })
      ).rejects.toThrow("Invalid relation: Deck config 'edc_nonexistent' not found for field 'conf' (deckConfigId)");
    });

    it('should use first available config when conf is not provided', async () => {
      const { insertMock } = buildCreateDeckDbMock([
        { deckConfigId: 'edc_default', uid: 'uid-test', name: 'Default' },
      ]);

      const svc = new EchoeDeckService();
      await svc.createDeck('uid-test', {
        name: 'TestDeck',
      });

      expect(insertMock).toHaveBeenCalledTimes(1);
      const insertedDeck = insertMock.mock.results[0].value.values.mock.calls[0][0];
      expect(insertedDeck.conf).toBe('edc_default');
    });

    it('should throw error when conf is not provided and no configs exist for the user', async () => {
      buildCreateDeckDbMock([]); // No configs available

      const svc = new EchoeDeckService();
      await expect(
        svc.createDeck('uid-test', {
          name: 'TestDeck',
        })
      ).rejects.toThrow('No deck config found for user. Please create a deck config first.');
    });

    it('should create deck when valid conf is provided', async () => {
      const { insertMock } = buildCreateDeckDbMock([
        { deckConfigId: 'edc_valid', uid: 'uid-test', name: 'Valid Config' },
      ]);

      const svc = new EchoeDeckService();
      await svc.createDeck('uid-test', {
        name: 'TestDeck',
        conf: 'edc_valid',
      });

      expect(insertMock).toHaveBeenCalledTimes(1);
      const insertedDeck = insertMock.mock.results[0].value.values.mock.calls[0][0];
      expect(insertedDeck.conf).toBe('edc_valid');
    });
  });

  describe('updateDeck', () => {
    it('should throw error when conf is provided but does not exist for the user', async () => {
      buildUpdateDeckDbMock(
        [{ deckId: 'ed_test', uid: 'uid-test', name: 'TestDeck', conf: 'edc_old' }],
        [] // Empty config rows = not found
      );

      const svc = new EchoeDeckService();
      await expect(
        svc.updateDeck('uid-test', 'ed_test', {
          conf: 'edc_nonexistent',
        })
      ).rejects.toThrow("Invalid relation: Deck config 'edc_nonexistent' not found for field 'conf' (deckConfigId)");
    });

    it('should update conf when valid conf is provided', async () => {
      const { updateMock } = buildUpdateDeckDbMock(
        [{ deckId: 'ed_test', uid: 'uid-test', name: 'TestDeck', conf: 'edc_old' }],
        [{ deckConfigId: 'edc_new', uid: 'uid-test', name: 'New Config' }]
      );

      const svc = new EchoeDeckService();
      // Mock getDeckById to return null to avoid complex query mocking
      jest.spyOn(svc, 'getDeckById').mockResolvedValue(null);

      await svc.updateDeck('uid-test', 'ed_test', {
        conf: 'edc_new',
      });

      expect(updateMock).toHaveBeenCalledTimes(1);
      const setCall = updateMock.mock.results[0].value.set.mock.calls[0][0];
      expect(setCall.conf).toBe('edc_new');
    });

    it('should not update conf when conf is not provided', async () => {
      const { updateMock } = buildUpdateDeckDbMock([
        { deckId: 'ed_test', uid: 'uid-test', name: 'TestDeck', conf: 'edc_old' },
      ]);

      const svc = new EchoeDeckService();
      // Mock getDeckById to return null to avoid complex query mocking
      jest.spyOn(svc, 'getDeckById').mockResolvedValue(null);

      await svc.updateDeck('uid-test', 'ed_test', {
        name: 'NewName',
      });

      expect(updateMock).toHaveBeenCalledTimes(1);
      const setCall = updateMock.mock.results[0].value.set.mock.calls[0][0];
      expect(setCall.conf).toBeUndefined();
      expect(setCall.name).toBe('NewName');
    });
  });
});
