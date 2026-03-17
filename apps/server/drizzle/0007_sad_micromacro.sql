CREATE TABLE `inbox_source` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uid` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `inbox_source_id` PRIMARY KEY(`id`),
	CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`)
);
--> statement-breakpoint
CREATE TABLE `inbox_category` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uid` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `inbox_category_id` PRIMARY KEY(`id`),
	CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`)
);
--> statement-breakpoint
CREATE INDEX `uid_idx` ON `inbox_source` (`uid`);--> statement-breakpoint
CREATE INDEX `uid_idx` ON `inbox_category` (`uid`);