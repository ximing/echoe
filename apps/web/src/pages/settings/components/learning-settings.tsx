import { useEffect, useState } from 'react';
import { view, useService } from '@rabjs/react';
import { EchoeSettingsService } from '../../../services/echoe-settings.service';
import { toast } from '../../../services/toast.service';

export const LearningSettings = view(() => {
  const echoeSettingsService = useService(EchoeSettingsService);
  const [isSaving, setIsSaving] = useState(false);

  const settings = echoeSettingsService.settings;
  const isLoading = echoeSettingsService.isLoadingSettings;

  useEffect(() => {
    echoeSettingsService.loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">学习设置</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">配置每日学习量和时间</p>
      </div>

      {settings && (
        <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">学习选项</h2>
          <div className="space-y-4">
            {/* New Cards Per Day */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                每日新卡上限
              </label>
              <input
                type="number"
                min="0"
                max="9999"
                value={settings.newLimit}
                onChange={(e) => handleSettingChange('newLimit', parseInt(e.target.value) || 0)}
                className="w-32 px-3 py-2 border border-gray-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-colors"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                默认: 20。设为 0 可关闭新卡。
              </p>
            </div>

            {/* Reviews Per Day */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                每日复习上限
              </label>
              <input
                type="number"
                min="0"
                max="9999"
                value={settings.reviewLimit}
                onChange={(e) => handleSettingChange('reviewLimit', parseInt(e.target.value) || 0)}
                className="w-32 px-3 py-2 border border-gray-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-colors"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                默认: 200。设为 0 可关闭复习。
              </p>
            </div>

            {/* Day Start Hour */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                每日起始时刻（小时）
              </label>
              <select
                value={settings.dayStartHour}
                onChange={(e) => handleSettingChange('dayStartHour', parseInt(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-colors"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i.toString().padStart(2, '0')}:00
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                默认: 0（午夜）。控制每日计数重置时间。
              </p>
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
