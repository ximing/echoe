/**
 * Active Row Predicates
 * Reusable predicates for filtering active (non-deleted) rows
 * Apply these to all queries to enforce soft-delete filtering
 */

import { eq } from 'drizzle-orm';

import { apiToken } from '../db/schema/api-token.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeDeckConfig } from '../db/schema/echoe-deck-config.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { inbox } from '../db/schema/inbox.js';
import { inboxReport } from '../db/schema/inbox-report.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';
import { echoeTemplates } from '../db/schema/echoe-templates.js';

/**
 * Predicate for active notes (deleted_at = 0)
 */
export const isActiveNote = eq(echoeNotes.deletedAt, 0);

/**
 * Predicate for active cards (deleted_at = 0)
 */
export const isActiveCard = eq(echoeCards.deletedAt, 0);

/**
 * Predicate for active revlog entries (deleted_at = 0)
 */
export const isActiveRevlog = eq(echoeRevlog.deletedAt, 0);

/**
 * Predicate for active decks (deleted_at = 0)
 */
export const isActiveDeck = eq(echoeDecks.deletedAt, 0);

/**
 * Predicate for active notetypes (deleted_at = 0)
 */
export const isActiveNotetype = eq(echoeNotetypes.deletedAt, 0);

/**
 * Predicate for active templates (deleted_at = 0)
 */
export const isActiveTemplate = eq(echoeTemplates.deletedAt, 0);

/**
 * Predicate for active deck config (deleted_at = 0)
 */
export const isActiveDeckConfig = eq(echoeDeckConfig.deletedAt, 0);

/**
 * Predicate for active API tokens (deleted_at = 0)
 */
export const isActiveApiToken = eq(apiToken.deletedAt, 0);

/**
 * Predicate for active inbox items (deleted_at = 0)
 */
export const isActiveInbox = eq(inbox.deletedAt, 0);

/**
 * Predicate for active inbox reports (deleted_at = 0)
 */
export const isActiveInboxReport = eq(inboxReport.deletedAt, 0);
