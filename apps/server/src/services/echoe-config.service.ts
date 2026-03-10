import { Service } from 'typedi';
import { getDatabase } from '../db/connection.js';
import { echoeConfig } from '../db/schema/echoe-config.js';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import type {
  EchoeGlobalSettingsDto,
  UpdateEchoeGlobalSettingsDto,
  EchoeDeckConfigPresetDto,
  CreateDeckConfigPresetDto,
} from '@echoe/dto';

const DEFAULT_SETTINGS: EchoeGlobalSettingsDto = {
  autoplay: 'both',
  ttsSpeed: 1.0,
  flipAnimation: true,
  fontSize: 'medium',
  theme: 'auto',
  newLimit: 20,
  reviewLimit: 200,
  dayStartHour: 0,
};

@Service()
export class EchoeConfigService {
  /**
   * Get global echoe settings
   */
  async getSettings(): Promise<EchoeGlobalSettingsDto> {
    const db = getDatabase();

    try {
      const rows = await db.select().from(echoeConfig).where(eq(echoeConfig.key, 'global_settings'));

      if (rows.length === 0) {
        // Return default settings
        return DEFAULT_SETTINGS;
      }

      const settings = JSON.parse(rows[0].value) as EchoeGlobalSettingsDto;
      return { ...DEFAULT_SETTINGS, ...settings };
    } catch (error) {
      logger.error('Get echoe settings error:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Update global echoe settings
   */
  async updateSettings(dto: UpdateEchoeGlobalSettingsDto): Promise<EchoeGlobalSettingsDto> {
    const db = getDatabase();

    try {
      // Get existing settings
      const rows = await db.select().from(echoeConfig).where(eq(echoeConfig.key, 'global_settings'));

      let currentSettings: EchoeGlobalSettingsDto;
      if (rows.length === 0) {
        currentSettings = { ...DEFAULT_SETTINGS };
      } else {
        currentSettings = JSON.parse(rows[0].value) as EchoeGlobalSettingsDto;
      }

      // Merge with updates
      const updatedSettings: EchoeGlobalSettingsDto = {
        ...currentSettings,
        ...dto,
      };

      // Validate autoplay
      if (updatedSettings.autoplay && !['front', 'back', 'both', 'never'].includes(updatedSettings.autoplay)) {
        updatedSettings.autoplay = 'both';
      }

      // Validate ttsSpeed
      if (updatedSettings.ttsSpeed !== undefined) {
        updatedSettings.ttsSpeed = Math.max(0.5, Math.min(2.0, updatedSettings.ttsSpeed));
      }

      // Validate newLimit
      if (updatedSettings.newLimit !== undefined) {
        updatedSettings.newLimit = Math.max(0, Math.min(9999, updatedSettings.newLimit));
      }

      // Validate reviewLimit
      if (updatedSettings.reviewLimit !== undefined) {
        updatedSettings.reviewLimit = Math.max(0, Math.min(9999, updatedSettings.reviewLimit));
      }

      // Validate dayStartHour
      if (updatedSettings.dayStartHour !== undefined) {
        updatedSettings.dayStartHour = Math.max(0, Math.min(23, updatedSettings.dayStartHour));
      }

      // Save to database
      const value = JSON.stringify(updatedSettings);

      if (rows.length === 0) {
        await db.insert(echoeConfig).values({ key: 'global_settings', value });
      } else {
        await db.update(echoeConfig).set({ value }).where(eq(echoeConfig.key, 'global_settings'));
      }

      return updatedSettings;
    } catch (error) {
      logger.error('Update echoe settings error:', error);
      throw error;
    }
  }

  /**
   * Get all deck config presets
   */
  async getPresets(): Promise<EchoeDeckConfigPresetDto[]> {
    const db = getDatabase();

    try {
      const rows = await db.select().from(echoeConfig).where(eq(echoeConfig.key, 'deck_config_presets'));

      if (rows.length === 0) {
        return [];
      }

      return JSON.parse(rows[0].value) as EchoeDeckConfigPresetDto[];
    } catch (error) {
      logger.error('Get presets error:', error);
      return [];
    }
  }

  /**
   * Save a new deck config preset
   */
  async savePreset(dto: CreateDeckConfigPresetDto): Promise<EchoeDeckConfigPresetDto> {
    const db = getDatabase();

    try {
      // Get existing presets
      const presets = await this.getPresets();

      // Create new preset
      const newPreset: EchoeDeckConfigPresetDto = {
        id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: dto.name,
        config: dto.config,
        createdAt: Date.now(),
      };

      presets.push(newPreset);

      // Save to database
      const value = JSON.stringify(presets);
      const rows = await db.select().from(echoeConfig).where(eq(echoeConfig.key, 'deck_config_presets'));

      if (rows.length === 0) {
        await db.insert(echoeConfig).values({ key: 'deck_config_presets', value });
      } else {
        await db.update(echoeConfig).set({ value }).where(eq(echoeConfig.key, 'deck_config_presets'));
      }

      return newPreset;
    } catch (error) {
      logger.error('Save preset error:', error);
      throw error;
    }
  }

  /**
   * Delete a deck config preset
   */
  async deletePreset(presetId: string): Promise<void> {
    const db = getDatabase();

    try {
      // Get existing presets
      const presets = await this.getPresets();

      // Filter out the preset to delete
      const filteredPresets = presets.filter((p) => p.id !== presetId);

      if (filteredPresets.length === presets.length) {
        throw new Error('Preset not found');
      }

      // Save to database
      const value = JSON.stringify(filteredPresets);
      await db.update(echoeConfig).set({ value }).where(eq(echoeConfig.key, 'deck_config_presets'));
    } catch (error) {
      logger.error('Delete preset error:', error);
      throw error;
    }
  }
}
