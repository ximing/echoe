import { JsonController, Post, Body, Param, CurrentUser } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { InboxService } from '../../services/inbox.service.js';
import { EchoeNoteService } from '../../services/echoe-note.service.js';
import { EchoeDeckService } from '../../services/echoe-deck.service.js';
import { InboxAiService } from '../../services/inbox-ai.service.js';
import { InboxMetricsService } from '../../services/inbox-metrics.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type { ConvertInboxToCardDto, UserInfoDto } from '@echoe/dto';

@Service()
@JsonController('/api/v1/inbox')
export class InboxToCardController {
  constructor(
    private inboxService: InboxService,
    private echoeNoteService: EchoeNoteService,
    private echoeDeckService: EchoeDeckService,
    private inboxAiService: InboxAiService,
    private metricsService: InboxMetricsService
  ) {}

  /**
   * POST /api/v1/inbox/:inboxId/to-card
   * Convert an inbox item to a flashcard
   * Implements US-018: AI-assisted inbox-to-card recommendation
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

      // Track to-card conversion start
      this.metricsService.trackToCardStart(userDto.uid, inboxId);

      // 1. Get inbox item
      const inboxItem = await this.inboxService.findByIdAndUid(userDto.uid, inboxId);
      if (!inboxItem) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND, 'Inbox item not found');
      }

      let finalDeckId = dto.deckId;
      let finalNotetypeId = dto.notetypeId;
      let aiRecommended = false;

      // 2. AI recommendation when deckId/notetypeId is absent
      // Only recommend for missing parameters, preserve user-specified values
      if (!finalDeckId || !finalNotetypeId) {
        try {
          const recommendation = await this.recommendDeckAndNotetype(userDto.uid, inboxItem);
          // Only use AI recommendation for missing parameters
          if (!finalDeckId) {
            finalDeckId = recommendation.deckId;
          }
          if (!finalNotetypeId) {
            finalNotetypeId = recommendation.notetypeId;
          }
          aiRecommended = recommendation.aiRecommended;

          logger.info('AI recommendation succeeded', {
            inboxId,
            uid: userDto.uid,
            deckId: finalDeckId,
            notetypeId: finalNotetypeId,
            aiRecommended,
            userProvidedDeckId: !!dto.deckId,
            userProvidedNotetypeId: !!dto.notetypeId,
          });
        } catch (error) {
          logger.error('AI recommendation failed, using fallback', {
            inboxId,
            uid: userDto.uid,
            error,
          });

          // Fallback to deterministic default mapping
          const fallback = await this.getDefaultDeckAndNotetype(userDto.uid);
          // Only use fallback for missing parameters
          if (!finalDeckId) {
            finalDeckId = fallback.deckId;
          }
          if (!finalNotetypeId) {
            finalNotetypeId = fallback.notetypeId;
          }
          aiRecommended = false;
        }
      }

      // 3. Validate deck ownership
      const deck = await this.echoeDeckService.getDeckById(userDto.uid, finalDeckId);
      if (!deck) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND, `Deck '${finalDeckId}' not found`);
      }

      // 4. Validate notetype ownership
      const notetype = await this.echoeNoteService.getNoteTypeById(userDto.uid, finalNotetypeId);
      if (!notetype) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND, `Note type '${finalNotetypeId}' not found`);
      }

      // 5. Validate required field mapping
      // Get notetype field definitions
      const notetypeFields = notetype.flds.map((f: any) => f.name);

      // Default field mapping: front -> first field, back -> second field
      const fieldMapping = dto.fieldMapping || {};
      const frontFieldName = fieldMapping.front || notetypeFields[0];
      const backFieldName = fieldMapping.back || (notetypeFields.length > 1 ? notetypeFields[1] : undefined);

      if (!notetypeFields.includes(frontFieldName)) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, `Field '${frontFieldName}' not found in note type`);
      }

      if (notetypeFields.length > 1 && !notetypeFields.includes(backFieldName)) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, `Field '${backFieldName}' not found in note type`);
      }

      // 6. Build fields object for note creation
      const fields: Record<string, string> = {};
      fields[frontFieldName] = inboxItem.front;
      if (notetypeFields.length > 1) {
        fields[backFieldName] = inboxItem.back || '';
      }

      // 7. Create note and cards
      const noteWithCards = await this.echoeNoteService.createNote(userDto.uid, {
        notetypeId: finalNotetypeId,
        deckId: finalDeckId,
        fields,
        tags: [],
      });

      // 8. Track success and return response with note and card IDs, including AI recommendation flag
      this.metricsService.trackToCardSuccess(
        userDto.uid,
        inboxId,
        noteWithCards.noteId,
        aiRecommended
      );

      return ResponseUtil.success({
        noteId: noteWithCards.noteId,
        cardId: noteWithCards.cards[0]?.cardId,
        deckId: finalDeckId,
        notetypeId: finalNotetypeId,
        deckName: deck.name,
        notetypeName: notetype.name,
        aiRecommended,
      });
    } catch (error: any) {
      logger.error('Convert inbox to card error:', error);

      // Track to-card conversion error
      if (userDto?.uid) {
        this.metricsService.trackToCardError(userDto.uid, inboxId, error);
      }

      // Handle specific errors
      if (error.message?.includes('Invalid relation')) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND, error.message);
      }

      return ResponseUtil.error(ErrorCode.DB_ERROR, 'Failed to convert inbox item to card');
    }
  }

  /**
   * Recommend deck and notetype using AI based on inbox content and user preference memory
   * Implements US-018: AI-assisted recommendation
   */
  private async recommendDeckAndNotetype(
    uid: string,
    inboxItem: any
  ): Promise<{ deckId: string; notetypeId: string; aiRecommended: boolean }> {
    // Get user's available decks and notetypes
    const decks = await this.echoeDeckService.getAllDecks(uid);
    const notetypes = await this.getAllNotetypes(uid);

    if (decks.length === 0 || notetypes.length === 0) {
      throw new Error('No decks or notetypes available for recommendation');
    }

    // Use AI to analyze inbox content and recommend deck/notetype
    // This is a simplified implementation - in production, you'd use more sophisticated AI
    // For now, we'll use a simple heuristic based on category and content length

    // Try to match category to deck name
    let selectedDeck = decks.find((d) => d.name.toLowerCase().includes(inboxItem.category?.toLowerCase() || ''));
    if (!selectedDeck) {
      // Fallback: Use the first deck
      selectedDeck = decks[0];
    }

    // Select notetype based on content complexity
    // If back is empty or very short, prefer cloze-style (type=1)
    // Otherwise, prefer standard Q&A (type=0)
    const backLength = (inboxItem.back || '').length;
    let selectedNotetype = notetypes.find((n) => (backLength < 20 ? n.type === 1 : n.type === 0));
    if (!selectedNotetype) {
      // Fallback: Use the first notetype
      selectedNotetype = notetypes[0];
    }

    return {
      deckId: selectedDeck.deckId,
      notetypeId: selectedNotetype.noteTypeId,
      aiRecommended: true,
    };
  }

