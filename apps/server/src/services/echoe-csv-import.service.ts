import { Service, Inject } from 'typedi';
import * as Papa from 'papaparse';
import * as chardet from 'chardet';
import * as iconv from 'iconv-lite';
import { EchoeNoteService } from './echoe-note.service.js';
import { logger } from '../utils/logger.js';

import type {
  CsvPreviewDto,
  CsvExecuteDto,
  CsvImportResultDto,
} from '@echoe/dto';

@Service()
export class EchoeCsvImportService {
  constructor(
    @Inject(() => EchoeNoteService)
    private noteService: EchoeNoteService
  ) {}

  /**
   * Preview CSV file - detect encoding, delimiter, and return first 5 rows
   */
  async preview(buffer: Buffer): Promise<CsvPreviewDto> {
    // Detect encoding
    const detected = chardet.detect(buffer);
    const encoding = (typeof detected === 'string' ? detected : null) || 'UTF-8';

    // Convert to string with detected encoding
    const content = iconv.decode(buffer, encoding);

    // Detect delimiter
    const delimiter = this.detectDelimiter(content);

    // Parse CSV
    const result = Papa.parse(content, {
      delimiter,
      preview: 6, // 5 rows + potentially header
      skipEmptyLines: true,
    });

    const rows = result.data as string[][];

    return {
      rows: rows.slice(0, 5),
      detectedEncoding: encoding,
      detectedDelimiter: delimiter,
      totalColumns: rows[0]?.length || 0,
      totalRows: result.data.length,
    };
  }

  /**
   * Execute CSV import
   */
  async execute(uid: string, buffer: Buffer, dto: CsvExecuteDto): Promise<CsvImportResultDto> {
    const result: CsvImportResultDto = {
      added: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    try {
      // Detect encoding and convert
      const detected = chardet.detect(buffer);
      const encoding = (typeof detected === 'string' ? detected : null) || 'UTF-8';
      const content = iconv.decode(buffer, encoding);

      // Detect delimiter
      const delimiter = this.detectDelimiter(content);

      // Parse full CSV
      const parseResult = Papa.parse(content, {
        delimiter,
        skipEmptyLines: true,
      });

      const rows = parseResult.data as string[][];

      // Determine if first row is header
      const startRow = dto.hasHeader ? 1 : 0;

      // Get field names from mapping
      const fieldMap: Record<number, string> = {};
      let tagsColumn = -1;

      for (const [colIdx, fieldName] of Object.entries(dto.columnMapping)) {
        const idx = parseInt(colIdx);
        fieldMap[idx] = fieldName;
        if (fieldName === 'Tags') tagsColumn = idx;
      }

      // Process each row
      for (let rowIdx = startRow; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];

        try {
          // Build fields object based on mapping
          const fields: Record<string, string> = {};

          for (const [colIdxRaw, fieldName] of Object.entries(fieldMap)) {
            const colIdx = Number(colIdxRaw);
            const cellValue = row[colIdx];
            if (fieldName && fieldName !== 'Ignore' && cellValue) {
              fields[fieldName] = cellValue;
            }
          }

          // Default to using all columns if mapping is incomplete
          if (Object.keys(fields).length === 0 && row.length >= 2) {
            fields['Front'] = row[0];
            fields['Back'] = row.slice(1).join(' ');
          }

          if (!fields['Front'] || !fields['Back']) {
            result.skipped++;
            continue;
          }

          // Parse tags if present
          let tags: string[] = [];
          if (tagsColumn >= 0 && row[tagsColumn]) {
            tags = row[tagsColumn]
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
          }

          // Create note via EchoeNoteService
          await this.noteService.createNote(uid, {
            notetypeId: dto.notetypeId,
            deckId: dto.deckId,
            fields,
            tags,
          });

          result.added++;
        } catch (error) {
          result.errors.push({
            row: rowIdx + 1,
            reason: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      logger.error('CSV import error:', error);
      result.errors.push({
        row: 0,
        reason: error instanceof Error ? error.message : 'Import failed',
      });
    }

    return result;
  }

  /**
   * Detect CSV delimiter (comma, tab, semicolon)
   */
  private detectDelimiter(content: string): string {
    const firstLine = content.split('\n')[0];
    const delimiters = [',', '\t', ';'];

    let maxCount = 0;
    let detected = ',';

    for (const d of delimiters) {
      const count = (firstLine.match(new RegExp(d === '\t' ? '\\t' : d, 'g')) || []).length;
      if (count > maxCount) {
        maxCount = count;
        detected = d;
      }
    }

    return detected;
  }
}
