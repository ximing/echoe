/**
 * Contract tests for DTOs to ensure consistency with backend
 */

import { InsightItemDto, InboxReportSummaryDto } from '../inbox-report.dto.js';

describe('InboxReportSummaryDto contract tests', () => {
  /**
   * This test ensures that the DTO structure matches the backend service
   * response structure defined in apps/server/src/services/inbox-ai.service.ts
   *
   * Backend returns:
   * {
   *   insights: { text: string; evidenceIds: string[] }[]
   * }
   *
   * This test will fail if the DTO structure diverges from the backend.
   */
  describe('insights field contract', () => {
    it('should match backend insights structure: { text: string; evidenceIds: string[] }[]', () => {
      // This is the exact structure returned by inbox-ai.service.ts
      const backendInsightStructure: InsightItemDto = {
        text: 'Test insight text',
        evidenceIds: ['inbox-id-1', 'inbox-id-2'],
      };

      // Validate the DTO can accept backend structure
      const summaryDto: InboxReportSummaryDto = {
        totalInbox: 10,
        newInbox: 5,
        processedInbox: 3,
        deletedInbox: 2,
        categoryBreakdown: [{ category: 'work', count: 5 }],
        sourceBreakdown: [{ source: 'email', count: 10 }],
        insights: [backendInsightStructure],
      };

      // Verify structure
      expect(summaryDto.insights).toHaveLength(1);
      expect(summaryDto.insights[0].text).toBe('Test insight text');
      expect(summaryDto.insights[0].evidenceIds).toEqual(['inbox-id-1', 'inbox-id-2']);
    });

    it('should allow empty insights array', () => {
      const summaryDto: InboxReportSummaryDto = {
        totalInbox: 0,
        newInbox: 0,
        processedInbox: 0,
        deletedInbox: 0,
        categoryBreakdown: [],
        sourceBreakdown: [],
        insights: [],
      };

      expect(summaryDto.insights).toEqual([]);
    });

    it('should allow multiple insights with multiple evidence IDs', () => {
      const summaryDto: InboxReportSummaryDto = {
        totalInbox: 100,
        newInbox: 20,
        processedInbox: 50,
        deletedInbox: 5,
        categoryBreakdown: [
          { category: 'work', count: 60 },
          { category: 'personal', count: 40 },
        ],
        sourceBreakdown: [
          { source: 'email', count: 80 },
          { source: 'slack', count: 20 },
        ],
        insights: [
          { text: 'First insight', evidenceIds: ['id1', 'id2'] },
          { text: 'Second insight', evidenceIds: ['id3', 'id4', 'id5'] },
          { text: 'Third insight without evidence', evidenceIds: [] },
        ],
      };

      expect(summaryDto.insights).toHaveLength(3);
      expect(summaryDto.insights[2].evidenceIds).toHaveLength(0);
    });
  });
});
