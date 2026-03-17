import { Service } from 'typedi';
import { eq, and, gte, lte, desc, gt, lt } from 'drizzle-orm';
import dayjs from 'dayjs';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { z } from 'zod';

import { getDatabase } from '../db/connection.js';
import { inbox, type Inbox } from '../db/schema/inbox.js';
import { inboxReport, type InboxReport } from '../db/schema/inbox-report.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { InboxMetricsService } from './inbox-metrics.service.js';
import type { AiOrganizeResponseDto } from '@echoe/dto';

/**
 * Token budget configuration
 * Default: 8000 tokens (approximately 32000 characters)
 */
const DEFAULT_TOKEN_BUDGET = 8000;
const TOKENS_PER_CHARACTER = 0.25; // Approximate ratio

/**
 * L1 (7 days) retrieval limit
 */
const L1_RETRIEVAL_LIMIT = 10;

/**
 * L2 (30 days) retrieval limit
 */
const L2_RETRIEVAL_LIMIT = 30;

/**
 * Context level types
 */
export type ContextLevel = 'L0' | 'L1' | 'L2';

/**
 * Context item structure
 */
export interface ContextItem {
  level: ContextLevel;
  inboxId?: string;
  inboxReportId?: string;
  content: string;
  metadata: {
    createdAt?: Date;
    date?: string;
    category?: string;
    source?: string;
  };
  similarity?: number;
}

/**
 * Retrieved context result
 */
export interface RetrievedContext {
  l0: ContextItem | null; // Current inbox item
  l1: ContextItem[]; // Related inbox items from last 7 days
  l2: ContextItem[]; // Report summaries from last 30 days
  totalTokens: number;
  trimmed: boolean;
  trimReason?: string;
}

/**
 * AI Prompt structure following PRD
 */
export interface AiPromptInput {
  task: string;
  currentInput: {
    inboxId: string;
    front: string;
    back: string;
  };
  retrievedContext: {
    l0: ContextItem | null;
    l1: ContextItem[];
    l2: ContextItem[];
  };
  constraints: {
    maxTokens?: number;
    outputFormat?: string;
  };
}

/**
 * Build context params
 */
export interface BuildContextParams {
  uid: string;
  inboxId: string;
  tokenBudget?: number;
}

/**
 * Build prompt params
 */
export interface BuildPromptParams {
  uid: string;
  inboxId: string;
  task: string;
  outputFormat?: string;
  tokenBudget?: number;
}

