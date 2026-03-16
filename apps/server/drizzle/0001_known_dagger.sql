CREATE TABLE `api_token` (
	`token_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`token_hash` varchar(255) NOT NULL,
	`deleted_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `api_token_token_id` PRIMARY KEY(`token_id`)
);
--> statement-breakpoint
CREATE TABLE `inbox` (
	`inbox_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`source` varchar(255) NOT NULL DEFAULT 'manual',
	`category` varchar(255) NOT NULL DEFAULT 'backend',
	`is_read` tinyint NOT NULL DEFAULT 0,
	`deleted_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `inbox_inbox_id` PRIMARY KEY(`inbox_id`),
	CONSTRAINT `inbox_id_unique` UNIQUE(`inbox_id`)
);
--> statement-breakpoint
CREATE TABLE `inbox_report` (
	`inbox_report_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`date` varchar(10) NOT NULL,
	`content` text NOT NULL,
	`summary` text,
	`deleted_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `inbox_report_inbox_report_id` PRIMARY KEY(`inbox_report_id`),
	CONSTRAINT `inbox_report_id_unique` UNIQUE(`inbox_report_id`),
	CONSTRAINT `uid_date_unique` UNIQUE(`uid`,`date`)
);
--> statement-breakpoint
CREATE INDEX `uid_idx` ON `api_token` (`uid`);--> statement-breakpoint
CREATE INDEX `token_hash_idx` ON `api_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `api_token` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `uid_idx` ON `inbox` (`uid`);--> statement-breakpoint
CREATE INDEX `category_idx` ON `inbox` (`category`);--> statement-breakpoint
CREATE INDEX `is_read_idx` ON `inbox` (`is_read`);--> statement-breakpoint
CREATE INDEX `uid_is_read_idx` ON `inbox` (`uid`,`is_read`);--> statement-breakpoint
CREATE INDEX `uid_category_idx` ON `inbox` (`uid`,`category`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `inbox` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `uid_idx` ON `inbox_report` (`uid`);--> statement-breakpoint
CREATE INDEX `date_idx` ON `inbox_report` (`date`);