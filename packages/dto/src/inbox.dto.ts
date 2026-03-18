/**
 * Inbox DTOs
 * 收件箱相关的数据传输对象
 */

/**
 * Inbox 来源枚举
 */
export enum InboxSource {
  /** 手动创建 */
  MANUAL = 'manual',
  /** 网页捕获 */
  WEB = 'web',
  /** API 导入 */
  API = 'api',
  /** 浏览器扩展 */
  EXTENSION = 'extension',
  /** 其他来源 */
  OTHER = 'other',
}

/**
 * Inbox 类别枚举
 */
export enum InboxCategory {
  /** 后端技术 */
  BACKEND = 'backend',
  /** 前端技术 */
  FRONTEND = 'frontend',
  /** 设计 */
  DESIGN = 'design',
  /** 产品 */
  PRODUCT = 'product',
  /** 生活 */
  LIFE = 'life',
  /** 其他 */
  OTHER = 'other',
}

/**
 * Inbox 基础信息 DTO
 */
export interface InboxDto {
  /** Inbox 唯一标识符 (业务 ID) */
  inboxId: string;
  /** 用户 ID (所有者) */
  uid: string;
  /** 正面/问题内容 */
  front: string;
  /** 背面/答案内容 */
  back: string;
  /** 来源 (动态字符串值) */
  source: string | null;
  /** 类别/标签 (动态字符串值) */
  category: string | null;
  /** 已读状态 (false = 未读, true = 已读) */
  isRead: boolean;
  /** 软删除时间戳 (0 = 未删除, >0 = 已删除) */
  deletedAt: number;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * Inbox 列表项 DTO
 */
export interface InboxListItemDto {
  /** Inbox 唯一标识符 */
  inboxId: string;
  /** 正面/问题内容 */
  front: string;
  /** 背面/答案内容 */
  back: string;
  /** 来源 (动态字符串值) */
  source: string | null;
  /** 类别 (动态字符串值) */
  category: string | null;
  /** 已读状态 */
  isRead: boolean;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * 创建 Inbox 请求 DTO
 */
export interface CreateInboxDto {
  /** 正面/问题内容 */
  front: string;
  /** 背面/答案内容 */
  back: string;
  /** 正面内容的 TipTap JSON 格式 (可选, 优先于 front) */
  frontJson?: Record<string, unknown>;
  /** 背面内容的 TipTap JSON 格式 (可选, 优先于 back) */
  backJson?: Record<string, unknown>;
  /** 来源 (可选, 动态字符串值) */
  source?: string;
  /** 类别 (可选, 动态字符串值) */
  category?: string;
}

/**
 * 更新 Inbox 请求 DTO
 */
export interface UpdateInboxDto {
  /** 正面/问题内容 */
  front?: string;
  /** 背面/答案内容 */
  back?: string;
  /** 正面内容的 TipTap JSON 格式 (可选, 优先于 front) */
  frontJson?: Record<string, unknown>;
  /** 背面内容的 TipTap JSON 格式 (可选, 优先于 back) */
  backJson?: Record<string, unknown>;
  /** 来源 (动态字符串值) */
  source?: string | null;
  /** 类别 (动态字符串值) */
  category?: string | null;
  /** 已读状态 */
  isRead?: boolean;
}

/**
 * Inbox 查询参数 DTO
 */
export interface InboxQueryParams {
  /** 用户 ID */
  uid: string;
  /** 按来源筛选 (动态字符串值) */
  source?: string;
  /** 按类别筛选 (动态字符串值) */
  category?: string;
  /** 筛选已读状态 (false = 未读, true = 已读) */
  isRead?: boolean;
  /** 搜索关键词 (搜索 front 和 back 内容) */
  keyword?: string;
  /** 页码 (默认 1) */
  page?: number;
  /** 每页数量 (默认 20) */
  limit?: number;
  /** 排序字段: createdAt, updatedAt */
  sortBy?: 'createdAt' | 'updatedAt';
  /** 排序方向: asc, desc */
  order?: 'asc' | 'desc';
}

/**
 * 批量更新 Inbox 请求 DTO
 */
export interface BulkUpdateInboxDto {
  /** Inbox ID 列表 */
  inboxIds: string[];
  /** 更新操作: markRead, markUnread, delete, updateCategory */
  action: 'markRead' | 'markUnread' | 'delete' | 'updateCategory';
  /** 操作参数 (用于 updateCategory) */
  payload?: {
    category?: string;
  };
}

/**
 * 批量操作响应 DTO
 */
export interface BulkOperationResponseDto {
  /** 成功数量 */
  successCount: number;
  /** 失败数量 */
  failedCount: number;
  /** 失败项详情 */
  failedItems?: { inboxId: string; reason: string }[];
}
