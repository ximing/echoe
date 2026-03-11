import { useEffect, useState } from 'react';
import { observer } from '@rabjs/react';
import { useNavigate } from 'react-router';
import { echoeSettingsService } from '../../services/echoe-settings.service';
import { toast } from '../../services/toast.service';

const SettingsPage = observer(() => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'learning' | 'display' | 'audio' | 'data' | 'presets'>('learning');
  const [isSaving, setIsSaving] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showPresetDialog, setShowPresetDialog] = useState(false);

  const settings = echoeSettingsService.settings;
  const presets = echoeSettingsService.presets;
  const isLoading = echoeSettingsService.isLoadingSettings;
  const isLoadingPresets = echoeSettingsService.isLoadingPresets;

  useEffect(() => {
    echoeSettingsService.loadSettings();
    echoeSettingsService.loadPresets();
  }, []);

  const handleSettingChange = async (key: string, value: unknown) => {
    if (!settings) return;

    setIsSaving(true);
    const success = await echoeSettingsService.updateSettings({ [key]: value });
    setIsSaving(false);

    if (success) {
      toast.success('Settings saved');
    } else {
      toast.error('Failed to save settings');
    }
  };

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
      toast.success('Export successful');
    } else {
      toast.error('Export failed');
    }
  };

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
      toast.success('Preset saved');
      setPresetName('');
      setShowPresetDialog(false);
    } else {
      toast.error('Failed to save preset');
    }
  };

  const handleDeletePreset = async (id: string) => {
    const success = await echoeSettingsService.deletePreset(id);
    if (success) {
      toast.success('Preset deleted');
    } else {
      toast.error('Failed to delete preset');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/cards')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <nav className="flex gap-4">
          {[
            { key: 'learning', label: 'Learning' },
            { key: 'display', label: 'Display' },
            { key: 'audio', label: 'Audio' },
            { key: 'data', label: 'Data' },
            { key: 'presets', label: 'Presets' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Learning Settings */}
          {activeTab === 'learning' && settings && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Learning Options</h2>
                <div className="space-y-4">
                  {/* New Cards Per Day */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Maximum new cards per day
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="9999"
                      value={settings.newLimit}
                      onChange={(e) => handleSettingChange('newLimit', parseInt(e.target.value) || 0)}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      Default: 20. Set to 0 to disable new cards.
                    </p>
                  </div>

                  {/* Reviews Per Day */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Maximum reviews per day
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="9999"
                      value={settings.reviewLimit}
                      onChange={(e) => handleSettingChange('reviewLimit', parseInt(e.target.value) || 0)}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      Default: 200. Set to 0 to disable reviews.
                    </p>
                  </div>

                  {/* Day Start Hour */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Day starts at (hour)
                    </label>
                    <select
                      value={settings.dayStartHour}
                      onChange={(e) => handleSettingChange('dayStartHour', parseInt(e.target.value))}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {i.toString().padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-sm text-gray-500">
                      Default: 0 (midnight). Controls when daily counts reset.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Display Settings */}
          {activeTab === 'display' && settings && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Display Options</h2>
                <div className="space-y-4">
                  {/* Font Size */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Card font size
                    </label>
                    <select
                      value={settings.fontSize}
                      onChange={(e) => handleSettingChange('fontSize', e.target.value)}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>

                  {/* Theme */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Theme
                    </label>
                    <select
                      value={settings.theme}
                      onChange={(e) => handleSettingChange('theme', e.target.value)}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="auto">Auto (System)</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>

                  {/* Flip Animation */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="flipAnimation"
                      checked={settings.flipAnimation}
                      onChange={(e) => handleSettingChange('flipAnimation', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="flipAnimation" className="text-sm font-medium text-gray-700">
                      Enable card flip animation
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Audio Settings */}
          {activeTab === 'audio' && settings && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Audio Options</h2>
                <div className="space-y-4">
                  {/* Autoplay */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Auto-play audio
                    </label>
                    <select
                      value={settings.autoplay}
                      onChange={(e) => handleSettingChange('autoplay', e.target.value)}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="front">Front only</option>
                      <option value="back">Back only</option>
                      <option value="both">Both sides</option>
                      <option value="never">Never</option>
                    </select>
                  </div>

                  {/* TTS Speed */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Text-to-speech speed: {settings.ttsSpeed.toFixed(1)}x
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
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0.5x</span>
                      <span>1x</span>
                      <span>1.5x</span>
                      <span>2x</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Data Settings */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Data Management</h2>
                <div className="space-y-4">
                  {/* Export All */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h3 className="font-medium text-gray-900">Export All Data</h3>
                      <p className="text-sm text-gray-500">
                        Download all decks as .apkg file (includes scheduling data)
                      </p>
                    </div>
                    <button
                      onClick={handleExport}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Export
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Presets */}
          {activeTab === 'presets' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium text-gray-900">Deck Config Presets</h2>
                  <button
                    onClick={() => setShowPresetDialog(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Save Current as Preset
                  </button>
                </div>

                {isLoadingPresets ? (
                  <div className="text-gray-500">Loading presets...</div>
                ) : presets.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    No presets saved yet. Save your current settings as a preset to quickly apply them to decks.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {presets.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <h3 className="font-medium text-gray-900">{preset.name}</h3>
                          <p className="text-sm text-gray-500">
                            Created: {new Date(preset.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeletePreset(preset.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Preset Dialog */}
      {showPresetDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Save Preset</h3>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowPresetDialog(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreset}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isSaving && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg px-6 py-4 shadow-lg">
            <div className="text-gray-700">Saving...</div>
          </div>
        </div>
      )}
    </div>
  );
});

export default SettingsPage;
