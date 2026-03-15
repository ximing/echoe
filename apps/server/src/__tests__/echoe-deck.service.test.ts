import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../db/transaction.js', () => ({
  withTransaction: jest.fn((cb: (tx: any) => Promise<any>) => cb({ insert: jest.fn(), delete: jest.fn() })),
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
    const txDeleteCalls: number[] = [];

    mockedWithTransaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      let callOrder = 0;
      const tx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation((v: any) => {
            txInsertValues.push(v);
            return Promise.resolve();
          }),
        }),
        delete: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => {
            txDeleteCalls.push(++callOrder);
            return Promise.resolve();
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

    // 1 delete call (deck itself)
    expect(txDeleteCalls).toHaveLength(1);
  });
});
