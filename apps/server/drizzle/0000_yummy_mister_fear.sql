CREATE TABLE `users` (
	`uid` varchar(191) NOT NULL,
	`email` varchar(255),
	`phone` varchar(50),
	`password` varchar(255) NOT NULL,
	`salt` varchar(255) NOT NULL,
	`nickname` varchar(100),
	`avatar` varchar(500),
	`status` int NOT NULL DEFAULT 1,
	`deleted_at` bigint NOT NULL DEFAULT 0,
	`sr_enabled` boolean NOT NULL DEFAULT false,
	`sr_daily_limit` int NOT NULL DEFAULT 5,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `users_uid` PRIMARY KEY(`uid`)
);
--> statement-breakpoint
CREATE TABLE `table_migrations` (
	`table_name` varchar(191) NOT NULL,
	`current_version` int NOT NULL,
	`last_migrated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `table_migrations_table_name` PRIMARY KEY(`table_name`)
);
--> statement-breakpoint
CREATE TABLE `echoe_col` (
	`id` bigint NOT NULL,
	`crt` int NOT NULL,
	`mod` int NOT NULL,
	`scm` int NOT NULL,
	`ver` int NOT NULL,
	`dty` int NOT NULL,
	`usn` int NOT NULL,
	`ls` bigint NOT NULL,
	`conf` text NOT NULL,
	`models` text NOT NULL,
	`decks` text NOT NULL,
	`dconf` text NOT NULL,
	`tags` text NOT NULL,
	CONSTRAINT `echoe_col_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_notes` (
	`id` bigint NOT NULL,
	`guid` varchar(191) NOT NULL,
	`mid` bigint NOT NULL,
	`mod` int NOT NULL,
	`usn` int NOT NULL,
	`tags` text NOT NULL,
	`flds` text NOT NULL,
	`sfld` varchar(191) NOT NULL,
	`csum` bigint NOT NULL,
	`flags` int NOT NULL DEFAULT 0,
	`data` text NOT NULL,
	CONSTRAINT `echoe_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_cards` (
	`id` bigint NOT NULL,
	`nid` bigint NOT NULL,
	`did` bigint NOT NULL,
	`ord` int NOT NULL,
	`mod` int NOT NULL,
	`usn` int NOT NULL,
	`type` int NOT NULL DEFAULT 0,
	`queue` int NOT NULL DEFAULT 0,
	`due` bigint NOT NULL DEFAULT 0,
	`ivl` int NOT NULL DEFAULT 0,
	`factor` int NOT NULL DEFAULT 0,
	`reps` int NOT NULL DEFAULT 0,
	`lapses` int NOT NULL DEFAULT 0,
	`left` int NOT NULL DEFAULT 0,
	`odue` bigint NOT NULL DEFAULT 0,
	`odid` bigint NOT NULL DEFAULT 0,
	`flags` int NOT NULL DEFAULT 0,
	`data` text NOT NULL,
	CONSTRAINT `echoe_cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_revlog` (
	`id` bigint NOT NULL,
	`cid` bigint NOT NULL,
	`usn` int NOT NULL,
	`ease` int NOT NULL,
	`ivl` int NOT NULL,
	`last_ivl` int NOT NULL,
	`factor` int NOT NULL,
	`time` int NOT NULL,
	`type` int NOT NULL,
	CONSTRAINT `echoe_revlog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_decks` (
	`id` bigint NOT NULL,
	`name` varchar(191) NOT NULL,
	`conf` bigint NOT NULL DEFAULT 1,
	`extend_new` int NOT NULL DEFAULT 20,
	`extend_rev` int NOT NULL DEFAULT 200,
	`usn` int NOT NULL,
	`lim` int NOT NULL DEFAULT 0,
	`collapsed` tinyint NOT NULL DEFAULT 0,
	`dyn` tinyint NOT NULL DEFAULT 0,
	`mod` int NOT NULL,
	`desc` text NOT NULL,
	`mid` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `echoe_decks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_deck_config` (
	`id` bigint NOT NULL,
	`name` varchar(191) NOT NULL,
	`replayq` tinyint NOT NULL DEFAULT 1,
	`timer` int NOT NULL DEFAULT 0,
	`max_taken` int NOT NULL DEFAULT 60,
	`autoplay` tinyint NOT NULL DEFAULT 1,
	`tts_speed` tinyint NOT NULL DEFAULT 1,
	`mod` int NOT NULL,
	`usn` int NOT NULL,
	`new_config` text NOT NULL,
	`rev_config` text NOT NULL,
	`lapse_config` text NOT NULL,
	CONSTRAINT `echoe_deck_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_notetypes` (
	`id` bigint NOT NULL,
	`name` varchar(191) NOT NULL,
	`mod` int NOT NULL,
	`usn` int NOT NULL,
	`sortf` int NOT NULL DEFAULT 0,
	`did` bigint NOT NULL DEFAULT 0,
	`tmpls` text NOT NULL,
	`flds` text NOT NULL,
	`css` text NOT NULL,
	`type` int NOT NULL DEFAULT 0,
	`latex_pre` text NOT NULL,
	`latex_post` text NOT NULL,
	`req` text NOT NULL,
	CONSTRAINT `echoe_notetypes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_templates` (
	`id` bigint NOT NULL,
	`ntid` bigint NOT NULL,
	`name` varchar(191) NOT NULL,
	`ord` int NOT NULL,
	`qfmt` text NOT NULL,
	`afmt` text NOT NULL,
	`bqfmt` text NOT NULL,
	`bafmt` text NOT NULL,
	`did` bigint NOT NULL DEFAULT 0,
	`mod` int NOT NULL,
	`usn` int NOT NULL,
	CONSTRAINT `echoe_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(191) NOT NULL,
	`original_filename` varchar(191) NOT NULL,
	`size` int NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`hash` varchar(64) NOT NULL,
	`created_at` int NOT NULL,
	`used_in_cards` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `echoe_media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_graves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`usn` int NOT NULL,
	`oid` bigint NOT NULL,
	`type` int NOT NULL,
	CONSTRAINT `echoe_graves_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_config` (
	`key` varchar(191) NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `echoe_config_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE INDEX `email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `phone_idx` ON `users` (`phone`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `users` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_col` (`usn`);--> statement-breakpoint
CREATE INDEX `guid_idx` ON `echoe_notes` (`guid`);--> statement-breakpoint
CREATE INDEX `mid_idx` ON `echoe_notes` (`mid`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_notes` (`usn`);--> statement-breakpoint
CREATE INDEX `sfld_idx` ON `echoe_notes` (`sfld`);--> statement-breakpoint
CREATE INDEX `nid_idx` ON `echoe_cards` (`nid`);--> statement-breakpoint
CREATE INDEX `did_idx` ON `echoe_cards` (`did`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_cards` (`usn`);--> statement-breakpoint
CREATE INDEX `queue_idx` ON `echoe_cards` (`queue`);--> statement-breakpoint
CREATE INDEX `due_idx` ON `echoe_cards` (`due`);--> statement-breakpoint
CREATE INDEX `cid_idx` ON `echoe_revlog` (`cid`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_revlog` (`usn`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `echoe_decks` (`name`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_decks` (`usn`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `echoe_deck_config` (`name`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_deck_config` (`usn`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `echoe_notetypes` (`name`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_notetypes` (`usn`);--> statement-breakpoint
CREATE INDEX `ntid_idx` ON `echoe_templates` (`ntid`);--> statement-breakpoint
CREATE INDEX `ord_idx` ON `echoe_templates` (`ord`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_templates` (`usn`);--> statement-breakpoint
CREATE INDEX `filename_idx` ON `echoe_media` (`filename`);--> statement-breakpoint
CREATE INDEX `hash_idx` ON `echoe_media` (`hash`);--> statement-breakpoint
CREATE INDEX `oid_idx` ON `echoe_graves` (`oid`);--> statement-breakpoint
CREATE INDEX `type_idx` ON `echoe_graves` (`type`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_graves` (`usn`);