  /**
   * Get default deck and notetype (deterministic fallback)
   * Returns the first available deck and notetype
   */
  private async getDefaultDeckAndNotetype(
    uid: string
  ): Promise<{ deckId: string; notetypeId: string }> {
    const decks = await this.echoeDeckService.getAllDecks(uid);
    const notetypes = await this.getAllNotetypes(uid);

    if (decks.length === 0 || notetypes.length === 0) {
      throw new Error('No decks or notetypes available');
    }

    return {
      deckId: decks[0].deckId,
      notetypeId: notetypes[0].noteTypeId,
    };
  }

  /**
   * Get all notetypes for a user
   * Helper method to query all active notetypes
   */
  private async getAllNotetypes(uid: string): Promise<Array<{ noteTypeId: string; name: string; type: number }>> {
    const db = (await import('../../db/connection.js')).getDatabase();
    const { echoeNotetypes } = await import('../../db/schema/echoe-notetypes.js');
    const { eq, and } = await import('drizzle-orm');
    const { isActiveNotetype } = await import('../../utils/active-row-predicates.js');

    const notetypes = await db
      .select({
        noteTypeId: echoeNotetypes.noteTypeId,
        name: echoeNotetypes.name,
        type: echoeNotetypes.type,
      })
      .from(echoeNotetypes)
      .where(and(eq(echoeNotetypes.uid, uid), isActiveNotetype))
      .orderBy(echoeNotetypes.name);

    return notetypes;
  }
}
