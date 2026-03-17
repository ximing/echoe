import type {
  SourceDto,
  CreateSourceDto,
  SourceListResponse,
  CategoryDto,
  CreateCategoryDto,
  CategoryListResponse,
  ApiResponseDto,
} from '@echoe/dto';
import request from '../utils/request';

/**
 * Get all inbox sources for current user
 */
export const getInboxSources = () => {
  return request.get<unknown, ApiResponseDto<SourceListResponse>>('/api/v1/inbox/sources');
};

/**
 * Get all inbox categories for current user
 */
export const getInboxCategories = () => {
  return request.get<unknown, ApiResponseDto<CategoryListResponse>>('/api/v1/inbox/categories');
};

/**
 * Create a new inbox source
 */
export const createInboxSource = (data: CreateSourceDto) => {
  return request.post<CreateSourceDto, ApiResponseDto<SourceDto>>(
    '/api/v1/inbox/sources',
    data
  );
};

/**
 * Create a new inbox category
 */
export const createInboxCategory = (data: CreateCategoryDto) => {
  return request.post<CreateCategoryDto, ApiResponseDto<CategoryDto>>(
    '/api/v1/inbox/categories',
    data
  );
};

/**
 * Delete an inbox source
 */
export const deleteInboxSource = (id: number) => {
  return request.delete<unknown, ApiResponseDto<{ message: string }>>(
    `/api/v1/inbox/sources/${id}`
  );
};

/**
 * Delete an inbox category
 */
export const deleteInboxCategory = (id: number) => {
  return request.delete<unknown, ApiResponseDto<{ message: string }>>(
    `/api/v1/inbox/categories/${id}`
  );
};
