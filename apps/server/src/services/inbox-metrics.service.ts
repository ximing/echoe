import { Service } from 'typedi';

import { logger } from '../utils/logger.js';

/**
 * Metric types for inbox AI flows
 */
export enum MetricType {
  // Business metrics
  INBOX_CREATE_TOTAL = 'inbox_create_total',
  INBOX_ORGANIZE_SUCCESS_RATE = 'inbox_organize_success_rate',
  INBOX_ORGANIZE_LATENCY_P95 = 'inbox_organize_latency_p95',
  REPORT_GENERATE_SUCCESS_RATE = 'report_generate_success_rate',
  REPORT_GENERATE_LATENCY_P95 = 'report_generate_latency_p95',
  TO_CARD_SUCCESS_RATE = 'to_card_success_rate',
  TOKEN_CREATE_TOTAL = 'token_create_total',
  TOKEN_AUTH_SUCCESS_RATE = 'token_auth_success_rate',

  // Technical metrics
  AI_SERVICE_ERROR_RATE = 'ai_service_error_rate',
  AI_SERVICE_LATENCY_P99 = 'ai_service_latency_p99',
  DB_QUERY_LATENCY_P95 = 'db_query_latency_p95',
  QUEUE_JOB_BACKLOG = 'queue_job_backlog',
}

/**
 * Event types for structured logging
 */
export enum EventType {
  INBOX_CREATED = 'inbox_created',
  INBOX_ORGANIZE_START = 'inbox_organize_start',
  INBOX_ORGANIZE_SUCCESS = 'inbox_organize_success',
  INBOX_ORGANIZE_FALLBACK = 'inbox_organize_fallback',
  INBOX_ORGANIZE_ERROR = 'inbox_organize_error',
  REPORT_GENERATE_START = 'report_generate_start',
  REPORT_GENERATE_SUCCESS = 'report_generate_success',
  REPORT_GENERATE_CONFLICT = 'report_generate_conflict',
  REPORT_GENERATE_ERROR = 'report_generate_error',
  TO_CARD_START = 'to_card_start',
  TO_CARD_SUCCESS = 'to_card_success',
  TO_CARD_ERROR = 'to_card_error',
  TOKEN_CREATED = 'token_created',
  TOKEN_AUTH_SUCCESS = 'token_auth_success',
  TOKEN_AUTH_FAILURE = 'token_auth_failure',
}

interface MetricData {
  uid?: string;
  inboxId?: string;
  reportId?: string;
  tokenId?: string;
  latency?: number;
  fallback?: boolean;
  reason?: string;
  error?: string;
  [key: string]: unknown;
}

/**
 * InboxMetricsService
 * Centralized metrics and structured logging for inbox AI flows
 */
