/**
 * API Token DTOs
 * API Token 相关的数据传输对象
 */

/**
 * API Token 基础信息 DTO
 */
export interface ApiTokenDto {
  /** Token 唯一标识符 */
  tokenId: string;
  /** 用户 ID (Token 所有者) */
  uid: string;
  /** Token 名称 (人工可读) */
  name: string;
  /** Token 哈希值 (用于安全验证) */
  tokenHash: string;
  /** 软删除时间戳 (null = 活跃) */
  deletedAt: Date | null;
  /** Token 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * API Token 列表项 DTO (不包含敏感信息)
 */
export interface ApiTokenListItemDto {
  /** Token 唯一标识符 */
  tokenId: string;
  /** Token 名称 (人工可读) */
  name: string;
  /** 软删除时间戳 (null = 活跃) */
  deletedAt: Date | null;
  /** Token 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
}

/**
 * 创建 API Token 请求 DTO
 */
export interface CreateApiTokenDto {
  /** Token 名称 (人工可读) */
  name: string;
}

/**
 * 创建 API Token 响应 DTO
 */
export interface CreateApiTokenResponseDto {
  /** Token 唯一标识符 */
  tokenId: string;
  /** Token 值 (仅创建时返回一次) */
  token: string;
  /** Token 名称 */
  name: string;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 删除 API Token 请求 DTO
 */
export interface DeleteApiTokenDto {
  /** Token 唯一标识符 */
  tokenId: string;
}
