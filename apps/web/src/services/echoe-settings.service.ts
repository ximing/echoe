import { Service } from '@rabjs/react';
import {
  getEchoeConfig,
  updateEchoeConfig,
  getDeckConfigPresets,
  saveDeckConfigPreset,
  deleteDeckConfigPreset,
  exportAllDecks,
} from '../api/echoe';
import type { EchoeGlobalSettingsDto, EchoeDeckConfigPresetDto } from '@echoe/dto';

/**
 * Echoe Settings Service
 * Manages settings state and operations
 */
export class EchoeSettingsService extends Service {
  // Settings state
  settings: EchoeGlobalSettingsDto | null = null;

  // Presets state
  presets: EchoeDeckConfigPresetDto[] = [];

  // Loading states
  isLoadingSettings = false;
  isLoadingPresets = false;
  isSavingSettings = false;
  isExporting = false;

  // Error state
  error: string | null = null;

  /**
   * Load settings from server
   */
  async loadSettings(): Promise<void> {
    this.isLoadingSettings = true;
    this.error = null;

    try {
      const res = await getEchoeConfig();
      if (res.code === 0 && res.data) {
        this.settings = res.data;
      } else {
        this.error = 'Failed to load settings';
      }
    } catch (err) {
      this.error = 'Failed to load settings';
      console.error('Load settings error:', err);
    } finally {
      this.isLoadingSettings = false;
    }
  }

  /**
   * Update settings
   */
  async updateSettings(updates: Partial<EchoeGlobalSettingsDto>): Promise<boolean> {
    this.isSavingSettings = true;
    this.error = null;

    try {
      const res = await updateEchoeConfig(updates);
      if (res.code === 0 && res.data) {
        this.settings = res.data;
        return true;
      } else {
        this.error = 'Failed to save settings';
        return false;
      }
    } catch (err) {
      this.error = 'Failed to save settings';
      console.error('Save settings error:', err);
      return false;
    } finally {
      this.isSavingSettings = false;
    }
  }

  /**
   * Load presets from server
   */
  async loadPresets(): Promise<void> {
    this.isLoadingPresets = true;
    this.error = null;

    try {
      const res = await getDeckConfigPresets();
      if (res.code === 0 && res.data) {
        this.presets = res.data;
      } else {
        this.error = 'Failed to load presets';
      }
    } catch (err) {
      this.error = 'Failed to load presets';
      console.error('Load presets error:', err);
    } finally {
      this.isLoadingPresets = false;
    }
  }

  /**
   * Save a new preset
   */
  async savePreset(name: string, config: EchoeDeckConfigPresetDto['config']): Promise<boolean> {
    try {
      const res = await saveDeckConfigPreset({ name, config });
      if (res.code === 0 && res.data) {
        this.presets = [...this.presets, res.data];
        return true;
      }
      return false;
    } catch (err) {
      console.error('Save preset error:', err);
      return false;
    }
  }

  /**
   * Delete a preset
   */
  async deletePreset(id: string): Promise<boolean> {
    try {
      const res = await deleteDeckConfigPreset(id);
      if (res.code === 0) {
        this.presets = this.presets.filter((p) => p.id !== id);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Delete preset error:', err);
      return false;
    }
  }

  /**
   * Export all decks
   */
  async exportAll(includeScheduling: boolean): Promise<Blob | null> {
    this.isExporting = true;
    this.error = null;

    try {
      const res = await exportAllDecks(includeScheduling);
      // For blob responses, the data is the blob itself (not wrapped in .data)
      if (res.code === 0 && res && res instanceof Blob) {
        return res;
      }
      return null;
    } catch (err) {
      this.error = 'Failed to export decks';
      console.error('Export error:', err);
      return null;
    } finally {
      this.isExporting = false;
    }
  }
}

// Export singleton instance
export const echoeSettingsService = new EchoeSettingsService();
