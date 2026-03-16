import type {
  ApiTokenListItemDto,
  CreateApiTokenDto,
  CreateApiTokenResponseDto,
  ApiResponseDto,
} from '@echoe/dto';
import request from '../utils/request';

/**
 * Get all API tokens for current user
 */
export const getApiTokens = () => {
  return request.get<unknown, ApiResponseDto<ApiTokenListItemDto[]>>('/api/v1/api-tokens');
};

/**
 * Create a new API token
 */
export const createApiToken = (data: CreateApiTokenDto) => {
  return request.post<CreateApiTokenDto, ApiResponseDto<CreateApiTokenResponseDto>>(
    '/api/v1/api-tokens',
    data
  );
};

/**
 * Delete an API token by tokenId
 */
export const deleteApiToken = (tokenId: string) => {
  return request.delete<unknown, ApiResponseDto<{ message: string }>>(
    `/api/v1/api-tokens/${tokenId}`
  );
};
