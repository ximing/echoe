ALTER TABLE `echoe_notes` ADD `deleted_at` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_cards` ADD `deleted_at` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `deleted_at` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_decks` ADD `deleted_at` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_deck_config` ADD `deleted_at` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_templates` ADD `deleted_at` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_notes` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_cards` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_revlog` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_decks` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_deck_config` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_templates` (`deleted_at`);