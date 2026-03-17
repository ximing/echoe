import { useState, useEffect, useRef } from 'react';
import { view, useService } from '@rabjs/react';
import { ApiTokenService } from '../../../services/api-token.service';
import { Key, Plus, Trash2, Copy, AlertCircle } from 'lucide-react';
import { toast } from '../../../services/toast.service';
import type { ApiTokenListItemDto } from '@echoe/dto';

export const ApiTokenSettings = view(() => {
  const apiTokenService = useService(ApiTokenService);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [, setCopiedTokenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  // Load tokens on mount
  useEffect(() => {
    apiTokenService.loadTokens();
  }, []);

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = tokenName.trim();
    if (!trimmedName) {
      toast.warning('请输入 Token 名称');
      return;
    }

    if (trimmedName.length > 255) {
      toast.warning('Token 名称不能超过 255 个字符');
      return;
    }

    try {
      const result = await apiTokenService.createToken(trimmedName);
      setCreatedToken(result.token);
      setTokenName('');
      setIsCreateDialogOpen(false);
      toast.success('API Token 创建成功');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败');
    }
  };

  const handleCopyToken = async (token: string, tokenId?: string) => {
    try {
      await navigator.clipboard.writeText(token);
      if (tokenId) {
        setCopiedTokenId(tokenId);
        setTimeout(() => setCopiedTokenId(null), 2000);
      }
      toast.success('Token 已复制到剪贴板');
    } catch {
      toast.error('复制失败');
    }
  };

  const handleDeleteToken = async (tokenId: string) => {
    try {
      await apiTokenService.deleteToken(tokenId);
      setDeleteConfirmId(null);
      toast.success('Token 已删除');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  const handleCloseCreatedTokenDialog = () => {
    setCreatedToken(null);
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">API Token 管理</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            创建和管理用于 API 访问的 Token
          </p>
        </div>
        <button
          onClick={() => setIsCreateDialogOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>创建 Token</span>
        </button>
      </div>

      {/* Token List */}
      <div className="bg-white dark:bg-dark-800 rounded-lg overflow-hidden">
        {apiTokenService.isLoading && apiTokenService.tokens.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
            <p>加载中...</p>
          </div>
        ) : apiTokenService.tokens.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无 API Token</p>
            <p className="text-sm mt-1">点击上方"创建 Token"按钮开始</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-dark-700">
            {apiTokenService.tokens.map((token: ApiTokenListItemDto) => (
              <div
                key={token.tokenId}
                className="p-4 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
                          {token.name}
                        </h3>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>创建于 {formatDate(token.createdAt)}</span>
                          <span className="font-mono">{token.tokenId}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {deleteConfirmId === token.tokenId ? (
                      <>
                        <button
                          onClick={() => handleDeleteToken(token.tokenId)}
                          className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                        >
                          确认删除
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-dark-600 hover:bg-gray-300 dark:hover:bg-dark-500 text-gray-700 dark:text-gray-300 rounded transition-colors"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(token.tokenId)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="删除 Token"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Token Dialog */}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">
              创建 API Token
            </h2>
            <form onSubmit={handleCreateToken} className="space-y-4">
              <div>
                <label
                  htmlFor="tokenName"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Token 名称
                </label>
                <input
                  type="text"
                  id="tokenName"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-colors"
                  placeholder="例如：移动端应用"
                  autoFocus
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  为 Token 设置一个易于识别的名称
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setTokenName('');
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={apiTokenService.isLoading}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {apiTokenService.isLoading ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Created Token Dialog - Show token only once */}
      {createdToken && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  Token 创建成功
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  请立即复制并保存此 Token，关闭后将无法再次查看
                </p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-dark-900 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  API Token
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={tokenInputRef}
                  type="text"
                  value={createdToken}
                  readOnly
                  className="flex-1 px-3 py-2 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded text-sm font-mono text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={() => handleCopyToken(createdToken)}
                  className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors flex items-center gap-2"
                  title="复制 Token"
                >
                  <Copy className="w-4 h-4" />
                  <span className="text-sm">复制</span>
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleCloseCreatedTokenDialog}
                className="px-4 py-2 bg-gray-200 dark:bg-dark-600 hover:bg-gray-300 dark:hover:bg-dark-500 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              >
                我已保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
