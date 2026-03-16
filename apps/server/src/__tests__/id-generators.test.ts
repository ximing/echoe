/**
 * US-001: Unit tests for ID generators
 *
 * This test suite validates the ID generators for API tokens, inboxes, and inbox reports.
 * These generators use the centralized generateTypeId pattern with appropriate prefixes.
 */

import {
  generateApiTokenId,
  generateInboxId,
  generateInboxReportId,
  generateTypeId,
} from '../utils/id.js';
import { OBJECT_TYPE } from '../models/constant/type.js';

describe('ID Generators', () => {
  describe('generateApiTokenId', () => {
    it('should generate an API token ID with "at" prefix', () => {
      const id = generateApiTokenId();
      expect(id).toMatch(/^at/);
    });

    it('should generate unique API token IDs', () => {
      const id1 = generateApiTokenId();
      const id2 = generateApiTokenId();
      expect(id1).not.toBe(id2);
    });

    it('should use generateTypeId with API_TOKEN type', () => {
      const id = generateApiTokenId();
      const typeId = generateTypeId(OBJECT_TYPE.API_TOKEN);
      expect(id).toMatch(/^at/);
      expect(typeId).toMatch(/^at/);
    });
  });

  describe('generateInboxId', () => {
    it('should generate an inbox ID with "i" prefix', () => {
      const id = generateInboxId();
      expect(id).toMatch(/^i/);
    });

    it('should generate unique inbox IDs', () => {
      const id1 = generateInboxId();
      const id2 = generateInboxId();
      expect(id1).not.toBe(id2);
    });

    it('should use generateTypeId with INBOX type', () => {
      const id = generateInboxId();
      const typeId = generateTypeId(OBJECT_TYPE.INBOX);
      expect(id).toMatch(/^i/);
      expect(typeId).toMatch(/^i/);
    });
  });

  describe('generateInboxReportId', () => {
    it('should generate an inbox report ID with "ir" prefix', () => {
      const id = generateInboxReportId();
      expect(id).toMatch(/^ir/);
    });

    it('should generate unique inbox report IDs', () => {
      const id1 = generateInboxReportId();
      const id2 = generateInboxReportId();
      expect(id1).not.toBe(id2);
    });

    it('should use generateTypeId with INBOX_REPORT type', () => {
      const id = generateInboxReportId();
      const typeId = generateTypeId(OBJECT_TYPE.INBOX_REPORT);
      expect(id).toMatch(/^ir/);
      expect(typeId).toMatch(/^ir/);
    });
  });

  describe('generateTypeId', () => {
    it('should handle API_TOKEN type', () => {
      const id = generateTypeId(OBJECT_TYPE.API_TOKEN);
      expect(id).toMatch(/^at/);
    });

    it('should handle INBOX_REPORT type', () => {
      const id = generateTypeId(OBJECT_TYPE.INBOX_REPORT);
      expect(id).toMatch(/^ir/);
    });

    it('should throw error for invalid type', () => {
      expect(() => {
        generateTypeId('INVALID_TYPE' as any);
      }).toThrow('Invalid type: INVALID_TYPE');
    });
  });

  describe('OBJECT_TYPE constants', () => {
    it('should have API_TOKEN constant', () => {
      expect(OBJECT_TYPE.API_TOKEN).toBe('API_TOKEN');
    });

    it('should have INBOX_REPORT constant', () => {
      expect(OBJECT_TYPE.INBOX_REPORT).toBe('INBOX_REPORT');
    });

    it('should have INBOX constant', () => {
      expect(OBJECT_TYPE.INBOX).toBe('INBOX');
    });
  });
});
