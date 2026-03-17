import { Service } from '@rabjs/react';
import type {
  InboxListItemDto,
  CreateInboxDto,
  UpdateInboxDto,
  InboxQueryParams,
  SourceDto,
  CategoryDto,
} from '@echoe/dto';
import * as inboxApi from '../api/inbox.js';
import * as inboxSourceCategoryApi from '../api/inbox-source-category.js';
import { toast } from './toast.service.js';

interface InboxListState {
  items: InboxListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class InboxService extends Service {
  list: InboxListState = {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  };

  isLoading = false;
  error: string | null = null;
  filters: { source?: string; category?: string; isRead?: boolean } = {};

  sources: SourceDto[] = [];
  categories: CategoryDto[] = [];
  isLoadingOptions = false;

  async loadInboxItems(params?: InboxQueryParams) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await inboxApi.getInboxItems({
        page: params?.page ?? this.list.page,
        limit: params?.limit ?? this.list.limit,
        source: params?.source ?? this.filters.source,
        category: params?.category ?? this.filters.category,
        isRead: params?.isRead ?? this.filters.isRead,
        sortBy: params?.sortBy ?? 'createdAt',
        order: params?.order ?? 'desc',
      });
      const data = response.data;
      if (!data) {
        throw new Error(response.msg || 'Failed to load inbox items');
      }

      this.list = {
        items: data.items,
        total: data.total,
        page: data.page,
        limit: data.pageSize,
        totalPages: data.totalPages,
      };
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load inbox items';
      toast.error(this.error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadSourcesAndCategories() {
    this.isLoadingOptions = true;
    try {
      const [sourcesResponse, categoriesResponse] = await Promise.all([
        inboxSourceCategoryApi.getInboxSources(),
        inboxSourceCategoryApi.getInboxCategories(),
      ]);
      this.sources = sourcesResponse.data?.sources ?? [];
      this.categories = categoriesResponse.data?.categories ?? [];

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sources and categories';
      toast.error(message);
    } finally {
      this.isLoadingOptions = false;
    }
  }

  async createInboxItem(data: CreateInboxDto) {
    try {
      const response = await inboxApi.createInboxItem(data);
      toast.success('收件箱项目已创建');
      await this.loadInboxItems();
      return response.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create inbox item';
      toast.error(message);
      throw err;
    }
  }

  async updateInboxItem(inboxId: string, data: UpdateInboxDto) {
    try {
      await inboxApi.updateInboxItem(inboxId, data);
      toast.success('收件箱项目已更新');
      await this.loadInboxItems();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update inbox item';
      toast.error(message);
      throw err;
    }
  }

  async deleteInboxItem(inboxId: string) {
    try {
      await inboxApi.deleteInboxItem(inboxId);
      toast.success('收件箱项目已删除');
      await this.loadInboxItems();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete inbox item';
      toast.error(message);
      throw err;
    }
  }

  async markAsRead(inboxId: string) {
    try {
      await inboxApi.markInboxItemRead(inboxId);
      toast.success('已标记为已读');
      await this.loadInboxItems();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark as read';
      toast.error(message);
      throw err;
    }
  }

  async markAllAsRead() {
    try {
      const response = await inboxApi.markAllInboxItemsRead();
      const updatedCount = response.data?.updatedCount;
      toast.success(
        typeof updatedCount === 'number' ? `已将 ${updatedCount} 个项目标记为已读` : '已全部标记为已读'
      );
      await this.loadInboxItems();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark all as read';
      toast.error(message);
      throw err;
    }
  }

  async organizeInboxItem(inboxId: string, async = false) {
    try {
      const response = await inboxApi.organizeInboxItem(inboxId, async);
      const data = response.data;
      if (!data) {
        throw new Error(response.msg || 'Failed to organize inbox item');
      }

      if (data.fallback) {
        toast.warning('AI 整理服务暂时不可用，已保留原始内容');
      } else {
        toast.success('AI 整理完成');
      }
      await this.loadInboxItems();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to organize inbox item';
      toast.error(message);
      throw err;
    }
  }

  async convertToCard(inboxId: string, deckId?: string, notetypeId?: string) {
    try {
      const response = await inboxApi.convertInboxToCard(inboxId, { deckId, notetypeId });
      const data = response.data;
      if (!data) {
        throw new Error(response.msg || 'Failed to convert to card');
      }

      if (data.aiRecommended) {
        toast.success('已使用 AI 推荐转换为卡片');
      } else {
        toast.success('已转换为卡片');
      }
      await this.loadInboxItems();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to convert to card';
      toast.error(message);
      throw err;
    }
  }

  setFilters(filters: { source?: string; category?: string; isRead?: boolean }) {
    this.filters = filters;
    this.list.page = 1; // Reset to first page when filters change
    this.loadInboxItems();
  }

  setPage(page: number) {
    this.list.page = page;
    this.loadInboxItems();
  }

  clearFilters() {
    this.filters = {};
    this.list.page = 1;
    this.loadInboxItems();
  }
}
