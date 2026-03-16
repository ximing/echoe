-- Migration: Drop all Echoe foreign key constraints (idempotent)
-- This migration removes 8 FK constraints from Echoe tables
-- It checks for existence before dropping, so it's safe to run multiple times

-- 1. Drop echoe_notes.mid → echoe_notetypes.note_type_id
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'echoe_notes'
    AND CONSTRAINT_NAME = 'echoe_notes_mid_echoe_notetypes_note_type_id_fk'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @drop_fk1 = IF(@fk_exists > 0,
  'ALTER TABLE echoe_notes DROP FOREIGN KEY echoe_notes_mid_echoe_notetypes_note_type_id_fk',
  'SELECT "FK echoe_notes_mid_echoe_notetypes_note_type_id_fk already dropped" AS status'
);

PREPARE stmt FROM @drop_fk1;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

--> statement-breakpoint

-- 2. Drop echoe_cards.nid → echoe_notes.note_id
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'echoe_cards'
    AND CONSTRAINT_NAME = 'echoe_cards_nid_echoe_notes_note_id_fk'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @drop_fk2 = IF(@fk_exists > 0,
  'ALTER TABLE echoe_cards DROP FOREIGN KEY echoe_cards_nid_echoe_notes_note_id_fk',
  'SELECT "FK echoe_cards_nid_echoe_notes_note_id_fk already dropped" AS status'
);

PREPARE stmt FROM @drop_fk2;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

--> statement-breakpoint

-- 3. Drop echoe_cards.did → echoe_decks.deck_id
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'echoe_cards'
    AND CONSTRAINT_NAME = 'echoe_cards_did_echoe_decks_deck_id_fk'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @drop_fk3 = IF(@fk_exists > 0,
  'ALTER TABLE echoe_cards DROP FOREIGN KEY echoe_cards_did_echoe_decks_deck_id_fk',
  'SELECT "FK echoe_cards_did_echoe_decks_deck_id_fk already dropped" AS status'
);

PREPARE stmt FROM @drop_fk3;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

--> statement-breakpoint

-- 4. Drop echoe_revlog.cid → echoe_cards.card_id
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'echoe_revlog'
    AND CONSTRAINT_NAME = 'echoe_revlog_cid_echoe_cards_card_id_fk'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @drop_fk4 = IF(@fk_exists > 0,
  'ALTER TABLE echoe_revlog DROP FOREIGN KEY echoe_revlog_cid_echoe_cards_card_id_fk',
  'SELECT "FK echoe_revlog_cid_echoe_cards_card_id_fk already dropped" AS status'
);

PREPARE stmt FROM @drop_fk4;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

--> statement-breakpoint

-- 5. Drop echoe_decks.conf → echoe_deck_config.deck_config_id
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'echoe_decks'
    AND CONSTRAINT_NAME = 'echoe_decks_conf_echoe_deck_config_deck_config_id_fk'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @drop_fk5 = IF(@fk_exists > 0,
  'ALTER TABLE echoe_decks DROP FOREIGN KEY echoe_decks_conf_echoe_deck_config_deck_config_id_fk',
  'SELECT "FK echoe_decks_conf_echoe_deck_config_deck_config_id_fk already dropped" AS status'
);

PREPARE stmt FROM @drop_fk5;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

--> statement-breakpoint

-- 6. Drop echoe_decks.mid → echoe_notetypes.note_type_id
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'echoe_decks'
    AND CONSTRAINT_NAME = 'echoe_decks_mid_echoe_notetypes_note_type_id_fk'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @drop_fk6 = IF(@fk_exists > 0,
  'ALTER TABLE echoe_decks DROP FOREIGN KEY echoe_decks_mid_echoe_notetypes_note_type_id_fk',
  'SELECT "FK echoe_decks_mid_echoe_notetypes_note_type_id_fk already dropped" AS status'
);

PREPARE stmt FROM @drop_fk6;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

--> statement-breakpoint

-- 7. Drop echoe_templates.ntid → echoe_notetypes.note_type_id
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'echoe_templates'
    AND CONSTRAINT_NAME = 'echoe_templates_ntid_echoe_notetypes_note_type_id_fk'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @drop_fk7 = IF(@fk_exists > 0,
  'ALTER TABLE echoe_templates DROP FOREIGN KEY echoe_templates_ntid_echoe_notetypes_note_type_id_fk',
  'SELECT "FK echoe_templates_ntid_echoe_notetypes_note_type_id_fk already dropped" AS status'
);

PREPARE stmt FROM @drop_fk7;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

--> statement-breakpoint

-- 8. Drop echoe_templates.did → echoe_decks.deck_id
SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'echoe_templates'
    AND CONSTRAINT_NAME = 'echoe_templates_did_echoe_decks_deck_id_fk'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @drop_fk8 = IF(@fk_exists > 0,
  'ALTER TABLE echoe_templates DROP FOREIGN KEY echoe_templates_did_echoe_decks_deck_id_fk',
  'SELECT "FK echoe_templates_did_echoe_decks_deck_id_fk already dropped" AS status'
);

PREPARE stmt FROM @drop_fk8;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
