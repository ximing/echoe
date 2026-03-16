import { Service } from 'typedi';
import pRetry from 'p-retry';
import { logger } from '../utils/logger.js';
import { InboxAiService } from './inbox-ai.service.js';
import { InboxReportService } from './inbox-report.service.js';

/**
 * Queue job types for inbox AI operations
 */
export enum InboxJobType {
  GENERATE_REPORT = 'generate_report',
  ORGANIZE_INBOX = 'organize_inbox',
  TO_CARD_AI = 'to_card_ai',
}

/**
 * Job data interfaces
 */
export interface GenerateReportJobData {
  uid: string;
  date: string;
}

export interface OrganizeInboxJobData {
  uid: string;
  inboxId: string;
}

export interface ToCardAiJobData {
  uid: string;
  inboxId: string;
  deckId?: string;
  notetypeId?: string;
}

export type InboxJobData = GenerateReportJobData | OrganizeInboxJobData | ToCardAiJobData;

/**
 * Job configuration per task type
 */
interface JobConfig {
  timeout: number; // milliseconds
  retries: number;
  retryDelay: number; // milliseconds
}

const JOB_CONFIGS: Record<InboxJobType, JobConfig> = {
  [InboxJobType.GENERATE_REPORT]: {
    timeout: 30000, // 30s
    retries: 2,
    retryDelay: 30000, // 30s
  },
  [InboxJobType.ORGANIZE_INBOX]: {
    timeout: 15000, // 15s
    retries: 2,
    retryDelay: 10000, // 10s
  },
  [InboxJobType.TO_CARD_AI]: {
    timeout: 15000, // 15s
    retries: 2,
    retryDelay: 10000, // 10s
  },
};

/**
 * Simple in-memory queue with concurrency control
 */
class SimpleQueue {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private concurrency: number;

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  get size(): number {
    return this.queue.length;
  }

  get pending(): number {
    return this.running;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      this.queue.push(task);
      this.processQueue();
    });
  }

  private processQueue() {
    // 启动尽可能多的任务，直到达到并发限制
    // 注意：这里是同步循环，确保 running 计数器在检查和增加之间没有异步间隙
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.running++;

      // 异步执行任务，不等待完成
      task()
        .catch(() => {
          // 错误已在 task 内部处理，这里仅捕获防止未处理异常
        })
        .finally(() => {
          this.running--;
          // 任务完成后，尝试处理更多任务
          this.processQueue();
        });
    }
  }
}

/**
 * InboxQueueService manages async execution of AI-heavy inbox tasks
 * with centralized retry and timeout policies.
 *
 * Uses simple in-memory queue for job management.
 */
@Service()
export class InboxQueueService {
  private queue: SimpleQueue;

  constructor(
    private inboxAiService: InboxAiService,
    private inboxReportService: InboxReportService
  ) {
    this.queue = new SimpleQueue(5);

    logger.info('InboxQueueService initialized', {
      event: 'inbox_queue_service_initialized',
      concurrency: 5,
    });
  }

  /**
   * Get current queue size (pending jobs)
   */
  getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * Get number of pending jobs
   */
  getPendingCount(): number {
    return this.queue.pending;
  }

  /**
   * Enqueue a job for async execution
   */
  async enqueue<T>(jobType: InboxJobType, jobData: InboxJobData): Promise<T> {
    const config = JOB_CONFIGS[jobType];

    logger.info('Enqueuing job', {
      event: 'inbox_queue_job_enqueued',
      jobType,
      queueSize: this.queue.size,
      pending: this.queue.pending,
    });

    return this.queue.add(async () => {
      return pRetry(
        async () => {
          return this.executeJob<T>(jobType, jobData, config.timeout);
        },
        {
          retries: config.retries,
          minTimeout: config.retryDelay,
          maxTimeout: config.retryDelay,
          onFailedAttempt: (error) => {
            logger.warn('Job retry attempt failed', {
              event: 'inbox_queue_job_retry',
              jobType,
              attempt: error.attemptNumber,
              retriesLeft: error.retriesLeft,
              error: error.message,
            });
          },
        }
      );
    });
  }

  /**
   * Execute a job synchronously (fast path)
   */
  async executeSync<T>(jobType: InboxJobType, jobData: InboxJobData): Promise<T> {
    const config = JOB_CONFIGS[jobType];

    logger.info('Executing job synchronously', {
      event: 'inbox_queue_job_sync',
      jobType,
    });

    return pRetry(
      async () => {
        return this.executeJob<T>(jobType, jobData, config.timeout);
      },
      {
        retries: config.retries,
        minTimeout: config.retryDelay,
        maxTimeout: config.retryDelay,
        onFailedAttempt: (error) => {
          logger.warn('Sync job retry attempt failed', {
            event: 'inbox_queue_job_sync_retry',
            jobType,
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            error: error.message,
          });
        },
      }
    );
  }

  /**
   * Execute a single job with timeout
   */
  private async executeJob<T>(
    jobType: InboxJobType,
    jobData: InboxJobData,
    timeout: number
  ): Promise<T> {
    const startTime = Date.now();

    try {
      let result: any;

      switch (jobType) {
        case InboxJobType.GENERATE_REPORT:
          result = await this.handleGenerateReport(jobData as GenerateReportJobData);
          break;

        case InboxJobType.ORGANIZE_INBOX:
          result = await this.handleOrganizeInbox(jobData as OrganizeInboxJobData);
          break;

        case InboxJobType.TO_CARD_AI:
          result = await this.handleToCardAi(jobData as ToCardAiJobData);
          break;

        default:
          throw new Error(`Unknown job type: ${jobType}`);
      }

      const duration = Date.now() - startTime;

      logger.info('Job completed successfully', {
        event: 'inbox_queue_job_completed',
        jobType,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Job execution failed', {
        event: 'inbox_queue_job_failed',
        jobType,
        duration,
        error,
      });

      throw error;
    }
  }

  /**
   * Handle GENERATE_REPORT job
   */
  private async handleGenerateReport(data: GenerateReportJobData): Promise<any> {
    const { uid, date } = data;

    // Check if report already exists (idempotency)
    const existingReport = await this.inboxReportService.findByUidAndDate(uid, date);
    if (existingReport) {
      logger.info('Report already exists, skipping generation', {
        event: 'inbox_queue_report_exists',
        uid,
        date,
        reportId: existingReport.inboxReportId,
      });
      return existingReport;
    }

    // Generate AI report
    const { content, summary } = await this.inboxAiService.generateDailyReport({ uid, date });

    // Create report record
    const report = await this.inboxReportService.create(uid, {
      date,
      content,
      summary: JSON.stringify(summary),
    });

    return report;
  }

  /**
   * Handle ORGANIZE_INBOX job
   */
  private async handleOrganizeInbox(data: OrganizeInboxJobData): Promise<any> {
    const { uid, inboxId } = data;

    const result = await this.inboxAiService.organizeInbox({ uid, inboxId });

    return result;
  }

  /**
   * Handle TO_CARD_AI job
   * Note: This is a placeholder - actual implementation depends on card conversion service
   */
  private async handleToCardAi(data: ToCardAiJobData): Promise<any> {
    const { uid, inboxId, deckId, notetypeId } = data;

    // TODO: Implement AI-assisted card conversion
    // For now, return a placeholder
    logger.warn('TO_CARD_AI job not fully implemented', {
      event: 'inbox_queue_to_card_ai_placeholder',
      uid,
      inboxId,
      deckId,
      notetypeId,
    });

    return {
      success: false,
      message: 'TO_CARD_AI job not fully implemented',
    };
  }
}
