ALTER TABLE `echoe_col` DROP INDEX `uid_unique`;--> statement-breakpoint
DROP INDEX `uid_id_idx` ON `echoe_revlog`;--> statement-breakpoint
ALTER TABLE `echoe_col` MODIFY COLUMN `id` bigint AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_notes` MODIFY COLUMN `id` bigint AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_notes` MODIFY COLUMN `mid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_cards` MODIFY COLUMN `id` bigint AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_cards` MODIFY COLUMN `nid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_cards` MODIFY COLUMN `did` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_cards` MODIFY COLUMN `odid` varchar(191) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `echoe_revlog` MODIFY COLUMN `id` bigint AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` MODIFY COLUMN `cid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_decks` MODIFY COLUMN `id` bigint AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_decks` MODIFY COLUMN `conf` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_decks` MODIFY COLUMN `mid` varchar(191) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `echoe_deck_config` MODIFY COLUMN `id` bigint AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_notetypes` MODIFY COLUMN `id` bigint AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_notetypes` MODIFY COLUMN `did` varchar(191) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `echoe_templates` MODIFY COLUMN `id` bigint AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_templates` MODIFY COLUMN `ntid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_templates` MODIFY COLUMN `did` varchar(191) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `echoe_graves` MODIFY COLUMN `oid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_col` ADD `col_id` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_notes` ADD `note_id` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_cards` ADD `card_id` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `revlog_id` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_decks` ADD `deck_id` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_deck_config` ADD `deck_config_id` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_notetypes` ADD `note_type_id` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_templates` ADD `template_id` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_media` ADD `media_id` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_graves` ADD `grave_id` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_col` ADD CONSTRAINT `echoe_col_col_id_unique` UNIQUE(`col_id`);--> statement-breakpoint
ALTER TABLE `echoe_col` ADD CONSTRAINT `echoe_col_uid_unique` UNIQUE(`uid`);--> statement-breakpoint
ALTER TABLE `echoe_notes` ADD CONSTRAINT `echoe_notes_note_id_unique` UNIQUE(`note_id`);--> statement-breakpoint
ALTER TABLE `echoe_cards` ADD CONSTRAINT `echoe_cards_card_id_unique` UNIQUE(`card_id`);--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD CONSTRAINT `echoe_revlog_revlog_id_unique` UNIQUE(`revlog_id`);--> statement-breakpoint
ALTER TABLE `echoe_decks` ADD CONSTRAINT `echoe_decks_deck_id_unique` UNIQUE(`deck_id`);--> statement-breakpoint
ALTER TABLE `echoe_deck_config` ADD CONSTRAINT `echoe_deck_config_deck_config_id_unique` UNIQUE(`deck_config_id`);--> statement-breakpoint
ALTER TABLE `echoe_notetypes` ADD CONSTRAINT `echoe_notetypes_note_type_id_unique` UNIQUE(`note_type_id`);--> statement-breakpoint
ALTER TABLE `echoe_templates` ADD CONSTRAINT `echoe_templates_template_id_unique` UNIQUE(`template_id`);--> statement-breakpoint
ALTER TABLE `echoe_media` ADD CONSTRAINT `echoe_media_media_id_unique` UNIQUE(`media_id`);--> statement-breakpoint
ALTER TABLE `echoe_graves` ADD CONSTRAINT `echoe_graves_grave_id_unique` UNIQUE(`grave_id`);--> statement-breakpoint
CREATE INDEX `col_id_idx` ON `echoe_col` (`col_id`);--> statement-breakpoint
CREATE INDEX `uid_col_id_idx` ON `echoe_col` (`uid`,`col_id`);--> statement-breakpoint
CREATE INDEX `note_id_idx` ON `echoe_notes` (`note_id`);--> statement-breakpoint
CREATE INDEX `uid_note_id_idx` ON `echoe_notes` (`uid`,`note_id`);--> statement-breakpoint
CREATE INDEX `card_id_idx` ON `echoe_cards` (`card_id`);--> statement-breakpoint
CREATE INDEX `uid_card_id_idx` ON `echoe_cards` (`uid`,`card_id`);--> statement-breakpoint
CREATE INDEX `revlog_id_idx` ON `echoe_revlog` (`revlog_id`);--> statement-breakpoint
CREATE INDEX `uid_revlog_id_idx` ON `echoe_revlog` (`uid`,`revlog_id`);--> statement-breakpoint
CREATE INDEX `deck_id_idx` ON `echoe_decks` (`deck_id`);--> statement-breakpoint
CREATE INDEX `uid_deck_id_idx` ON `echoe_decks` (`uid`,`deck_id`);--> statement-breakpoint
CREATE INDEX `deck_config_id_idx` ON `echoe_deck_config` (`deck_config_id`);--> statement-breakpoint
CREATE INDEX `uid_deck_config_id_idx` ON `echoe_deck_config` (`uid`,`deck_config_id`);--> statement-breakpoint
CREATE INDEX `note_type_id_idx` ON `echoe_notetypes` (`note_type_id`);--> statement-breakpoint
CREATE INDEX `uid_note_type_id_idx` ON `echoe_notetypes` (`uid`,`note_type_id`);--> statement-breakpoint
CREATE INDEX `template_id_idx` ON `echoe_templates` (`template_id`);--> statement-breakpoint
CREATE INDEX `uid_template_id_idx` ON `echoe_templates` (`uid`,`template_id`);--> statement-breakpoint
CREATE INDEX `media_id_idx` ON `echoe_media` (`media_id`);--> statement-breakpoint
CREATE INDEX `uid_media_id_idx` ON `echoe_media` (`uid`,`media_id`);--> statement-breakpoint
CREATE INDEX `grave_id_idx` ON `echoe_graves` (`grave_id`);--> statement-breakpoint
CREATE INDEX `uid_grave_id_idx` ON `echoe_graves` (`uid`,`grave_id`);