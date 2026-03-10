import { JsonController, Get, Post, Put, Delete, Body, Param, QueryParam } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeNoteService } from '../../services/echoe-note.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type {
  CreateEchoeNoteDto,
  UpdateEchoeNoteDto,
  EchoeNoteDto,
  EchoeNoteWithCardsDto,
  EchoeCardWithNoteDto,
  EchoeCardListItemDto,
  EchoeNoteTypeDto,
  CreateEchoeNoteTypeDto,
  UpdateEchoeNoteTypeDto,
  BulkCardOperationDto,
  EchoeNoteQueryParams,
  EchoeCardQueryParams,
} from '@echoe/dto';

@Service()
@JsonController('/api/v1')
export class EchoeNoteController {
  constructor(private echoeNoteService: EchoeNoteService) {}

  /**
   * GET /api/v1/notes
   * Get notes with optional filters
   */
  @Get('/notes')
  async getNotes(
    @QueryParam('deckId') deckId?: number,
    @QueryParam('tags') tags?: string,
    @QueryParam('q') q?: string,
    @QueryParam('status') status?: 'new' | 'learn' | 'review' | 'suspended' | 'buried',
    @QueryParam('page') page?: number,
    @QueryParam('limit') limit?: number
  ) {
    try {
      const params: EchoeNoteQueryParams = {
        deckId,
        tags,
        q,
        status,
        page: page || 1,
        limit: limit || 20,
      };

      const result = await this.echoeNoteService.getNotes(params);
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Get notes error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/notes/:id
   * Get a single note by ID
   */
  @Get('/notes/:id')
  async getNoteById(@Param('id') id: number) {
    try {
      const note = await this.echoeNoteService.getNoteById(id);
      if (!note) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success(note);
    } catch (error) {
      logger.error('Get note by ID error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/notes
   * Create a new note
   */
  @Post('/notes')
  async createNote(@Body() dto: CreateEchoeNoteDto) {
    try {
      if (!dto.notetypeId || !dto.deckId || !dto.fields) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const note = await this.echoeNoteService.createNote(dto);
      return ResponseUtil.success(note);
    } catch (error) {
      logger.error('Create note error:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, error.message);
      }
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * PUT /api/v1/notes/:id
   * Update a note
   */
  @Put('/notes/:id')
  async updateNote(@Param('id') id: number, @Body() dto: UpdateEchoeNoteDto) {
    try {
      const note = await this.echoeNoteService.updateNote(id, dto);
      if (!note) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success(note);
    } catch (error) {
      logger.error('Update note error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * DELETE /api/v1/notes/:id
   * Delete a note
   */
  @Delete('/notes/:id')
  async deleteNote(@Param('id') id: number) {
    try {
      const result = await this.echoeNoteService.deleteNote(id);
      if (!result) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Delete note error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/cards/:id
   * Get a card by ID with full note data
   */
  @Get('/cards/:id')
  async getCardById(@Param('id') id: number) {
    try {
      const card = await this.echoeNoteService.getCardById(id);
      if (!card) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success(card);
    } catch (error) {
      logger.error('Get card by ID error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/cards
   * Get cards with filters for card browser
   */
  @Get('/cards')
  async getCards(
    @QueryParam('deckId') deckId?: number,
    @QueryParam('q') q?: string,
    @QueryParam('status') status?: 'new' | 'learn' | 'review' | 'suspended' | 'buried' | 'leech',
    @QueryParam('tag') tag?: string,
    @QueryParam('sort') sort?: 'added' | 'due' | 'mod',
    @QueryParam('order') order?: 'asc' | 'desc',
    @QueryParam('page') page?: number,
    @QueryParam('limit') limit?: number
  ) {
    try {
      const params: EchoeCardQueryParams = {
        deckId,
        q,
        status,
        tag,
        sort,
        order,
        page: page || 1,
        limit: limit || 50,
      };

      const result = await this.echoeNoteService.getCards(params);
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Get cards error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/cards/bulk
   * Perform bulk card operations
   */
  @Post('/cards/bulk')
  async bulkCardOperation(@Body() dto: BulkCardOperationDto) {
    try {
      if (!dto.cardIds || dto.cardIds.length === 0 || !dto.action) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const result = await this.echoeNoteService.bulkCardOperation(dto);
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Bulk card operation error:', error);
      if (error instanceof Error) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, error.message);
      }
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/notetypes
   * Get all note types
   */
  @Get('/notetypes')
  async getAllNoteTypes() {
    try {
      const noteTypes = await this.echoeNoteService.getAllNoteTypes();
      return ResponseUtil.success(noteTypes);
    } catch (error) {
      logger.error('Get all note types error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/notetypes/:id
   * Get a note type by ID
   */
  @Get('/notetypes/:id')
  async getNoteTypeById(@Param('id') id: number) {
    try {
      const noteType = await this.echoeNoteService.getNoteTypeById(id);
      if (!noteType) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success(noteType);
    } catch (error) {
      logger.error('Get note type by ID error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/notetypes
   * Create a new note type
   */
  @Post('/notetypes')
  async createNoteType(@Body() dto: CreateEchoeNoteTypeDto) {
    try {
      if (!dto.name) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const noteType = await this.echoeNoteService.createNoteType(dto);
      return ResponseUtil.success(noteType);
    } catch (error) {
      logger.error('Create note type error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * PUT /api/v1/notetypes/:id
   * Update a note type
   */
  @Put('/notetypes/:id')
  async updateNoteType(@Param('id') id: number, @Body() dto: UpdateEchoeNoteTypeDto) {
    try {
      const noteType = await this.echoeNoteService.updateNoteType(id, dto);
      if (!noteType) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success(noteType);
    } catch (error) {
      logger.error('Update note type error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * DELETE /api/v1/notetypes/:id
   * Delete a note type
   */
  @Delete('/notetypes/:id')
  async deleteNoteType(@Param('id') id: number) {
    try {
      const result = await this.echoeNoteService.deleteNoteType(id);
      if (!result.success) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, result.message);
      }
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Delete note type error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
