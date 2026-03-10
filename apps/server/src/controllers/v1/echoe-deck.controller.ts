import { JsonController, Get, Post, Put, Delete, Body, Param, QueryParam } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeDeckService } from '../../services/echoe-deck.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type {
  CreateEchoeDeckDto,
  CreateFilteredDeckDto,
  UpdateEchoeDeckDto,
  EchoeDeckWithCountsDto,
  EchoeDeckConfigDto,
  UpdateEchoeDeckConfigDto,
  FilteredDeckPreviewDto,
} from '@echoe/dto';

@Service()
@JsonController('/api/v1/decks')
export class EchoeDeckController {
  constructor(private echoeDeckService: EchoeDeckService) {}

  /**
   * GET /api/v1/decks
   * Get all decks with today's counts
   */
  @Get('/')
  async getAllDecks() {
    try {
      const decks = await this.echoeDeckService.getAllDecks();
      return ResponseUtil.success(decks);
    } catch (error) {
      logger.error('Get all decks error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/decks/:id
   * Get a single deck by ID
   */
  @Get('/:id')
  async getDeckById(@Param('id') id: number) {
    try {
      const deck = await this.echoeDeckService.getDeckById(id);
      if (!deck) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success(deck);
    } catch (error) {
      logger.error('Get deck by ID error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/decks
   * Create a new deck
   */
  @Post('/')
  async createDeck(@Body() dto: CreateEchoeDeckDto) {
    try {
      if (!dto.name) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const deck = await this.echoeDeckService.createDeck(dto);
      return ResponseUtil.success(deck);
    } catch (error) {
      logger.error('Create deck error:', error);
      if (error instanceof Error && error.message.includes('does not exist')) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, error.message);
      }
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * PUT /api/v1/decks/:id
   * Update a deck (rename and/or update description)
   */
  @Put('/:id')
  async updateDeck(@Param('id') id: number, @Body() dto: UpdateEchoeDeckDto) {
    try {
      const deck = await this.echoeDeckService.updateDeck(id, dto);
      if (!deck) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success(deck);
    } catch (error) {
      logger.error('Update deck error:', error);
      if (error instanceof Error && error.message.includes('does not exist')) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, error.message);
      }
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * DELETE /api/v1/decks/:id
   * Delete a deck
   */
  @Delete('/:id')
  async deleteDeck(@Param('id') id: number, @QueryParam('deleteCards') deleteCards: string = 'false') {
    try {
      const deleteCardsBool = deleteCards === 'true';
      const result = await this.echoeDeckService.deleteDeck(id, deleteCardsBool);
      if (!result) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Delete deck error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/decks/:id/config
   * Get deck configuration
   */
  @Get('/:id/config')
  async getDeckConfig(@Param('id') id: number) {
    try {
      const config = await this.echoeDeckService.getDeckConfig(id);
      if (!config) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success(config);
    } catch (error) {
      logger.error('Get deck config error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * PUT /api/v1/decks/:id/config
   * Update deck configuration
   */
  @Put('/:id/config')
  async updateDeckConfig(@Param('id') id: number, @Body() dto: UpdateEchoeDeckConfigDto) {
    try {
      const config = await this.echoeDeckService.updateDeckConfig(id, dto);
      if (!config) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success(config);
    } catch (error) {
      logger.error('Update deck config error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/decks/filtered
   * Create a filtered deck
   */
  @Post('/filtered')
  async createFilteredDeck(@Body() dto: CreateFilteredDeckDto) {
    try {
      if (!dto.name || !dto.searchQuery) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const deck = await this.echoeDeckService.createFilteredDeck(dto, true);
      return ResponseUtil.success(deck);
    } catch (error) {
      logger.error('Create filtered deck error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/decks/:id/rebuild
   * Rebuild a filtered deck
   */
  @Post('/:id/rebuild')
  async rebuildFilteredDeck(@Param('id') id: number) {
    try {
      const result = await this.echoeDeckService.rebuildFilteredDeck(id);
      if (!result) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Rebuild filtered deck error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/decks/:id/empty
   * Empty a filtered deck (return cards to original decks)
   */
  @Post('/:id/empty')
  async emptyFilteredDeck(@Param('id') id: number) {
    try {
      const result = await this.echoeDeckService.emptyFilteredDeck(id);
      if (!result) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Empty filtered deck error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/decks/preview
   * Preview filtered deck results without creating
   */
  @Get('/preview')
  async previewFilteredDeck(@QueryParam('q') searchQuery: string, @QueryParam('limit') limit: number = 5) {
    try {
      if (!searchQuery) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const preview = await this.echoeDeckService.previewFilteredDeck(searchQuery, limit);
      return ResponseUtil.success(preview);
    } catch (error) {
      logger.error('Preview filtered deck error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
