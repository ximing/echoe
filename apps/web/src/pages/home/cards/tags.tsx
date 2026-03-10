import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ToastService } from '../../../services/toast.service';
import * as echoeApi from '../../../api/echoe';
import type { EchoeTagDto } from '../../../api/echoe';
import {
  ArrowLeft,
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
  const navigate = useNavigate();

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
      toastService.error('Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
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
      toastService.error('Tag name cannot be empty');
      return;
    }

    if (editingTag === editValue.trim()) {
      handleCancelRename();
      return;
    }

    try {
      const res = await echoeApi.renameTag(editingTag, editValue.trim());
      if (res.code === 0) {
        toastService.success(`Renamed to "${editValue.trim()}" (${res.data.updated} notes updated)`);
        loadTags();
      } else {
        toastService.error('Failed to rename tag');
      }
    } catch (error) {
      console.error('Failed to rename tag:', error);
      toastService.error('Failed to rename tag');
    }

    handleCancelRename();
  };

  // Handle delete
  const handleDelete = async (tag: EchoeTagDto) => {
    if (tag.count > 0) {
      toastService.error(`Cannot delete: ${tag.count} notes still use this tag`);
      return;
    }

    if (!confirm(`Delete tag "${tag.name}"?`)) {
      return;
    }

    try {
      const res = await echoeApi.deleteTag(tag.name);
      if (res.code === 0) {
        toastService.success('Tag deleted');
        loadTags();
      } else {
        toastService.error('Failed to delete tag');
      }
    } catch (error) {
      console.error('Failed to delete tag:', error);
      toastService.error('Failed to delete tag');
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
      toastService.error('Please select both source and target tags');
      return;
    }

    if (mergeSource === mergeTarget.trim()) {
      toastService.error('Source and target must be different');
      return;
    }

    try {
      const res = await echoeApi.mergeTags(mergeSource, mergeTarget.trim());
      if (res.code === 0) {
        toastService.success(`Merged "${mergeSource}" into "${mergeTarget.trim()}" (${res.data.updated} notes updated)`);
        loadTags();
        setIsMergeDialogOpen(false);
      } else {
        toastService.error('Failed to merge tags');
      }
    } catch (error) {
      console.error('Failed to merge tags:', error);
      toastService.error('Failed to merge tags');
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/cards')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Tag Manager</h1>
          <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
            {tags.length} tags
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
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
              {searchQuery ? 'No tags match your search' : 'No tags yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTags.map((tag) => (
              <div
                key={tag.name}
                className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                {editingTag === tag.name ? (
                  <>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      autoFocus
                      className="flex-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                    <span className="flex-1 text-gray-900 dark:text-white font-medium">
                      {tag.name}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {tag.count} {tag.count === 1 ? 'note' : 'notes'}
                    </span>
                    <button
                      onClick={() => handleStartRename(tag)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Rename"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleStartMerge(tag)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Merge into another tag"
                    >
                      <Merge className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tag)}
                      disabled={tag.count > 0}
                      className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        tag.count > 0
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400'
                      }`}
                      title={tag.count > 0 ? `Cannot delete: ${tag.count} notes use this tag` : 'Delete'}
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
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Merge Tag
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Source tag (will be removed)
                </label>
                <input
                  type="text"
                  value={mergeSource}
                  disabled
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-500 dark:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Target tag (will be kept)
                </label>
                <input
                  type="text"
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  placeholder="Enter target tag name"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                All notes with "{mergeSource}" will be updated to use "{mergeTarget || '(target)'}" instead.
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsMergeDialogOpen(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={!mergeTarget.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
