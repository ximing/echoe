ALTER TABLE `echoe_notetypes` ADD `deleted_at` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_notetypes` (`deleted_at`);