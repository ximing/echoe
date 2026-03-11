import { view, useService } from '@rabjs/react';
import { useEffect, useState } from 'react';
import { ToastService } from '../../services/toast.service';
import * as echoeApi from '../../api/echoe';
import type { EchoeMediaDto } from '../../api/echoe';
import {
  Search,
  Image,
  Music,
  Video,
  FileText,
  Loader2,
} from 'lucide-react';

export default function MediaPage() {
  return <MediaPageContent />;
}

const MediaPageContent = view(() => {
  const toastService = useService(ToastService);

  // State
  const [mediaFiles, setMediaFiles] = useState<EchoeMediaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [unusedFiles, setUnusedFiles] = useState<string[]>([]);
  const [checkingUnused, setCheckingUnused] = useState(false);
  const [selectedFile, setSelectedFile] = useState<EchoeMediaDto | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load media files
  const loadMedia = async () => {
    setLoading(true);
    try {
      const res = await echoeApi.getMedia();
      if (res.code === 0) {
        setMediaFiles(res.data);
      }
    } catch (error) {
      console.error('Failed to load media:', error);
      toastService.error('Failed to load media files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  // Filter media by search
  const filteredMedia = mediaFiles.filter((file) =>
    file.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate totals
  const totalSize = mediaFiles.reduce((sum, file) => sum + file.size, 0);
  const totalSizeFormatted = formatFileSize(totalSize);
  const usedCount = mediaFiles.filter((f) => f.usedInCards).length;
  const unusedCount = mediaFiles.filter((f) => !f.usedInCards).length;

  // Handle check unused
  const handleCheckUnused = async () => {
    setCheckingUnused(true);
    try {
      const res = await echoeApi.checkUnusedMedia();
      if (res.code === 0) {
        setUnusedFiles(res.data.unusedFiles);
        toastService.success(`Found ${res.data.unusedFiles.length} unused files`);
      } else {
        toastService.error('Failed to check unused files');
      }
    } catch (error) {
      console.error('Failed to check unused:', error);
      toastService.error('Failed to check unused files');
    } finally {
      setCheckingUnused(false);
    }
  };

  // Handle delete unused
  const handleDeleteUnused = async () => {
    const filesToDelete = unusedFiles.length > 0 ? unusedFiles : mediaFiles
      .filter((f) => !f.usedInCards)
      .map((f) => f.filename);

    if (filesToDelete.length === 0) {
      toastService.error('No unused files to delete');
      return;
    }

    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    const filesToDelete = unusedFiles.length > 0 ? unusedFiles : mediaFiles
      .filter((f) => !f.usedInCards)
      .map((f) => f.filename);

    setDeleting(true);
    try {
      const res = await echoeApi.deleteMediaBulk(filesToDelete);
      if (res.code === 0) {
        toastService.success(`Deleted ${filesToDelete.length} files`);
        setUnusedFiles([]);
        loadMedia();
      } else {
        toastService.error('Failed to delete files');
      }
    } catch (error) {
      console.error('Failed to delete:', error);
      toastService.error('Failed to delete files');
    } finally {
      setDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  // Get file icon based on mime type
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <Image className="w-5 h-5 text-blue-500" />;
    }
    if (mimeType.startsWith('audio/')) {
      return <Music className="w-5 h-5 text-green-500" />;
    }
    if (mimeType.startsWith('video/')) {
      return <Video className="w-5 h-5 text-purple-500" />;
    }
    return <FileText className="w-5 h-5 text-gray-500" />;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-dark-900">
      {/* Header */}
      <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Media Manager</h1>
          <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
            {mediaFiles.length} files ({totalSizeFormatted})
          </span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-4 py-2 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Used:</span>
          <span className="text-sm font-medium text-green-600 dark:text-green-400">{usedCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Unused:</span>
          <span className="text-sm font-medium text-orange-600 dark:text-orange-400">{unusedCount}</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleCheckUnused}
          disabled={checkingUnused}
          className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-600 disabled:opacity-50"
        >
          {checkingUnused ? (
            <>
              <Loader2 className="w-4 h-4 inline-block mr-1 animate-spin" />
              Checking...
            </>
          ) : (
            'Check Unused'
          )}
        </button>
        {(unusedFiles.length > 0 || mediaFiles.filter((f) => !f.usedInCards).length > 0) && (
          <button
            onClick={handleDeleteUnused}
            className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
          >
            Delete Unused ({unusedFiles.length > 0 ? unusedFiles.length : mediaFiles.filter((f) => !f.usedInCards).length})
          </button>
        )}
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search media files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Media List */}
      <div className="px-4 pb-4">
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            Loading...
          </div>
        ) : filteredMedia.length === 0 ? (
          <div className="text-center py-8">
            <Image className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No media files match your search' : 'No media files yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredMedia.map((file) => (
              <div
                key={file.id}
                onClick={() => setSelectedFile(file)}
                className={`flex items-center gap-3 p-3 bg-white dark:bg-dark-800 border rounded-lg cursor-pointer transition-colors ${
                  selectedFile?.id === file.id
                    ? 'border-primary-500 ring-2 ring-primary-500/20'
                    : 'border-gray-200 dark:border-dark-700 hover:border-gray-300 dark:hover:border-dark-600'
                }`}
              >
                {getFileIcon(file.mimeType)}
                <div className="flex-1 min-w-0">
                  <div className="text-gray-900 dark:text-white font-medium truncate">
                    {file.filename}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {formatFileSize(file.size)} • {file.mimeType}
                  </div>
                </div>
                {unusedFiles.includes(file.filename) || (!file.usedInCards && unusedFiles.length === 0) ? (
                  <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                    Unused
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                    Used
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Delete Unused Files
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to delete {unusedFiles.length > 0 ? unusedFiles.length : mediaFiles.filter((f) => !f.usedInCards).length} unused file(s)? This action cannot be undone.
            </p>
            <div className="max-h-48 overflow-y-auto mb-4 p-2 bg-gray-100 dark:bg-dark-700 rounded text-sm">
              {(unusedFiles.length > 0 ? unusedFiles : mediaFiles.filter((f) => !f.usedInCards).map((f) => f.filename)).map((filename) => (
                <div key={filename} className="text-gray-700 dark:text-gray-300 truncate">
                  {filename}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsDeleteDialogOpen(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 inline-block mr-1 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
