import { JsonController, Get, Post, Put, Delete, Body, Param, QueryParam, CurrentUser } from 'routing-controllers';
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
  UserInfoDto,
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
  async getAllDecks(@CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const decks = await this.echoeDeckService.getAllDecks(userDto.uid);
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
  async getDeckById(@Param('id') id: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const deck = await this.echoeDeckService.getDeckById(userDto.uid, id);
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
  async createDeck(@Body() dto: CreateEchoeDeckDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!dto.name) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const deck = await this.echoeDeckService.createDeck(userDto.uid, dto);
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
  async updateDeck(@Param('id') id: string, @Body() dto: UpdateEchoeDeckDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const deck = await this.echoeDeckService.updateDeck(userDto.uid, id, dto);
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
  async deleteDeck(@Param('id') id: string, @QueryParam('deleteCards') deleteCards: string = 'false', @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const deleteCardsBool = deleteCards === 'true';
      const result = await this.echoeDeckService.deleteDeck(userDto.uid, id, deleteCardsBool);
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
  async getDeckConfig(@Param('id') id: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const config = await this.echoeDeckService.getDeckConfig(userDto.uid, id);
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
  async updateDeckConfig(@Param('id') id: string, @Body() dto: UpdateEchoeDeckConfigDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const config = await this.echoeDeckService.updateDeckConfig(userDto.uid, id, dto);
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
  async createFilteredDeck(@Body() dto: CreateFilteredDeckDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!dto.name || !dto.searchQuery) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const deck = await this.echoeDeckService.createFilteredDeck(userDto.uid, dto, true);
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
  async rebuildFilteredDeck(@Param('id') id: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const result = await this.echoeDeckService.rebuildFilteredDeck(userDto.uid, id);
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
  async emptyFilteredDeck(@Param('id') id: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const result = await this.echoeDeckService.emptyFilteredDeck(userDto.uid, id);
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
  async previewFilteredDeck(@QueryParam('q') searchQuery: string, @QueryParam('limit') limit: number = 5, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!searchQuery) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const preview = await this.echoeDeckService.previewFilteredDeck(userDto.uid, searchQuery, limit);
      return ResponseUtil.success(preview);
    } catch (error) {
      logger.error('Preview filtered deck error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
