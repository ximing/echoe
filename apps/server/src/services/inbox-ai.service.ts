import { Service } from 'typedi';
import { eq, and, isNull, gte, lte, desc, gt, lt } from 'drizzle-orm';
import dayjs from 'dayjs';

import { getDatabase } from '../db/connection.js';
import { inbox, type Inbox } from '../db/schema/inbox.js';
import { inboxReport, type InboxReport } from '../db/schema/inbox-report.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

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
  /**
   * Retrieve L0: Current inbox item
   */
  async getL0Context(uid: string, inboxId: string): Promise<ContextItem | null> {
    try {
      const db = getDatabase();

      const results = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.uid, uid), eq(inbox.inboxId, inboxId), isNull(inbox.deletedAt)))
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
        .where(and(eq(inbox.uid, uid), eq(inbox.inboxId, currentInboxId), isNull(inbox.deletedAt)))
        .limit(1);

      const sevenDaysAgo = dayjs().subtract(7, 'day').toDate();

      // Get items from last 7 days
      const results = await db
        .select()
        .from(inbox)
        .where(and(eq(inbox.uid, uid), isNull(inbox.deletedAt), gte(inbox.createdAt, sevenDaysAgo)))
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
            isNull(inboxReport.deletedAt),
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
      .where(and(eq(inbox.uid, uid), eq(inbox.inboxId, inboxId), isNull(inbox.deletedAt)))
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
    category1: string,
    category2: string
  ): number {
    let score = 0;

    // Category match (weight: 0.4)
    if (category1 === category2 && category1 !== '') {
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
}
