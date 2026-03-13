import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

import { EchoeDeckService } from '../services/echoe-deck.service.js';

import type { EchoeDeckWithCountsDto } from '@echoe/dto';

describe('EchoeDeckService - averageRetrievability aggregation', () => {
  let service: EchoeDeckService;

  beforeEach(() => {
    service = new EchoeDeckService();
  });

  const createDeck = (overrides: Partial<EchoeDeckWithCountsDto>): EchoeDeckWithCountsDto => ({
    id: 1,
    name: 'Deck',
    conf: 1,
    extendNew: 0,
    extendRev: 0,
    collapsed: false,
    dyn: 0,
    desc: '',
    mid: 0,
    mod: 0,
    newCount: 0,
    learnCount: 0,
    reviewCount: 0,
    totalCount: 0,
    matureCount: 0,
    difficultCount: 0,
    averageRetrievability: 0,
    lastStudiedAt: null,
    children: [],
    ...overrides,
    children: overrides.children ?? [],
  });

  it('should weight parent averageRetrievability by retrievability-eligible cards', () => {
    const parent = createDeck({
      id: 1,
      name: 'Parent',
      totalCount: 10,
      averageRetrievability: 0.9,
      lastStudiedAt: 100,
    });
    const child = createDeck({
      id: 2,
      name: 'Parent::Child',
      totalCount: 10,
      averageRetrievability: 0.5,
      lastStudiedAt: 200,
    });

    const result = (service as any).buildDeckHierarchy(
      [parent, child],
      new Map<number, number>([
        [1, 2],
        [2, 10],
      ])
    ) as EchoeDeckWithCountsDto[];

    expect(result).toHaveLength(1);
    expect(result[0].totalCount).toBe(20);
    expect(result[0].averageRetrievability).toBeCloseTo((0.9 * 2 + 0.5 * 10) / 12, 8);
    expect(result[0].lastStudiedAt).toBe(200);
  });

  it('should keep averageRetrievability at 0 when subtree has no eligible cards', () => {
    const parent = createDeck({
      id: 1,
      name: 'Parent',
      totalCount: 5,
      averageRetrievability: 0.7,
    });
    const child = createDeck({
      id: 2,
      name: 'Parent::Child',
      totalCount: 6,
      averageRetrievability: 0.4,
    });

    const result = (service as any).buildDeckHierarchy(
      [parent, child],
      new Map<number, number>([
        [1, 0],
        [2, 0],
      ])
    ) as EchoeDeckWithCountsDto[];

    expect(result).toHaveLength(1);
    expect(result[0].totalCount).toBe(11);
    expect(result[0].averageRetrievability).toBe(0);
  });
});
