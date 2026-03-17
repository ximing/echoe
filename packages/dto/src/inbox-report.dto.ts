/**
 * Inbox Report DTOs
 * 收件箱报告相关的数据传输对象
 */

/**
 * Inbox Report 基础信息 DTO
 */
export interface InboxReportDto {
  /** 报告唯一标识符 (业务 ID) */
  inboxReportId: string;
  /** 用户 ID (所有者) */
  uid: string;
  /** 报告日期 (YYYY-MM-DD 格式) */
  date: string;
  /** Markdown 格式的报告内容 */
  content: string;
  /** 结构化 AI 摘要 (JSON 字符串) */
  summary: string | null;
  /** 软删除时间戳 (0 = 未删除, >0 = 已删除) */
  deletedAt: number;
  /** 报告创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * Inbox Report 列表项 DTO
 */
export interface InboxReportListItemDto {
  /** 报告唯一标识符 */
  inboxReportId: string;
  /** 报告日期 (YYYY-MM-DD 格式) */
  date: string;
  /** 结构化 AI 摘要 (JSON 字符串) */
  summary: string | null;
  /** 报告创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * Inbox Report 查询参数 DTO
 */
export interface InboxReportQueryParams {
  /** 用户 ID */
  uid: string;
  /** 报告日期 (YYYY-MM-DD) - 精确匹配 */
  date?: string;
  /** 日期范围 - 开始日期 (YYYY-MM-DD) */
  startDate?: string;
  /** 日期范围 - 结束日期 (YYYY-MM-DD) */
  endDate?: string;
  /** 页码 (默认 1) */
  page?: number;
  /** 每页数量 (默认 20) */
  limit?: number;
  /** 排序字段: date, createdAt */
  sortBy?: 'date' | 'createdAt';
  /** 排序方向: asc, desc */
  order?: 'asc' | 'desc';
}

/**
 * Insight item with text and evidence references
 */
export interface InsightItemDto {
  /** Insight text */
  text: string;
  /** Inbox IDs that support this insight */
  evidenceIds: string[];
}

/**
 * 结构化 AI 摘要内容 DTO
 */
export interface InboxReportSummaryDto {
  /** 今日收件箱总数 */
  totalInbox: number;
  /** 今日新增条目数 */
  newInbox: number;
  /** 今日已处理条目数 */
  processedInbox: number;
  /** 今日删除条目数 */
  deletedInbox: number;
  /** 主要类别分布 */
  categoryBreakdown: {
    category: string;
    count: number;
  }[];
  /** 主要来源分布 */
  sourceBreakdown: {
    source: string;
    count: number;
  }[];
  /** AI 生成的洞察 */
  insights: InsightItemDto[];
  /** 主要主题/话题 */
  topics?: string[];
  /** 需要注意的问题 */
  mistakes?: string[];
  /** 行动建议 */
  actions?: string[];
}

/**
 * 创建/更新 Inbox Report 请求 DTO
 */
export interface UpsertInboxReportDto {
  /** 报告日期 (YYYY-MM-DD 格式) */
  date: string;
  /** Markdown 格式的报告内容 */
  content: string;
  /** 结构化 AI 摘要 (可选, JSON 字符串) */
  summary?: string;
}
