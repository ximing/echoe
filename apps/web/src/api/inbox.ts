import type {
  InboxDto,
  InboxListItemDto,
  CreateInboxDto,
  UpdateInboxDto,
  AiOrganizeResponseDto,
  ApiResponseDto,
} from '@echoe/dto';
import request from '../utils/request';

/**
 * Inbox list response with pagination
 */
export interface InboxListResponse {
  items: InboxListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get inbox items with pagination and filters
 */
export const getInboxItems = (params?: {
  page?: number;
  limit?: number;
  category?: string;
  isRead?: number;
}) => {
  return request.get<unknown, ApiResponseDto<InboxListResponse>>('/api/v1/inbox', { params });
};

/**
 * Get a single inbox item by ID
 */
export const getInboxItem = (inboxId: string) => {
  return request.get<unknown, ApiResponseDto<InboxDto>>(`/api/v1/inbox/${inboxId}`);
};

/**
 * Create a new inbox item
 */
export const createInboxItem = (data: CreateInboxDto) => {
  return request.post<CreateInboxDto, ApiResponseDto<InboxDto>>('/api/v1/inbox', data);
};

/**
 * Update an inbox item
 */
export const updateInboxItem = (inboxId: string, data: UpdateInboxDto) => {
  return request.put<UpdateInboxDto, ApiResponseDto<InboxDto>>(`/api/v1/inbox/${inboxId}`, data);
};

/**
 * Delete an inbox item (soft delete)
 */
export const deleteInboxItem = (inboxId: string) => {
  return request.delete<unknown, ApiResponseDto<{ message: string }>>(
    `/api/v1/inbox/${inboxId}`
  );
};

/**
 * Mark a single inbox item as read
 */
export const markInboxItemRead = (inboxId: string) => {
  return request.post<unknown, ApiResponseDto<{ message: string }>>(
    `/api/v1/inbox/${inboxId}/read`
  );
};

/**
 * Mark all unread inbox items as read
 */
export const markAllInboxItemsRead = () => {
  return request.post<unknown, ApiResponseDto<{ updatedCount: number; message: string }>>(
    '/api/v1/inbox/read-all'
  );
};

/**
 * AI organize inbox item content
 * Handles 503 AI unavailable responses with fallback
 */
export const organizeInboxItem = async (inboxId: string, async?: boolean) => {
  try {
    const params = async ? { async: 'true' } : undefined;
    return await request.post<unknown, ApiResponseDto<AiOrganizeResponseDto>>(
      `/api/v1/inbox/${inboxId}/organize`,
      {},
      { params }
    );
  } catch (error: unknown) {
    // Handle 503 AI service unavailable
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 503) {
        throw new Error('AI service is temporarily unavailable. Please try again later.');
      }
    }
    throw error;
  }
};

/**
 * Convert inbox item to card
 */
export const convertInboxToCard = (
  inboxId: string,
  data: {
    deckId?: string;
    notetypeId?: string;
    fieldMapping?: Record<string, string>;
  }
) => {
  return request.post<
    typeof data,
    ApiResponseDto<{
      noteId: string;
      cardId: string;
      deckId: string;
      notetypeId: string;
      aiRecommended: boolean;
      deckName: string;
      notetypeName: string;
    }>
  >(`/api/v1/inbox/${inboxId}/to-card`, data);
};
