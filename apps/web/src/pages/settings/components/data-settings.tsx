import { view } from '@rabjs/react';
import { echoeSettingsService } from '../../../services/echoe-settings.service';
import { toast } from '../../../services/toast.service';

export const DataSettings = view(() => {
  const handleExport = async () => {
    const blob = await echoeSettingsService.exportAll(true);
    if (blob) {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `echoe_backup_${new Date().toISOString().split('T')[0]}.apkg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('导出成功');
    } else {
      toast.error('导出失败');
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">数据管理</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">导出与备份</p>
      </div>

      <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">数据管理</h2>
        <div className="space-y-4">
          {/* Export All */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-900 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-50">导出所有数据</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                下载所有卡组为 .apkg 文件（含进度数据）
              </p>
            </div>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              导出
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