@Service()
export class InboxAiService {
  constructor(private metricsService: InboxMetricsService) {}
  /**
   * Retrieve L0: Current inbox item
   */
  async getL0Context(uid: string, inboxId: string): Promise<ContextItem | null> {
    try {
      const db = getDatabase();

      const results = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.uid, uid), eq(inbox.inboxId, inboxId), eq(inbox.deletedAt, 0)))
        .limit(1);

      if (results.length === 0) {
        return null;
      }

      const item = results[0];
      return {
        level: 'L0',
        inboxId: item.inboxId,
        content: this.formatInboxContent(item),
        metadata: {
          createdAt: item.createdAt,
          category: item.category,
          source: item.source,
        },
      };
    } catch (error) {
      logger.error('Error retrieving L0 context:', error);
      throw error;
    }
  }

  /**
   * Retrieve L1: Related inbox items from last 7 days (top 10)
   * Uses recency and content similarity for retrieval
   */
  async getL1Context(uid: string, currentInboxId: string): Promise<ContextItem[]> {
    try {
      const db = getDatabase();

      // Get current inbox item for similarity comparison
      const currentItem = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.uid, uid), eq(inbox.inboxId, currentInboxId), eq(inbox.deletedAt, 0)))
        .limit(1);

      const sevenDaysAgo = dayjs().subtract(7, 'day').toDate();

      // Get items from last 7 days
      const results = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.uid, uid), eq(inbox.deletedAt, 0), gte(inbox.createdAt, sevenDaysAgo)))
        .orderBy(desc(inbox.createdAt))
        .limit(L1_RETRIEVAL_LIMIT * 2); // Get more to filter out current item

      // Calculate simple similarity based on content overlap (category + content length)
      const currentContent = currentItem.length > 0 ? `${currentItem[0].front} ${currentItem[0].back}` : '';
      const currentCategory = currentItem.length > 0 ? currentItem[0].category : '';

      // Filter out the current inbox item
      const filteredResults = results.filter((item: Inbox) => item.inboxId !== currentInboxId);

      const itemsWithSimilarity = filteredResults.slice(0, L1_RETRIEVAL_LIMIT).map((item: Inbox) => {
        const content = `${item.front} ${item.back}`;
        const similarity = this.calculateSimpleSimilarity(currentContent, content, currentCategory, item.category);
        return {
          level: 'L1' as ContextLevel,
          inboxId: item.inboxId,
          content: this.formatInboxContent(item),
          metadata: {
            createdAt: item.createdAt,
            category: item.category,
            source: item.source,
          },
          similarity,
        };
      });

      // Sort by similarity (descending), then by recency (descending)
      return itemsWithSimilarity.sort((a: ContextItem, b: ContextItem) => {
        if (b.similarity !== a.similarity) {
          return b.similarity! - a.similarity!;
        }
        return (b.metadata.createdAt?.getTime() || 0) - (a.metadata.createdAt?.getTime() || 0);
      });
    } catch (error) {
      logger.error('Error retrieving L1 context:', error);
      throw error;
    }
  }

  /**
   * Retrieve L2: Report summaries from last 30 days
   */
  async getL2Context(uid: string): Promise<ContextItem[]> {
    try {
      const db = getDatabase();

      const thirtyDaysAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const today = dayjs().format('YYYY-MM-DD');

      const results = await db
        .select()
        .from(inboxReport)
        .where(
          and(
            eq(inboxReport.uid, uid),
            eq(inboxReport.deletedAt, 0),
            gte(inboxReport.date, thirtyDaysAgo),
            lte(inboxReport.date, today)
          )
        )
        .orderBy(desc(inboxReport.date))
        .limit(L2_RETRIEVAL_LIMIT);

      return results.map((report: InboxReport) => ({
        level: 'L2' as ContextLevel,
        inboxReportId: report.inboxReportId,
        content: report.summary || report.content,
        metadata: {
          date: report.date,
        },
      }));
    } catch (error) {
      logger.error('Error retrieving L2 context:', error);
      throw error;
    }
  }

  /**
   * Build complete context with all three levels
   */
  async buildContext(params: BuildContextParams): Promise<RetrievedContext> {
    const { uid, inboxId, tokenBudget = DEFAULT_TOKEN_BUDGET } = params;

    // Get L0: Current inbox item
    const l0 = await this.getL0Context(uid, inboxId);

    // Get L1: Related inbox items from last 7 days
    const l1 = await this.getL1Context(uid, inboxId);

    // Get L2: Report summaries from last 30 days
    const l2 = await this.getL2Context(uid);

    // Calculate total tokens
    const l0Tokens = this.estimateTokens(this.contextItemToString(l0));
    const l1Tokens = this.estimateTokens(l1.map((item) => this.contextItemToString(item)).join('\n'));
    const l2Tokens = this.estimateTokens(l2.map((item) => this.contextItemToString(item)).join('\n'));
    const totalTokens = l0Tokens + l1Tokens + l2Tokens;

    // Apply trimming if exceeds budget
    let trimmedL1 = l1;
    let trimmedL2 = l2;
    let trimmed = false;
    let trimReason: string | undefined;

    if (totalTokens > tokenBudget) {
      const trimmedResult = this.trimByPriority(
        { l0, l1, l2 },
        tokenBudget
      );
      trimmedL1 = trimmedResult.l1;
      trimmedL2 = trimmedResult.l2;
      trimmed = true;
      trimReason = trimmedResult.reason;
    }

    return {
      l0,
      l1: trimmedL1,
      l2: trimmedL2,
      totalTokens: Math.min(totalTokens, tokenBudget),
      trimmed,
      trimReason,
    };
  }

  /**
   * Build AI prompt following PRD structure
   */
  async buildPrompt(params: BuildPromptParams): Promise<AiPromptInput> {
    const { uid, inboxId, task, outputFormat = 'markdown', tokenBudget = DEFAULT_TOKEN_BUDGET } = params;

    // Get current inbox item for currentInput
    const db = getDatabase();
    const currentItem = await db
      .select()
      .from(inbox)
      .where(and(eq(inbox.uid, uid), eq(inbox.inboxId, inboxId), eq(inbox.deletedAt, 0)))
      .limit(1);

    if (currentItem.length === 0) {
      throw new Error('Inbox item not found');
    }

    // Build context
    const context = await this.buildContext({ uid, inboxId, tokenBudget });

    // Build prompt input following PRD structure
    return {
      task,
      currentInput: {
        inboxId: currentItem[0].inboxId,
        front: currentItem[0].front,
        back: currentItem[0].back,
      },
      retrievedContext: {
        l0: context.l0,
        l1: context.l1,
        l2: context.l2,
      },
      constraints: {
        maxTokens: tokenBudget,
        outputFormat,
      },
    };
  }

  /**
   * Trim context by priority: similarity -> recency -> diversity
   */
  private trimByPriority(
    context: { l0: ContextItem | null; l1: ContextItem[]; l2: ContextItem[] },
    tokenBudget: number
  ): { l1: ContextItem[]; l2: ContextItem[]; reason: string } {
    let currentL1 = [...context.l1];
    let currentL2 = [...context.l2];

    // Calculate current tokens
    const calculateTokens = () => {
      const l1Tokens = this.estimateTokens(currentL1.map((item) => this.contextItemToString(item)).join('\n'));
      const l2Tokens = this.estimateTokens(currentL2.map((item) => this.contextItemToString(item)).join('\n'));
      return l1Tokens + l2Tokens;
    };

    // Step 1: Trim by similarity (remove lowest similarity items first)
    // Sort L1 by similarity ascending (lowest first)
    currentL1.sort((a, b) => (a.similarity || 0) - (b.similarity || 0));

    while (calculateTokens() > tokenBudget * 0.8 && currentL1.length > 0) {
      currentL1.shift(); // Remove lowest similarity
    }

    if (calculateTokens() <= tokenBudget) {
      return { l1: currentL1, l2: currentL2, reason: 'trimmed by similarity' };
    }

    // Step 2: Trim by recency (remove oldest items first)
    // Sort L2 by date ascending (oldest first)
    currentL2.sort((a, b) => {
      const dateA = a.metadata.date ? new Date(a.metadata.date).getTime() : 0;
      const dateB = b.metadata.date ? new Date(b.metadata.date).getTime() : 0;
      return dateA - dateB;
    });

    while (calculateTokens() > tokenBudget * 0.6 && currentL2.length > 0) {
      currentL2.shift(); // Remove oldest
    }

    if (calculateTokens() <= tokenBudget) {
      return { l1: currentL1, l2: currentL2, reason: 'trimmed by similarity and recency' };
    }

    // Step 3: Trim for diversity (keep items from different dates/categories)
    const categorySet = new Set<string>();
    const dateSet = new Set<string>();

    currentL1 = currentL1.filter((item) => {
      const key = item.metadata.category || '';
      if (categorySet.has(key)) return false;
      categorySet.add(key);
      return true;
    });

    currentL2 = currentL2.filter((item) => {
      const key = item.metadata.date || '';
      if (dateSet.has(key)) return false;
      dateSet.add(key);
      return true;
    });

    return {
      l1: currentL1,
      l2: currentL2,
      reason: 'trimmed by similarity, recency, and diversity',
    };
  }

  /**
   * Calculate simple similarity between two inbox items
   * Based on category match and content length similarity
   */
  private calculateSimpleSimilarity(
    content1: string,
    content2: string,
    category1: string | null | undefined,
    category2: string | null | undefined
  ): number {
    let score = 0;

    // Category match (weight: 0.4)
    if (category1 && category2 && category1 === category2) {
      score += 0.4;
    }

    // Content length similarity (weight: 0.3)
    const len1 = content1.length;
    const len2 = content2.length;
    const lengthDiff = Math.abs(len1 - len2);
    const maxLen = Math.max(len1, len2, 1);
    const lengthSimilarity = 1 - lengthDiff / maxLen;
    score += lengthSimilarity * 0.3;

    // Word overlap (weight: 0.3)
    const words1 = new Set(content1.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    const words2 = new Set(content2.toLowerCase().split(/\s+/).filter((w) => w.length > 2));

    if (words1.size > 0 && words2.size > 0) {
      const intersection = new Set([...words1].filter((x) => words2.has(x)));
      const union = new Set([...words1, ...words2]);
      const jaccard = intersection.size / union.size;
      score += jaccard * 0.3;
    }

    return score;
  }

  /**
   * Estimate token count from text
   * Uses rough approximation: 1 token ≈ 4 characters
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length * TOKENS_PER_CHARACTER);
  }

  /**
   * Format inbox item to string for context
   */
  private formatInboxContent(item: Inbox): string {
    const category = item.category ? `[${item.category}]` : '';
    const source = item.source ? `(${item.source})` : '';
    return `${category} ${source}\nQ: ${item.front}\nA: ${item.back}`.trim();
  }

  /**
   * Convert context item to string representation
   */
  private contextItemToString(item: ContextItem | null): string {
    if (!item) return '';
    return item.content;
  }

  /**
   * Generate daily inbox report with AI using 30-day memory and evidence
   * Implements US-016: Implement report AI pipeline with 30-day memory and evidence
   */
  async generateDailyReport(params: {
    uid: string;
    date: string; // YYYY-MM-DD
  }): Promise<{
    content: string;
    summary: {
      topics: string[];
      mistakes: string[];
      actions: string[];
      totalInbox: number;
      newInbox: number;
      processedInbox: number;
      deletedInbox: number;
      categoryBreakdown: { category: string; count: number }[];
      sourceBreakdown: { source: string; count: number }[];
      insights: { text: string; evidenceIds: string[] }[];
    };
  }> {
    const { uid, date } = params;

    try {
      const db = getDatabase();

      // Get inbox items for the target date (using createdAt)
      const targetDate = dayjs(date);
      const startOfDay = targetDate.startOf('day').toDate();
      const endOfDay = targetDate.endOf('day').toDate();

      const dailyInboxItems = await db
        .select()
        .from(inbox)
        .where(
          and(
            eq(inbox.uid, uid),
            eq(inbox.deletedAt, 0),
            gte(inbox.createdAt, startOfDay),
            lte(inbox.createdAt, endOfDay)
          )
        )
        .orderBy(desc(inbox.createdAt));

      // Get count of deleted items for the target date (separate query)
      const deletedItems = await db
        .select({ count: inbox.inboxId })
        .from(inbox)
        .where(
          and(
            eq(inbox.uid, uid),
            gt(inbox.deletedAt, 0),
            gte(inbox.createdAt, startOfDay),
            lte(inbox.createdAt, endOfDay)
          )
        );

      // Get 30-day report summaries for context (L2 context)
      const thirtyDaysAgo = targetDate.subtract(30, 'day').format('YYYY-MM-DD');
      const reportSummaries = await db
        .select()
        .from(inboxReport)
        .where(
          and(
            eq(inboxReport.uid, uid),
            eq(inboxReport.deletedAt, 0),
            gte(inboxReport.date, thirtyDaysAgo),
            lt(inboxReport.date, date) // Exclude current date
          )
        )
        .orderBy(desc(inboxReport.date))
        .limit(30);

      // Get last 7 days of summaries for repeat suggestion detection
      const sevenDaysAgo = targetDate.subtract(7, 'day').format('YYYY-MM-DD');
      const recentReportSummaries = reportSummaries.filter(
        (report: InboxReport) => report.date >= sevenDaysAgo
      );

      // Calculate daily statistics
      const totalInbox = dailyInboxItems.length;
      const newInbox = dailyInboxItems.filter((item: Inbox) => item.isRead === false).length;
      const processedInbox = dailyInboxItems.filter((item: Inbox) => item.isRead === true).length;
      const deletedInbox = deletedItems.length;

      // Category breakdown
      const categoryMap = new Map<string, number>();
      dailyInboxItems.forEach((item: Inbox) => {
        const category = item.category || 'uncategorized';
        categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      });
      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, count]) => ({
        category,
        count,
      }));

      // Source breakdown
      const sourceMap = new Map<string, number>();
      dailyInboxItems.forEach((item: Inbox) => {
        const source = item.source || 'unknown';
        sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
      });
      const sourceBreakdown = Array.from(sourceMap.entries()).map(([source, count]) => ({
        source,
        count,
      }));

      // Build AI prompt for report generation
      const dailyFacts = dailyInboxItems
        .map((item: Inbox, idx: number) => {
          return `[${idx + 1}] ID:${item.inboxId} [${item.category}] (${item.source})\nQ: ${item.front}\nA: ${item.back}\nRead: ${item.isRead === true ? 'Yes' : 'No'}`;
        })
        .join('\n\n');

      const memoryContext = reportSummaries
        .map((report: InboxReport) => {
          return `Date: ${report.date}\nSummary: ${report.summary || 'No summary'}`;
        })
        .join('\n\n');

      const recentSuggestions = recentReportSummaries
        .map((report: InboxReport) => {
          try {
            const summaryObj = JSON.parse(report.summary || '{}');
            return summaryObj.actions || [];
          } catch {
            return [];
          }
        })
        .flat();

      // Define output schema using Zod
      const reportSchema = z.object({
        topics: z.array(z.string()).describe('Main topics covered in today\'s inbox'),
        mistakes: z.array(z.string()).describe('Common mistakes or issues identified'),
        actions: z
          .array(z.string())
          .describe('Actionable suggestions (avoid repeating recent suggestions)'),
        insights: z
          .array(
            z.object({
              text: z.string().describe('Insight text'),
              evidenceIds: z
                .array(z.string())
                .describe('Inbox IDs that support this insight'),
            })
          )
          .describe('Key insights with evidence references'),
        reportContent: z.string().describe('Full markdown report content'),
      });

      // Initialize OpenAI provider
      const openaiProvider = createOpenAI({
        apiKey: config.openai.apiKey,
        baseURL: config.openai.baseURL,
      });

      // Call AI model with timeout (30s for report generation)
      const result = await generateText({
        model: openaiProvider(config.openai.model),
        temperature: 0.3, // Slightly higher for more creative insights
        maxTokens: 4000,
        abortSignal: AbortSignal.timeout(30000), // 30s timeout
        system: `You are an AI assistant that generates daily inbox reports for knowledge workers.

Your task is to analyze today's inbox items and generate a comprehensive report with insights, patterns, and actionable suggestions.

Guidelines:
1. Identify main topics and themes from today's inbox
2. Highlight common mistakes or issues that need attention
3. Provide actionable suggestions for improvement
4. Ground insights in specific inbox items (include evidenceIds)
5. Avoid repeating suggestions from the last 7 days
6. Use markdown format for the report content
7. Be concise but thorough

Context provided:
- Daily facts: Today's inbox items with IDs
- 30-day memory: Summaries from the last 30 days
- Recent suggestions: Actions suggested in the last 7 days (avoid repeating these)

Your response must be valid JSON matching this schema:
{
  "topics": ["topic1", "topic2", ...],
  "mistakes": ["mistake1", "mistake2", ...],
  "actions": ["action1", "action2", ...],
  "insights": [
    {
      "text": "insight text",
      "evidenceIds": ["inboxId1", "inboxId2"]
    }
  ],
  "reportContent": "# Daily Report\\n\\n..."
}`,
        prompt: `Generate a daily inbox report for ${date}.

Statistics:
- Total inbox items: ${totalInbox}
- New (unread): ${newInbox}
- Processed (read): ${processedInbox}
- Deleted: ${deletedInbox}
- Categories: ${JSON.stringify(categoryBreakdown)}
- Sources: ${JSON.stringify(sourceBreakdown)}

Daily Facts (Today's Inbox Items):
${dailyFacts || 'No inbox items for today'}

30-Day Memory Context:
${memoryContext || 'No recent reports'}

Recent Suggestions (Last 7 Days - DO NOT REPEAT):
${JSON.stringify(recentSuggestions)}

Please generate a comprehensive daily report with topics, mistakes, actions, and insights with evidence.`,
      });

      // Parse and validate AI response
      const parsed = JSON.parse(result.text);
      const validated = reportSchema.parse(parsed);

      logger.info('AI report generation succeeded', {
        date,
        uid,
        topicsCount: validated.topics.length,
        insightsCount: validated.insights.length,
      });

      return {
        content: validated.reportContent,
        summary: {
          topics: validated.topics,
          mistakes: validated.mistakes,
          actions: validated.actions,
          totalInbox,
          newInbox,
          processedInbox,
          deletedInbox,
          categoryBreakdown,
          sourceBreakdown,
          insights: validated.insights,
        },
      };
    } catch (error) {
      // Fallback: Generate basic report without AI
      logger.error('AI report generation failed, using fallback', {
        date,
        uid,
        error,
      });

      const db = getDatabase();
      const targetDate = dayjs(date);
      const startOfDay = targetDate.startOf('day').toDate();
      const endOfDay = targetDate.endOf('day').toDate();

      const dailyInboxItems = await db
        .select()
        .from(inbox)
        .where(
          and(
            eq(inbox.uid, uid),
            eq(inbox.deletedAt, 0),
            gte(inbox.createdAt, startOfDay),
            lte(inbox.createdAt, endOfDay)
          )
        );

      // Get count of deleted items for the target date (separate query)
      const deletedItems = await db
        .select({ count: inbox.inboxId })
        .from(inbox)
        .where(
          and(
            eq(inbox.uid, uid),
            gt(inbox.deletedAt, 0),
            gte(inbox.createdAt, startOfDay),
            lte(inbox.createdAt, endOfDay)
          )
        );

      const totalInbox = dailyInboxItems.length;
      const newInbox = dailyInboxItems.filter((item: Inbox) => item.isRead === false).length;
      const processedInbox = dailyInboxItems.filter((item: Inbox) => item.isRead === true).length;
      const deletedInbox = deletedItems.length;

      const categoryMap = new Map<string, number>();
      dailyInboxItems.forEach((item: Inbox) => {
        const category = item.category || 'uncategorized';
        categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      });
      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, count]) => ({
        category,
        count,
      }));

      const sourceMap = new Map<string, number>();
      dailyInboxItems.forEach((item: Inbox) => {
        const source = item.source || 'unknown';
        sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
      });
      const sourceBreakdown = Array.from(sourceMap.entries()).map(([source, count]) => ({
        source,
        count,
      }));

      const fallbackContent = `# Daily Inbox Report - ${date}

## Summary
- Total inbox items: ${totalInbox}
- New (unread): ${newInbox}
- Processed (read): ${processedInbox}
- Deleted: ${deletedInbox}

## Category Breakdown
${categoryBreakdown.map((c) => `- ${c.category}: ${c.count}`).join('\n')}

## Source Breakdown
${sourceBreakdown.map((s) => `- ${s.source}: ${s.count}`).join('\n')}

*Note: AI-generated insights unavailable. This is a basic statistical report.*`;

      return {
        content: fallbackContent,
        summary: {
          topics: [],
          mistakes: [],
          actions: [],
          totalInbox,
          newInbox,
          processedInbox,
          deletedInbox,
          categoryBreakdown,
          sourceBreakdown,
          insights: [],
        },
      };
    }
  }

  /**
   * Execute AI organize with validation and fallback
   * Implements US-014: AI organize execution validation and fallback
   */
  async organizeInbox(params: {
    uid: string;
    inboxId: string;
  }): Promise<AiOrganizeResponseDto> {
    const { uid, inboxId } = params;
    const startTime = Date.now();
    let failureReason: string | undefined;

    // Track organize start
    this.metricsService.trackInboxOrganizeStart(uid, inboxId);

    try {
      // Get current inbox item for fallback
      const db = getDatabase();
      const currentItem = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.uid, uid), eq(inbox.inboxId, inboxId), eq(inbox.deletedAt, 0)))
        .limit(1);

      if (currentItem.length === 0) {
        throw new Error('Inbox item not found');
      }

      const originalFront = currentItem[0].front;
      const originalBack = currentItem[0].back || '';

      // Build AI prompt with context
      const promptInput = await this.buildPrompt({
        uid,
        inboxId,
        task: 'organize_inbox',
        outputFormat: 'json',
      });

      // Define output schema using Zod
      const aiOrganizeSchema = z.object({
        optimizedFront: z.string().min(1),
        optimizedBack: z.string(),
        reason: z.string().min(1),
        confidence: z.number().min(0).max(1),
      });

      // Initialize OpenAI provider with custom baseURL
      const openaiProvider = createOpenAI({
        apiKey: config.openai.apiKey,
        baseURL: config.openai.baseURL,
      });

      // Call AI model with timeout (15s as per PRD)
      const result = await generateText({
        model: openaiProvider(config.openai.model),
        temperature: 0.2, // Stable and controlled as per PRD
        maxTokens: 2000,
        abortSignal: AbortSignal.timeout(15000), // 15s timeout
        system: `You are an AI assistant that helps organize inbox content for flashcard learning.

Your task is to optimize the front (question) and back (answer) of inbox items to make them suitable for flashcard-based learning.

Guidelines:
1. Keep the optimized content concise and focused on a single knowledge point
2. If the back is missing or incomplete, try to complete it based on the front and context
3. Do not introduce facts that don't exist in the original content or context
4. If information is insufficient, explicitly state "Cannot determine" rather than making up content
5. Output must be in JSON format with fields: optimizedFront, optimizedBack, reason, confidence

Context provided:
- Current input: The inbox item to optimize
- Recent context (L1): Related inbox items from the last 7 days
- Report memory (L2): Summaries from the last 30 days

Your response must be valid JSON matching this schema:
{
  "optimizedFront": "string (the optimized question/front)",
  "optimizedBack": "string (the optimized answer/back)",
  "reason": "string (explanation for the optimization)",
  "confidence": number (0-1, your confidence in this optimization)
}`,
        prompt: JSON.stringify(promptInput, null, 2),
      });

      // Parse and validate AI response
      const parsed = JSON.parse(result.text);
      const validated = aiOrganizeSchema.parse(parsed);

      const latency = Date.now() - startTime;

      logger.info('AI organize succeeded', {
        inboxId,
        uid,
        confidence: validated.confidence,
        latency,
      });

      // Track organize success
      this.metricsService.trackInboxOrganizeSuccess(uid, inboxId, latency, false);

      return {
        optimizedFront: validated.optimizedFront,
        optimizedBack: validated.optimizedBack,
        reason: validated.reason,
        confidence: validated.confidence,
        fallback: false,
      };
    } catch (error) {
      // Record failure reason for observability
      if (error instanceof Error) {
        if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
          failureReason = 'AI request timeout (15s exceeded)';
        } else if (error instanceof SyntaxError || error.message.includes('JSON')) {
          failureReason = 'AI response parse failure (invalid JSON)';
        } else if (error.message.includes('validation')) {
          failureReason = 'AI response validation failure (schema mismatch)';
        } else {
          failureReason = `AI service error: ${error.message}`;
        }
      } else {
        failureReason = 'Unknown AI service error';
      }

      const latency = Date.now() - startTime;

      logger.error('AI organize failed, returning fallback', {
        inboxId,
        uid,
        failureReason,
        latency,
        error,
      });

      // Track organize fallback
      this.metricsService.trackInboxOrganizeSuccess(uid, inboxId, latency, true);

      // Fallback: Return original content with fallback flag
      const db = getDatabase();
      const currentItem = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.uid, uid), eq(inbox.inboxId, inboxId), eq(inbox.deletedAt, 0)))
        .limit(1);

      const originalFront = currentItem[0]?.front || '';
      const originalBack = currentItem[0]?.back || '';

      return {
        optimizedFront: originalFront,
        optimizedBack: originalBack,
        reason: `AI organize failed: ${failureReason}. Returning original content.`,
        confidence: 0,
        fallback: true,
      };
    }
  }
}
