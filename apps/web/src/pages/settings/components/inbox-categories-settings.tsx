import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import type { SourceDto, CategoryDto } from '@echoe/dto';
import * as inboxSourceCategoryApi from '../../../api/inbox-source-category.js';
import * as inboxApi from '../../../api/inbox.js';
import { toast } from '../../../services/toast.service.js';
import { InboxService } from '../../../services/inbox.service.js';

interface SourceWithCount extends SourceDto {
  inboxCount: number;
}

interface CategoryWithCount extends CategoryDto {
  inboxCount: number;
}

export const InboxCategoriesSettings = view(() => {
  const inboxService = useService(InboxService);
  const [sources, setSources] = useState<SourceWithCount[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newSourceName, setNewSourceName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    type: 'source' | 'category';
    item: SourceDto | CategoryDto;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [sourcesResponse, categoriesResponse] = await Promise.all([
        inboxSourceCategoryApi.getInboxSources(),
        inboxSourceCategoryApi.getInboxCategories(),
      ]);

      // Load inbox counts for each source
      const sourcesWithCounts = await Promise.all(
        sourcesResponse.data.sources.map(async (source) => {
          const countResponse = await inboxApi.getInboxItems({
            page: 1,
            limit: 1,
            source: source.name,
          });
          return { ...source, inboxCount: countResponse.data.total };
        })
      );

      // Load inbox counts for each category
      const categoriesWithCounts = await Promise.all(
        categoriesResponse.data.categories.map(async (category) => {
          const countResponse = await inboxApi.getInboxItems({
            page: 1,
            limit: 1,
            category: category.name,
          });
          return { ...category, inboxCount: countResponse.data.total };
        })
      );

      setSources(sourcesWithCounts);
      setCategories(categoriesWithCounts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceName.trim()) return;

    setIsCreatingSource(true);
    try {
      await inboxSourceCategoryApi.createInboxSource({ name: newSourceName.trim() });
      toast.success('来源已创建');
      setNewSourceName('');
      await loadData();
      await inboxService.loadSourcesAndCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create source');
    } finally {
      setIsCreatingSource(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setIsCreatingCategory(true);
    try {
      await inboxSourceCategoryApi.createInboxCategory({ name: newCategoryName.trim() });
      toast.success('分类已创建');
      setNewCategoryName('');
      await loadData();
      await inboxService.loadSourcesAndCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleDeleteSource = async () => {
    if (!deleteConfirmDialog || deleteConfirmDialog.type !== 'source') return;

    setIsDeleting(true);
    try {
      await inboxSourceCategoryApi.deleteInboxSource(deleteConfirmDialog.item.id);
      toast.success('来源已删除');
      setDeleteConfirmDialog(null);
      await loadData();
      await inboxService.loadSourcesAndCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete source');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteConfirmDialog || deleteConfirmDialog.type !== 'category') return;

    setIsDeleting(true);
    try {
      await inboxSourceCategoryApi.deleteInboxCategory(deleteConfirmDialog.item.id);
      toast.success('分类已删除');
      setDeleteConfirmDialog(null);
      await loadData();
      await inboxService.loadSourcesAndCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-2">
          收件箱来源与分类管理
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          管理您的收件箱来源和分类，自定义组织方式
        </p>
      </div>

      {/* Sources Section */}
      <div className="bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">来源管理</h2>

        {/* Create Source Form */}
        <form onSubmit={handleCreateSource} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              placeholder="输入新来源名称..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!newSourceName.trim() || isCreatingSource}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreatingSource ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Plus className="w-4 h-4" />
              )}
              添加来源
            </button>
          </div>
        </form>

        {/* Sources List */}
        {sources.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            暂无来源，请添加第一个来源
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700 rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {source.name}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {source.inboxCount} 个收件箱项目
                  </div>
                </div>
                <button
                  onClick={() => setDeleteConfirmDialog({ type: 'source', item: source })}
                  className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                  title="删除来源"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Categories Section */}
      <div className="bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">分类管理</h2>

        {/* Create Category Form */}
        <form onSubmit={handleCreateCategory} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="输入新分类名称..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!newCategoryName.trim() || isCreatingCategory}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreatingCategory ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Plus className="w-4 h-4" />
              )}
              添加分类
            </button>
          </div>
        </form>

        {/* Categories List */}
        {categories.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            暂无分类，请添加第一个分类
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700 rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {category.name}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {category.inboxCount} 个收件箱项目
                  </div>
                </div>
                <button
                  onClick={() => setDeleteConfirmDialog({ type: 'category', item: category })}
                  className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                  title="删除分类"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50 mb-2">
                  确认删除
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  确定要删除{deleteConfirmDialog.type === 'source' ? '来源' : '分类'} "
                  <span className="font-medium">{deleteConfirmDialog.item.name}</span>" 吗？
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  关联的收件箱项目的{deleteConfirmDialog.type === 'source' ? '来源' : '分类'}
                  字段将被清空，但项目本身不会被删除。
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmDialog(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={
                  deleteConfirmDialog.type === 'source' ? handleDeleteSource : handleDeleteCategory
                }
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
      )}
    </div>
  );
});
