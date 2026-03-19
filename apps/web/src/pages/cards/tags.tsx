import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { ToastService } from '../../services/toast.service';
import * as echoeApi from '../../api/echoe';
import type { EchoeTagDto } from '../../api/echoe';
import {
  Search,
  Edit3,
  Trash2,
  Merge,
  X,
  Check,
  Tag,
} from 'lucide-react';

export default function TagsPage() {
  return <TagsPageContent />;
}

const TagsPageContent = view(() => {
  const toastService = useService(ToastService);

  // State
  const [tags, setTags] = useState<EchoeTagDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');

  // Load tags
  const loadTags = async () => {
    setLoading(true);
    try {
      const res = await echoeApi.getTags();
      if (res.code === 0) {
        setTags(res.data);
      }
    } catch (error) {
      console.error('Failed to load tags:', error);
      toastService.error('加载标签失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter tags by search
  const filteredTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle rename
  const handleStartRename = (tag: EchoeTagDto) => {
    setEditingTag(tag.name);
    setEditValue(tag.name);
  };

  const handleCancelRename = () => {
    setEditingTag(null);
    setEditValue('');
  };

  const handleSaveRename = async () => {
    if (!editingTag || !editValue.trim()) {
      toastService.error('标签名称不能为空');
      return;
    }

    if (editingTag === editValue.trim()) {
      handleCancelRename();
      return;
    }

    try {
      const res = await echoeApi.renameTag(editingTag, editValue.trim());
      if (res.code === 0) {
        toastService.success(`已重命名为「${editValue.trim()}」（${res.data.updated} 张卡片已更新）`);
        loadTags();
      } else {
        toastService.error('重命名标签失败');
      }
    } catch (error) {
      console.error('Failed to rename tag:', error);
      toastService.error('重命名标签失败');
    }

    handleCancelRename();
  };

  // Handle delete
  const handleDelete = async (tag: EchoeTagDto) => {
    if (tag.count > 0) {
      toastService.error(`无法删除：${tag.count} 张卡片正在使用此标签`);
      return;
    }

    if (!confirm(`确定删除标签「${tag.name}」吗？`)) {
      return;
    }

    try {
      const res = await echoeApi.deleteTag(tag.name);
      if (res.code === 0) {
        toastService.success('标签已删除');
        loadTags();
      } else {
        toastService.error('删除标签失败');
      }
    } catch (error) {
      console.error('Failed to delete tag:', error);
      toastService.error('删除标签失败');
    }
  };

  // Handle merge dialog
  const handleStartMerge = (tag: EchoeTagDto) => {
    setMergeSource(tag.name);
    setMergeTarget('');
    setIsMergeDialogOpen(true);
  };

  const handleMerge = async () => {
    if (!mergeSource || !mergeTarget.trim()) {
      toastService.error('请选择源标签和目标标签');
      return;
    }

    if (mergeSource === mergeTarget.trim()) {
      toastService.error('源标签和目标标签不能相同');
      return;
    }

    try {
      const res = await echoeApi.mergeTags(mergeSource, mergeTarget.trim());
      if (res.code === 0) {
        toastService.success(`已将「${mergeSource}」合并到「${mergeTarget.trim()}」（${res.data.updated} 张卡片已更新）`);
        loadTags();
        setIsMergeDialogOpen(false);
      } else {
        toastService.error('合并标签失败');
      }
    } catch (error) {
      console.error('Failed to merge tags:', error);
      toastService.error('合并标签失败');
    }
  };

  // Handle key press for rename
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      handleCancelRename();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-dark-900 transition-colors">
      {/* Header - Single Row */}
      <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Title Section */}
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">标签管理</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                共 {tags.length} 个标签
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-8 w-px bg-gray-200 dark:bg-dark-700" />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-gray-100 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Tag List */}
      <div className="px-4 pb-4">
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
        ) : filteredTags.length === 0 ? (
          <div className="text-center py-8">
            <Tag className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery ? '没有匹配的标签' : '暂无标签'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTags.map((tag) => (
              <div
                key={tag.name}
                className="flex items-center gap-3 p-3 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg"
              >
                {editingTag === tag.name ? (
                  <>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      autoFocus
                      className="flex-1 px-2 py-1 bg-gray-100 dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded text-gray-900 dark:text-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      onClick={handleSaveRename}
                      className="p-1 text-green-600 hover:text-green-700"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleCancelRename}
                      className="p-1 text-gray-500 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <Tag className="w-4 h-4 text-gray-400" />
                    <span className="flex-1 text-gray-900 dark:text-gray-50 font-medium">
                      {tag.name}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {tag.count} 张卡片
                    </span>
                    <button
                      onClick={() => handleStartRename(tag)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-dark-700"
                      title="重命名"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleStartMerge(tag)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-dark-700"
                      title="合并到其他标签"
                    >
                      <Merge className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tag)}
                      disabled={tag.count > 0}
                      className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-700 ${
                        tag.count > 0
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400'
                      }`}
                      title={tag.count > 0 ? `无法删除：${tag.count} 张卡片正在使用此标签` : '删除'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Merge Dialog */}
      {isMergeDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
              合并标签
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  源标签（将被移除）
                </label>
                <input
                  type="text"
                  value={mergeSource}
                  disabled
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded text-gray-500 dark:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  目标标签（将保留）
                </label>
                <input
                  type="text"
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  placeholder="输入目标标签名称"
                  className="w-full px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                所有包含「{mergeSource}」的卡片都将更新为使用「{mergeTarget || '（目标）'}」。
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsMergeDialogOpen(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleMerge}
                disabled={!mergeTarget.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                合并
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
