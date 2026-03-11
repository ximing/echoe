import { useEffect, useState } from 'react';
import { view } from '@rabjs/react';
import { echoeSettingsService } from '../../../services/echoe-settings.service';
import { toast } from '../../../services/toast.service';
import { X } from 'lucide-react';

export const PresetSettings = view(() => {
  const [presetName, setPresetName] = useState('');
  const [showPresetDialog, setShowPresetDialog] = useState(false);

  const settings = echoeSettingsService.settings;
  const presets = echoeSettingsService.presets;
  const isLoadingPresets = echoeSettingsService.isLoadingPresets;

  useEffect(() => {
    echoeSettingsService.loadSettings();
    echoeSettingsService.loadPresets();
  }, []);

  const handleSavePreset = async () => {
    if (!presetName.trim() || !settings) return;

    // Create a preset from current settings
    const config = {
      new: {
        perDay: settings.newLimit,
      },
      rev: {
        perDay: settings.reviewLimit,
      },
    };

    const success = await echoeSettingsService.savePreset(presetName, config);
    if (success) {
      toast.success('预设已保存');
      setPresetName('');
      setShowPresetDialog(false);
    } else {
      toast.error('保存预设失败');
    }
  };

  const handleDeletePreset = async (id: string) => {
    const success = await echoeSettingsService.deletePreset(id);
    if (success) {
      toast.success('预设已删除');
    } else {
      toast.error('删除预设失败');
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">预设配置</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">保存与复用学习配置</p>
      </div>

      <div className="bg-white dark:bg-dark-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">卡组配置预设</h2>
          <button
            onClick={() => setShowPresetDialog(true)}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            保存当前为预设
          </button>
        </div>

        {isLoadingPresets ? (
          <div className="text-gray-500 dark:text-gray-400">加载预设中...</div>
        ) : presets.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-8">
            暂无预设。将当前设置保存为预设，以便快速应用到卡组。
          </div>
        ) : (
          <div className="space-y-3">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-900 rounded-lg"
              >
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-50">{preset.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    创建于: {new Date(preset.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDeletePreset(preset.id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Preset Dialog */}
      {showPresetDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-800 rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-50 mb-4">保存预设</h3>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="预设名称"
              className="w-full px-3 py-2 border border-gray-200 dark:border-dark-700 rounded-lg mb-4 bg-white dark:bg-dark-900 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-colors"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowPresetDialog(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleSavePreset}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
