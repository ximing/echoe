import { useEffect, useState } from 'react';
import { view } from '@rabjs/react';
import { echoeSettingsService } from '../../../services/echoe-settings.service';
import { toast } from '../../../services/toast.service';

export const DisplaySettings = view(() => {
  const [isSaving, setIsSaving] = useState(false);

  const settings = echoeSettingsService.settings;
  const isLoading = echoeSettingsService.isLoadingSettings;

  useEffect(() => {
    echoeSettingsService.loadSettings();
  }, []);

  const handleSettingChange = async (key: string, value: unknown) => {
    if (!settings) return;

    setIsSaving(true);
    const success = await echoeSettingsService.updateSettings({ [key]: value });
    setIsSaving(false);

    if (success) {
      toast.success('设置已保存');
    } else {
      toast.error('保存失败');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">显示设置</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">自定义卡片外观</p>
      </div>

      {settings && (
        <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">显示选项</h2>
          <div className="space-y-4">
            {/* Font Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                卡片字体大小
              </label>
              <select
                value={settings.fontSize}
                onChange={(e) => handleSettingChange('fontSize', e.target.value)}
                className="w-40 px-3 py-2 border border-gray-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-colors"
              >
                <option value="small">小</option>
                <option value="medium">中</option>
                <option value="large">大</option>
              </select>
            </div>

            {/* Theme */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                主题
              </label>
              <select
                value={settings.theme}
                onChange={(e) => handleSettingChange('theme', e.target.value)}
                className="w-40 px-3 py-2 border border-gray-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-colors"
              >
                <option value="auto">跟随系统</option>
                <option value="light">亮色</option>
                <option value="dark">暗色</option>
              </select>
            </div>

            {/* Flip Animation */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="flipAnimation"
                checked={settings.flipAnimation}
                onChange={(e) => handleSettingChange('flipAnimation', e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="flipAnimation" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                启用卡片翻转动画
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isSaving && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-40">
          <div className="bg-white dark:bg-dark-800 rounded-lg px-6 py-4 shadow-lg">
            <div className="text-gray-700 dark:text-gray-300">保存中...</div>
          </div>
        </div>
      )}
    </div>
  );
});
