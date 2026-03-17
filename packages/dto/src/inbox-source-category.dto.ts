/**
 * Inbox Source and Category DTOs
 * 收件箱来源与类别相关的数据传输对象
 */

/**
 * Inbox Source DTO
 */
export interface SourceDto {
  /** Source ID */
  id: number;
  /** User ID (owner) */
  uid: string;
  /** Source name (e.g., 'manual', 'web', 'api') */
  name: string;
  /** Creation time */
  createdAt: Date;
  /** Last update time */
  updatedAt: Date;
}

/**
 * Create Inbox Source Request DTO
 */
export interface CreateSourceDto {
  /** Source name */
  name: string;
}

/**
 * Inbox Source List Response DTO
 */
export interface SourceListResponse {
  /** List of sources */
  sources: SourceDto[];
  /** Total count */
  total: number;
}

/**
 * Inbox Category DTO
 */
export interface CategoryDto {
  /** Category ID */
  id: number;
  /** User ID (owner) */
  uid: string;
  /** Category name (e.g., 'backend', 'frontend', 'design') */
  name: string;
  /** Creation time */
  createdAt: Date;
  /** Last update time */
  updatedAt: Date;
}

/**
 * Create Inbox Category Request DTO
 */
export interface CreateCategoryDto {
  /** Category name */
  name: string;
}

/**
 * Inbox Category List Response DTO
 */
export interface CategoryListResponse {
  /** List of categories */
  categories: CategoryDto[];
  /** Total count */
  total: number;
}
