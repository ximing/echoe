import { JsonController, Post, Body, Param, CurrentUser } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { InboxService } from '../../services/inbox.service.js';
import { EchoeNoteService } from '../../services/echoe-note.service.js';
import { EchoeDeckService } from '../../services/echoe-deck.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type { ConvertInboxToCardDto, UserInfoDto } from '@echoe/dto';

@Service()
@JsonController('/api/v1/inbox')
export class InboxToCardController {
  constructor(
    private inboxService: InboxService,
    private echoeNoteService: EchoeNoteService,
    private echoeDeckService: EchoeDeckService
  ) {}

  /**
   * POST /api/v1/inbox/:inboxId/to-card
   * Convert an inbox item to a flashcard
   */
  @Post('/:inboxId/to-card')
  async convertInboxToCard(
    @Param('inboxId') inboxId: string,
    @Body() dto: ConvertInboxToCardDto,
    @CurrentUser() userDto?: UserInfoDto
  ) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      // Validate required fields
      if (!dto.deckId || !dto.notetypeId) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'deckId and notetypeId are required');
      }

      // 1. Get inbox item
      const inboxItem = await this.inboxService.findByIdAndUid(userDto.uid, inboxId);
      if (!inboxItem) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND, 'Inbox item not found');
      }

      // 2. Validate deck ownership
      const deck = await this.echoeDeckService.getDeckById(userDto.uid, dto.deckId);
      if (!deck) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND, `Deck '${dto.deckId}' not found`);
      }

      // 3. Validate notetype ownership
      const notetype = await this.echoeNoteService.getNoteTypeById(userDto.uid, dto.notetypeId);
      if (!notetype) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND, `Note type '${dto.notetypeId}' not found`);
      }

      // 4. Validate required field mapping
      // Get notetype field definitions
      const notetypeFields = notetype.flds.map((f: any) => f.name);

      // Default field mapping: front -> first field, back -> second field
      const fieldMapping = dto.fieldMapping || {};
      const frontFieldName = fieldMapping.front || notetypeFields[0];
      const backFieldName = fieldMapping.back || notetypeFields[1];

      if (!notetypeFields.includes(frontFieldName)) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, `Field '${frontFieldName}' not found in note type`);
      }

      if (notetypeFields.length > 1 && !notetypeFields.includes(backFieldName)) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, `Field '${backFieldName}' not found in note type`);
      }

      // 5. Build fields object for note creation
      const fields: Record<string, string> = {};
      fields[frontFieldName] = inboxItem.front;
      if (notetypeFields.length > 1) {
        fields[backFieldName] = inboxItem.back || '';
      }

      // 6. Create note and cards
      const noteWithCards = await this.echoeNoteService.createNote(userDto.uid, {
        notetypeId: dto.notetypeId,
        deckId: dto.deckId,
        fields,
        tags: [],
      });

      // 7. Return response with note and card IDs
      return ResponseUtil.success({
        noteId: noteWithCards.noteId,
        cardId: noteWithCards.cards[0]?.cardId,
        deckId: dto.deckId,
        notetypeId: dto.notetypeId,
      });
    } catch (error: any) {
      logger.error('Convert inbox to card error:', error);

      // Handle specific errors
      if (error.message?.includes('Invalid relation')) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND, error.message);
      }

      return ResponseUtil.error(ErrorCode.DB_ERROR, 'Failed to convert inbox item to card');
    }
  }
}
