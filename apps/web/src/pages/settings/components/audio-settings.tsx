import { useEffect, useState } from 'react';
import { view, useService } from '@rabjs/react';
import { EchoeSettingsService } from '../../../services/echoe-settings.service';
import { toast } from '../../../services/toast.service';

export const AudioSettings = view(() => {
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">音频设置</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">配置自动播放与语速</p>
      </div>

      {settings && (
        <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4">音频选项</h2>
          <div className="space-y-4">
            {/* Autoplay */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                自动播放音频
              </label>
              <select
                value={settings.autoplay}
                onChange={(e) => handleSettingChange('autoplay', e.target.value)}
                className="w-40 px-3 py-2 border border-gray-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-colors"
              >
                <option value="front">仅正面</option>
                <option value="back">仅背面</option>
                <option value="both">正反两面</option>
                <option value="never">从不</option>
              </select>
            </div>

            {/* TTS Speed */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                语音播放速度: {settings.ttsSpeed.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={settings.ttsSpeed}
                onChange={(e) => handleSettingChange('ttsSpeed', parseFloat(e.target.value))}
                className="w-64"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>0.5x</span>
                <span>1x</span>
                <span>1.5x</span>
                <span>2x</span>
              </div>
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
