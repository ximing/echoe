import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { InboxService } from '../../services/inbox.service.js';
import type { InboxListItemDto } from '@echoe/dto';
import { InboxCategory } from '@echoe/dto';
import {
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  CheckCheck,
  Sparkles,
  CreditCard,
  Filter,
  X,
} from 'lucide-react';

export const InboxPage = view(() => {
  const inboxService = useService(InboxService);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InboxListItemDto | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    inboxService.loadInboxItems();
  }, []);

  const handleCreate = () => {
    setShowCreateDialog(true);
  };

  const handleEdit = (item: InboxListItemDto) => {
    setSelectedItem(item);
    setShowEditDialog(true);
  };

  const handleDelete = (item: InboxListItemDto) => {
    setSelectedItem(item);
    setShowDeleteDialog(true);
  };

  const handleOrganize = async (item: InboxListItemDto) => {
    await inboxService.organizeInboxItem(item.inboxId);
  };

  const handleConvertToCard = (item: InboxListItemDto) => {
    setSelectedItem(item);
    setShowConvertDialog(true);
  };

  const handleMarkAsRead = async (item: InboxListItemDto) => {
    await inboxService.markAsRead(item.inboxId);
  };

  const handleMarkAllAsRead = async () => {
    await inboxService.markAllAsRead();
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-dark-900">
      {/* Header */}
      <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">收件箱</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理您的捕获内容，使用 AI 整理并转换为卡片
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-600 transition-colors flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              筛选
            </button>
            <button
              onClick={handleMarkAllAsRead}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-600 transition-colors flex items-center gap-2"
              disabled={inboxService.isLoading}
            >
              <CheckCheck className="w-4 h-4" />
              全部已读
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              新建
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-dark-700 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  分类:
                </label>
                <select
                  value={inboxService.filters.category ?? ''}
                  onChange={(e) =>
                    inboxService.setFilters({
                      ...inboxService.filters,
                      category: e.target.value as InboxCategory | undefined,
                    })
                  }
                  className="px-3 py-1.5 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg text-sm"
                >
                  <option value="">全部</option>
                  <option value="backend">后端</option>
                  <option value="frontend">前端</option>
                  <option value="design">设计</option>
                  <option value="product">产品</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  状态:
                </label>
                <select
                  value={
                    inboxService.filters.isRead === undefined
                      ? ''
                      : inboxService.filters.isRead
                        ? 'read'
                        : 'unread'
                  }
                  onChange={(e) =>
                    inboxService.setFilters({
                      ...inboxService.filters,
                      isRead:
                        e.target.value === ''
                          ? undefined
                          : e.target.value === 'read'
                            ? true
                            : false,
                    })
                  }
                  className="px-3 py-1.5 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg text-sm"
                >
                  <option value="">全部</option>
                  <option value="unread">未读</option>
                  <option value="read">已读</option>
                </select>
              </div>
              <button
                onClick={() => inboxService.clearFilters()}
                className="ml-auto px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
              >
                清除筛选
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {inboxService.isLoading && inboxService.list.items.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : inboxService.list.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            <Plus className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无收件箱项目</p>
            <p className="text-sm mt-2">点击右上角"新建"按钮创建第一个项目</p>
          </div>
        ) : (
          <div className="space-y-4">
            {inboxService.list.items.map((item) => (
              <div
                key={item.inboxId}
                className={`bg-white dark:bg-dark-800 rounded-lg border ${
                  item.isRead
                    ? 'border-gray-200 dark:border-dark-700'
                    : 'border-blue-200 dark:border-blue-800'
                } p-4 hover:shadow-md transition-shadow`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          item.isRead
                            ? 'bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300'
                            : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {item.isRead ? '已读' : '未读'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                        {item.category}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {item.source}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          正面:
                        </span>
                        <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                          {item.front}
                        </p>
                      </div>
                      {item.back && (
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                            背面:
                          </span>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            {item.back}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      创建于 {new Date(item.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    {!item.isRead && (
                      <button
                        onClick={() => handleMarkAsRead(item)}
                        className="p-2 text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 transition-colors"
                        title="标记为已读"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleOrganize(item)}
                      className="p-2 text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors"
                      title="AI 整理"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleConvertToCard(item)}
                      className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                      title="转换为卡片"
                    >
                      <CreditCard className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                      title="编辑"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {inboxService.list.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => inboxService.setPage(inboxService.list.page - 1)}
              disabled={inboxService.list.page === 1 || inboxService.isLoading}
              className="px-4 py-2 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
            >
              上一页
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              第 {inboxService.list.page} / {inboxService.list.totalPages} 页
            </span>
            <button
              onClick={() => inboxService.setPage(inboxService.list.page + 1)}
              disabled={
                inboxService.list.page === inboxService.list.totalPages || inboxService.isLoading
              }
              className="px-4 py-2 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateInboxDialog
          onClose={() => setShowCreateDialog(false)}
          onSubmit={async (data) => {
            await inboxService.createInboxItem(data);
            setShowCreateDialog(false);
          }}
        />
      )}

      {/* Edit Dialog */}
      {showEditDialog && selectedItem && (
        <EditInboxDialog
          item={selectedItem}
          onClose={() => {
            setShowEditDialog(false);
            setSelectedItem(null);
          }}
          onSubmit={async (data) => {
            await inboxService.updateInboxItem(selectedItem.inboxId, data);
            setShowEditDialog(false);
            setSelectedItem(null);
          }}
        />
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && selectedItem && (
        <DeleteConfirmDialog
          itemName={selectedItem.front}
          onClose={() => {
            setShowDeleteDialog(false);
            setSelectedItem(null);
          }}
          onConfirm={async () => {
            await inboxService.deleteInboxItem(selectedItem.inboxId);
            setShowDeleteDialog(false);
            setSelectedItem(null);
          }}
        />
      )}

      {/* Convert to Card Dialog */}
      {showConvertDialog && selectedItem && (
        <ConvertToCardDialog
          item={selectedItem}
          onClose={() => {
            setShowConvertDialog(false);
            setSelectedItem(null);
          }}
          onSubmit={async (deckId, notetypeId) => {
            await inboxService.convertToCard(selectedItem.inboxId, deckId, notetypeId);
            setShowConvertDialog(false);
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
});

// Create Dialog Component
const CreateInboxDialog = view(
  ({
    onClose,
    onSubmit,
  }: {
    onClose: () => void;
    onSubmit: (data: { front: string; back?: string; category: InboxCategory }) => Promise<void>;
  }) => {
    const [front, setFront] = useState('');
    const [back, setBack] = useState('');
    const [category, setCategory] = useState<InboxCategory>('backend');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!front.trim()) return;

      setIsSubmitting(true);
      try {
        await onSubmit({ front: front.trim(), back: back.trim() || undefined, category });
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-full max-w-2xl mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">新建收件箱项目</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                正面内容 *
              </label>
              <textarea
                value={front}
                onChange={(e) => setFront(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                required
                placeholder="输入正面内容..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                背面内容
              </label>
              <textarea
                value={back}
                onChange={(e) => setBack(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="输入背面内容..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                分类
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as InboxCategory)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="backend">后端</option>
                <option value="frontend">前端</option>
                <option value="design">设计</option>
                <option value="product">产品</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !front.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                创建
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
);

// Edit Dialog Component
const EditInboxDialog = view(
  ({
    item,
    onClose,
    onSubmit,
  }: {
    item: InboxListItemDto;
    onClose: () => void;
    onSubmit: (data: { front?: string; back?: string; category?: InboxCategory }) => Promise<void>;
  }) => {
    const [front, setFront] = useState(item.front);
    const [back, setBack] = useState(item.back ?? '');
    const [category, setCategory] = useState<InboxCategory>(item.category);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!front.trim()) return;

      setIsSubmitting(true);
      try {
        await onSubmit({
          front: front.trim(),
          back: back.trim() || undefined,
          category,
        });
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-full max-w-2xl mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">编辑收件箱项目</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                正面内容 *
              </label>
              <textarea
                value={front}
                onChange={(e) => setFront(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                背面内容
              </label>
              <textarea
                value={back}
                onChange={(e) => setBack(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                分类
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as InboxCategory)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="backend">后端</option>
                <option value="frontend">前端</option>
                <option value="design">设计</option>
                <option value="product">产品</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !front.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                保存
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
);

// Delete Confirm Dialog Component
const DeleteConfirmDialog = view(
  ({
    itemName,
    onClose,
    onConfirm,
  }: {
    itemName: string;
    onClose: () => void;
    onConfirm: () => Promise<void>;
  }) => {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleConfirm = async () => {
      setIsDeleting(true);
      try {
        await onConfirm();
      } finally {
        setIsDeleting(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50 mb-4">确认删除</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            确定要删除项目 "<span className="font-medium">{itemName}</span>" 吗？此操作无法撤销。
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={isDeleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isDeleting && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              删除
            </button>
          </div>
        </div>
      </div>
    );
  }
);

// Convert to Card Dialog Component
const ConvertToCardDialog = view(
  ({
    item,
    onClose,
    onSubmit,
  }: {
    item: InboxListItemDto;
    onClose: () => void;
    onSubmit: (deckId?: string, notetypeId?: string) => Promise<void>;
  }) => {
    const [useAI, setUseAI] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
        if (useAI) {
          // Let AI recommend deck and notetype
          await onSubmit(undefined, undefined);
        } else {
          // TODO: Add manual deck/notetype selection UI
          await onSubmit(undefined, undefined);
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">转换为卡片</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                    AI 智能推荐
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    AI 将根据内容自动选择最合适的卡组和笔记类型
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useAI"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="useAI" className="text-sm text-gray-700 dark:text-gray-300">
                使用 AI 推荐（推荐）
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                转换
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
);