@Service()
export class InboxMetricsService {
  /**
   * Emit a metric event with structured logging
   */
  public emitMetric(metricType: MetricType, value: number, data?: MetricData): void {
    logger.info(`[METRIC] ${metricType}`, {
      metric: metricType,
      value,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log a structured event
   */
  public logEvent(eventType: EventType, data: MetricData): void {
    logger.info(`[EVENT] ${eventType}`, {
      event: eventType,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log an error event
   */
  public logError(eventType: EventType, error: Error | string, data?: MetricData): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(`[ERROR] ${eventType}`, {
      event: eventType,
      error: errorMessage,
      stack: errorStack,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Track inbox creation
   */
  public trackInboxCreate(uid: string, inboxId: string, source: string): void {
    this.emitMetric(MetricType.INBOX_CREATE_TOTAL, 1, { uid, inboxId, source });
    this.logEvent(EventType.INBOX_CREATED, { uid, inboxId, source });
  }

  /**
   * Track inbox organize start
   */
  public trackInboxOrganizeStart(uid: string, inboxId: string): void {
    this.logEvent(EventType.INBOX_ORGANIZE_START, { uid, inboxId });
  }

  /**
   * Track inbox organize success
   */
  public trackInboxOrganizeSuccess(uid: string, inboxId: string, latency: number, fallback: boolean): void {
    this.emitMetric(MetricType.INBOX_ORGANIZE_SUCCESS_RATE, 1, { uid, inboxId, latency, fallback });
    this.emitMetric(MetricType.INBOX_ORGANIZE_LATENCY_P95, latency, { uid, inboxId });

    if (fallback) {
      this.logEvent(EventType.INBOX_ORGANIZE_FALLBACK, { uid, inboxId, latency });
    } else {
      this.logEvent(EventType.INBOX_ORGANIZE_SUCCESS, { uid, inboxId, latency });
    }
  }

  /**
   * Track inbox organize error
   */
  public trackInboxOrganizeError(uid: string, inboxId: string, error: Error | string, latency: number): void {
    this.emitMetric(MetricType.INBOX_ORGANIZE_SUCCESS_RATE, 0, { uid, inboxId, latency });
    this.logError(EventType.INBOX_ORGANIZE_ERROR, error, { uid, inboxId, latency });
  }

  /**
   * Track report generation start
   */
  public trackReportGenerateStart(uid: string, date: string): void {
    this.logEvent(EventType.REPORT_GENERATE_START, { uid, date });
  }

  /**
   * Track report generation success
   */
  public trackReportGenerateSuccess(uid: string, reportId: string, date: string, latency: number): void {
    this.emitMetric(MetricType.REPORT_GENERATE_SUCCESS_RATE, 1, { uid, reportId, date, latency });
    this.emitMetric(MetricType.REPORT_GENERATE_LATENCY_P95, latency, { uid, reportId, date });
    this.logEvent(EventType.REPORT_GENERATE_SUCCESS, { uid, reportId, date, latency });
  }

  /**
   * Track report generation conflict (409)
   */
  public trackReportGenerateConflict(uid: string, reportId: string, date: string): void {
    this.logEvent(EventType.REPORT_GENERATE_CONFLICT, { uid, reportId, date });
  }

  /**
   * Track report generation error
   */
  public trackReportGenerateError(uid: string, date: string, error: Error | string, latency: number): void {
    this.emitMetric(MetricType.REPORT_GENERATE_SUCCESS_RATE, 0, { uid, date, latency });
    this.logError(EventType.REPORT_GENERATE_ERROR, error, { uid, date, latency });
  }

  /**
   * Track inbox-to-card conversion start
   */
  public trackToCardStart(uid: string, inboxId: string): void {
    this.logEvent(EventType.TO_CARD_START, { uid, inboxId });
  }

  /**
   * Track inbox-to-card conversion success
   */
  public trackToCardSuccess(uid: string, inboxId: string, noteId: string, aiRecommended: boolean): void {
    this.emitMetric(MetricType.TO_CARD_SUCCESS_RATE, 1, { uid, inboxId, noteId, aiRecommended });
    this.logEvent(EventType.TO_CARD_SUCCESS, { uid, inboxId, noteId, aiRecommended });
  }

  /**
   * Track inbox-to-card conversion error
   */
  public trackToCardError(uid: string, inboxId: string, error: Error | string): void {
    this.emitMetric(MetricType.TO_CARD_SUCCESS_RATE, 0, { uid, inboxId });
    this.logError(EventType.TO_CARD_ERROR, error, { uid, inboxId });
  }

  /**
   * Track API token creation
   */
  public trackTokenCreate(uid: string, tokenId: string): void {
    this.emitMetric(MetricType.TOKEN_CREATE_TOTAL, 1, { uid, tokenId });
    this.logEvent(EventType.TOKEN_CREATED, { uid, tokenId });
  }

  /**
   * Track API token authentication success
   */
  public trackTokenAuthSuccess(uid: string, tokenId: string): void {
    this.emitMetric(MetricType.TOKEN_AUTH_SUCCESS_RATE, 1, { uid, tokenId });
    this.logEvent(EventType.TOKEN_AUTH_SUCCESS, { uid, tokenId });
  }

  /**
   * Track API token authentication failure
   */
  public trackTokenAuthFailure(reason: string, tokenHash?: string): void {
    this.emitMetric(MetricType.TOKEN_AUTH_SUCCESS_RATE, 0, { reason, tokenHash });
    this.logEvent(EventType.TOKEN_AUTH_FAILURE, { reason, tokenHash });
  }

  /**
   * Track AI service error
   */
  public trackAiServiceError(operation: string, error: Error | string, latency: number): void {
    this.emitMetric(MetricType.AI_SERVICE_ERROR_RATE, 1, { operation, latency });
    this.emitMetric(MetricType.AI_SERVICE_LATENCY_P99, latency, { operation });
    this.logError(EventType.INBOX_ORGANIZE_ERROR, error, { operation, latency });
  }

  /**
   * Track database query latency
   */
  public trackDbQueryLatency(operation: string, latency: number): void {
    this.emitMetric(MetricType.DB_QUERY_LATENCY_P95, latency, { operation });
  }

  /**
   * Track queue job backlog
   */
  public trackQueueBacklog(queueName: string, backlogCount: number): void {
    this.emitMetric(MetricType.QUEUE_JOB_BACKLOG, backlogCount, { queueName });
  }
}
