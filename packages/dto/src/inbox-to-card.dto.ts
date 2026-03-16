/**
 * Inbox To Card DTOs
 * 收件箱转卡片相关的数据传输对象
 */

/**
 * AI 组织响应 DTO
 * AI 整理收件箱内容后返回的优化建议
 */
export interface AiOrganizeResponseDto {
  /** 优化后的正面/问题内容 */
  optimizedFront: string;
  /** 优化后的背面/答案内容 */
  optimizedBack: string;
  /** 优化理由 */
  reason: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 是否为降级方案 (AI 无法处理时返回原始内容) */
  fallback: boolean;
}

/**
 * 卡片转换来源枚举
 */
export enum CardConversionSource {
  /** 手动转换 */
  MANUAL = 'manual',
  /** AI 辅助转换 */
  AI = 'ai',
  /** 批量转换 */
  BATCH = 'batch',
}

/**
 * 卡片转换状态枚举
 */
export enum CardConversionStatus {
  /** 待处理 */
  PENDING = 'pending',
  /** 处理中 */
  PROCESSING = 'processing',
  /** 已完成 */
  COMPLETED = 'completed',
  /** 失败 */
  FAILED = 'failed',
}

/**
 * 单个 Inbox 转卡片请求 DTO
 */
export interface ConvertInboxToCardDto {
  /** Inbox ID */
  inboxId: string;
  /** 目标卡组 ID */
  deckId: string;
  /** 笔记类型 ID */
  notetypeId: string;
  /** 是否使用 AI 优化 */
  useAiOptimize?: boolean;
  /** 自定义字段映射 (可选) */
  fieldMapping?: Record<string, string>;
}

/**
 * AI 优化请求 DTO
 */
export interface AiOptimizeInboxDto {
  /** Inbox ID */
  inboxId: string;
  /** 笔记类型 ID (用于获取字段信息) */
  notetypeId: string;
  /** 目标卡组 ID */
  deckId?: string;
}

/**
 * AI 优化响应 DTO
 */
export interface AiOptimizeResponseDto {
  /** Inbox ID */
  inboxId: string;
  /** AI 优化建议 */
  aiSuggestion: AiOrganizeResponseDto;
}

/**
 * 批量 Inbox 转卡片请求 DTO
 */
export interface BulkConvertInboxToCardDto {
  /** Inbox ID 列表 */
  inboxIds: string[];
  /** 目标卡组 ID */
  deckId: string;
  /** 笔记类型 ID */
  notetypeId: string;
  /** 是否使用 AI 优化 */
  useAiOptimize?: boolean;
  /** 自定义字段映射 */
  fieldMapping?: Record<string, string>;
}

/**
 * 单个转换结果 DTO
 */
export interface ConversionResultDto {
  /** Inbox ID */
  inboxId: string;
  /** 生成的卡片 ID (成功时) */
  cardId?: string;
  /** 转换状态 */
  status: CardConversionStatus;
  /** 错误信息 (失败时) */
  error?: string;
}

/**
 * 批量转换响应 DTO
 */
export interface BulkConversionResponseDto {
  /** 转换结果列表 */
  results: ConversionResultDto[];
  /** 成功数量 */
  successCount: number;
  /** 失败数量 */
  failedCount: number;
}

/**
 * 转换预览 DTO
 */
export interface ConversionPreviewDto {
  /** Inbox ID */
  inboxId: string;
  /** 原始正面内容 */
  originalFront: string;
  /** 原始背面内容 */
  originalBack: string;
  /** 优化后正面内容 (如使用 AI) */
  optimizedFront?: string;
  /** 优化后背面内容 (如使用 AI) */
  optimizedBack?: string;
  /** 笔记类型 ID */
  notetypeId: string;
  /** 笔记类型名称 */
  notetypeName: string;
  /** 字段映射预览 */
  fieldPreview: Record<string, string>;
}
