import { JsonController, Get, Put, Body, Post, Delete, Param } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeConfigService } from '../../services/echoe-config.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type { UpdateEchoeGlobalSettingsDto, CreateDeckConfigPresetDto } from '@echoe/dto';

@Service()
@JsonController('/api/v1/config')
export class EchoeConfigController {
  constructor(private echoeConfigService: EchoeConfigService) {}

  /**
   * GET /api/v1/config
   * Get global echoe settings
   */
  @Get('/')
  async getSettings() {
    try {
      const settings = await this.echoeConfigService.getSettings();
      return ResponseUtil.success(settings);
    } catch (error) {
      logger.error('Get echoe settings error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * PUT /api/v1/config
   * Update global echoe settings
   */
  @Put('/')
  async updateSettings(@Body() dto: UpdateEchoeGlobalSettingsDto) {
    try {
      const settings = await this.echoeConfigService.updateSettings(dto);
      return ResponseUtil.success(settings);
    } catch (error) {
      logger.error('Update echoe settings error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/config/presets
   * Get all deck config presets
   */
  @Get('/presets')
  async getPresets() {
    try {
      const presets = await this.echoeConfigService.getPresets();
      return ResponseUtil.success(presets);
    } catch (error) {
      logger.error('Get presets error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/config/presets
   * Save a new deck config preset
   */
  @Post('/presets')
  async savePreset(@Body() dto: CreateDeckConfigPresetDto) {
    try {
      const preset = await this.echoeConfigService.savePreset(dto);
      return ResponseUtil.success(preset);
    } catch (error) {
      logger.error('Save preset error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * DELETE /api/v1/config/presets/:id
   * Delete a deck config preset
   */
  @Delete('/presets/:id')
  async deletePreset(@Param('id') id: string) {
    try {
      await this.echoeConfigService.deletePreset(id);
      return ResponseUtil.success({ deleted: true });
    } catch (error) {
      logger.error('Delete preset error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
