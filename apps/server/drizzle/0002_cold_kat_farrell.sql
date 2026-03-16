ALTER TABLE `api_token` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `inbox` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `inbox_report` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `api_token` MODIFY COLUMN `deleted_at` bigint NOT NULL;--> statement-breakpoint
ALTER TABLE `api_token` MODIFY COLUMN `deleted_at` bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `inbox` MODIFY COLUMN `is_read` boolean NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox` MODIFY COLUMN `is_read` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `inbox` MODIFY COLUMN `deleted_at` bigint NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox` MODIFY COLUMN `deleted_at` bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `inbox_report` MODIFY COLUMN `deleted_at` bigint NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_report` MODIFY COLUMN `deleted_at` bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `api_token` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `inbox` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `inbox_report` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `api_token` ADD `id` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox` ADD `id` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_report` ADD `id` int AUTO_INCREMENT NOT NULL;--> statement-breakpoint
CREATE INDEX `token_id_unique` ON `api_token` (`token_id`);