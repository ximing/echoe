import 'reflect-metadata';

jest.mock('../db/connection.js', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../services/echoe-media.service.js', () => ({
  EchoeMediaService: class EchoeMediaServiceMock {},
}));

import { EchoeImportService } from '../services/echoe-import.service.js';

describe('EchoeImportService - FSRS difficulty backfill', () => {
  let service: EchoeImportService;

  beforeEach(() => {
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
