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
CREATE TABLE `api_token` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`name` varchar(100) NOT NULL,
	`token_hash` varchar(255) NOT NULL,
	`deleted_at` bigint NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `api_token_id` PRIMARY KEY(`id`)
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
	`id` int AUTO_INCREMENT NOT NULL,
	`col_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
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
	CONSTRAINT `echoe_col_id` PRIMARY KEY(`id`),
	CONSTRAINT `echoe_col_col_id_unique` UNIQUE(`col_id`),
	CONSTRAINT `echoe_col_uid_unique` UNIQUE(`uid`)
);
--> statement-breakpoint
CREATE TABLE `echoe_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`note_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`guid` varchar(191) NOT NULL,
	`mid` varchar(191) NOT NULL,
	`mod` int NOT NULL,
	`usn` int NOT NULL,
	`tags` text NOT NULL,
	`flds` text NOT NULL,
	`sfld` varchar(191) NOT NULL,
	`csum` varchar(191) NOT NULL,
	`flags` int NOT NULL DEFAULT 0,
	`data` text NOT NULL,
	`rich_text_fields` json,
	`fld_names` json,
	`fields_json` json NOT NULL DEFAULT ('{}'),
	`deleted_at` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `echoe_notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `echoe_notes_note_id_unique` UNIQUE(`note_id`),
	CONSTRAINT `uid_guid_unique` UNIQUE(`uid`,`guid`)
);
--> statement-breakpoint
CREATE TABLE `echoe_cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`card_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`nid` varchar(191) NOT NULL,
	`did` varchar(191) NOT NULL,
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
	`odid` varchar(191) NOT NULL DEFAULT '',
	`flags` int NOT NULL DEFAULT 0,
	`data` text NOT NULL,
	`stability` double NOT NULL DEFAULT 0,
	`difficulty` double NOT NULL DEFAULT 0,
	`last_review` bigint NOT NULL DEFAULT 0,
	`deleted_at` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `echoe_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `echoe_cards_card_id_unique` UNIQUE(`card_id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_revlog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`revlog_id` varchar(191) NOT NULL,
	`source_revlog_id` bigint,
	`cid` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`usn` int NOT NULL,
	`ease` int NOT NULL,
	`ivl` int NOT NULL,
	`last_ivl` int NOT NULL,
	`factor` int NOT NULL,
	`time` int NOT NULL,
	`type` int NOT NULL,
	`stability` double NOT NULL DEFAULT 0,
	`difficulty` double NOT NULL DEFAULT 0,
	`last_review` bigint NOT NULL DEFAULT 0,
	`pre_due` bigint NOT NULL DEFAULT 0,
	`pre_ivl` int NOT NULL DEFAULT 0,
	`pre_factor` int NOT NULL DEFAULT 0,
	`pre_reps` int NOT NULL DEFAULT 0,
	`pre_lapses` int NOT NULL DEFAULT 0,
	`pre_left` int NOT NULL DEFAULT 0,
	`pre_type` int NOT NULL DEFAULT 0,
	`pre_queue` int NOT NULL DEFAULT 0,
	`pre_stability` double NOT NULL DEFAULT 0,
	`pre_difficulty` double NOT NULL DEFAULT 0,
	`pre_last_review` bigint NOT NULL DEFAULT 0,
	`deleted_at` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `echoe_revlog_id` PRIMARY KEY(`id`),
	CONSTRAINT `echoe_revlog_revlog_id_unique` UNIQUE(`revlog_id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_decks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deck_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`conf` varchar(191) NOT NULL,
	`extend_new` int NOT NULL DEFAULT 20,
	`extend_rev` int NOT NULL DEFAULT 200,
	`usn` int NOT NULL,
	`lim` int NOT NULL DEFAULT 0,
	`collapsed` tinyint NOT NULL DEFAULT 0,
	`dyn` tinyint NOT NULL DEFAULT 0,
	`mod` int NOT NULL,
	`desc` text NOT NULL,
	`mid` varchar(191),
	`deleted_at` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `echoe_decks_id` PRIMARY KEY(`id`),
	CONSTRAINT `echoe_decks_deck_id_unique` UNIQUE(`deck_id`),
	CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`)
);
--> statement-breakpoint
CREATE TABLE `echoe_deck_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deck_config_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
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
	`deleted_at` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `echoe_deck_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `echoe_deck_config_deck_config_id_unique` UNIQUE(`deck_config_id`),
	CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`)
);
--> statement-breakpoint
CREATE TABLE `echoe_notetypes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`note_type_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`mod` int NOT NULL,
	`usn` int NOT NULL,
	`sortf` int NOT NULL DEFAULT 0,
	`did` varchar(191) NOT NULL DEFAULT '',
	`tmpls` text NOT NULL,
	`flds` text NOT NULL,
	`css` text NOT NULL,
	`type` int NOT NULL DEFAULT 0,
	`latex_pre` text NOT NULL,
	`latex_post` text NOT NULL,
	`req` text NOT NULL,
	`deleted_at` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `echoe_notetypes_id` PRIMARY KEY(`id`),
	CONSTRAINT `echoe_notetypes_note_type_id_unique` UNIQUE(`note_type_id`),
	CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`)
);
--> statement-breakpoint
CREATE TABLE `echoe_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`template_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`ntid` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`ord` int NOT NULL,
	`qfmt` text NOT NULL,
	`afmt` text NOT NULL,
	`bqfmt` text NOT NULL,
	`bafmt` text NOT NULL,
	`did` varchar(191),
	`mod` int NOT NULL,
	`usn` int NOT NULL,
	`deleted_at` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `echoe_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `echoe_templates_template_id_unique` UNIQUE(`template_id`),
	CONSTRAINT `uid_ntid_ord_unique` UNIQUE(`uid`,`ntid`,`ord`)
);
--> statement-breakpoint
CREATE TABLE `echoe_media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`media_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`filename` varchar(191) NOT NULL,
	`original_filename` varchar(191) NOT NULL,
	`size` int NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`hash` varchar(64) NOT NULL,
	`storage_key` varchar(500),
	`created_at` int NOT NULL,
	`used_in_cards` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `echoe_media_id` PRIMARY KEY(`id`),
	CONSTRAINT `echoe_media_media_id_unique` UNIQUE(`media_id`),
	CONSTRAINT `uid_filename_unique` UNIQUE(`uid`,`filename`)
);
--> statement-breakpoint
CREATE TABLE `echoe_graves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`grave_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`usn` int NOT NULL,
	`oid` varchar(191) NOT NULL,
	`type` int NOT NULL,
	CONSTRAINT `echoe_graves_id` PRIMARY KEY(`id`),
	CONSTRAINT `echoe_graves_grave_id_unique` UNIQUE(`grave_id`)
);
--> statement-breakpoint
CREATE TABLE `echoe_config` (
	`uid` varchar(191) NOT NULL,
	`key` varchar(191) NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `echoe_config_uid_key_pk` PRIMARY KEY(`uid`,`key`)
);
--> statement-breakpoint
CREATE TABLE `inbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inbox_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`front` json NOT NULL,
	`back` json,
	`source` varchar(191),
	`category` varchar(191),
	`is_read` boolean NOT NULL DEFAULT false,
	`deleted_at` bigint NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `inbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `inbox_id_unique` UNIQUE(`inbox_id`)
);
--> statement-breakpoint
CREATE TABLE `inbox_report` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inbox_report_id` varchar(191) NOT NULL,
	`uid` varchar(191) NOT NULL,
	`date` varchar(20) NOT NULL,
	`content` text NOT NULL,
	`summary` text,
	`deleted_at` bigint NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `inbox_report_id` PRIMARY KEY(`id`),
	CONSTRAINT `inbox_report_id_unique` UNIQUE(`inbox_report_id`),
	CONSTRAINT `uid_date_unique` UNIQUE(`uid`,`date`)
);
--> statement-breakpoint
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
CREATE INDEX `email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `phone_idx` ON `users` (`phone`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `users` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `token_id_unique` ON `api_token` (`token_id`);--> statement-breakpoint
CREATE INDEX `uid_idx` ON `api_token` (`uid`);--> statement-breakpoint
CREATE INDEX `token_hash_idx` ON `api_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `api_token` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_col` (`usn`);--> statement-breakpoint
CREATE INDEX `uid_col_id_idx` ON `echoe_col` (`uid`,`col_id`);--> statement-breakpoint
CREATE INDEX `guid_idx` ON `echoe_notes` (`guid`);--> statement-breakpoint
CREATE INDEX `mid_idx` ON `echoe_notes` (`mid`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_notes` (`usn`);--> statement-breakpoint
CREATE INDEX `sfld_idx` ON `echoe_notes` (`sfld`);--> statement-breakpoint
CREATE INDEX `uid_note_id_idx` ON `echoe_notes` (`uid`,`note_id`);--> statement-breakpoint
CREATE INDEX `uid_mid_idx` ON `echoe_notes` (`uid`,`mid`);--> statement-breakpoint
CREATE INDEX `uid_sfld_idx` ON `echoe_notes` (`uid`,`sfld`);--> statement-breakpoint
CREATE INDEX `uid_mod_idx` ON `echoe_notes` (`uid`,`mod`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_notes` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `nid_idx` ON `echoe_cards` (`nid`);--> statement-breakpoint
CREATE INDEX `did_idx` ON `echoe_cards` (`did`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_cards` (`usn`);--> statement-breakpoint
CREATE INDEX `queue_idx` ON `echoe_cards` (`queue`);--> statement-breakpoint
CREATE INDEX `due_idx` ON `echoe_cards` (`due`);--> statement-breakpoint
CREATE INDEX `did_queue_due_idx` ON `echoe_cards` (`did`,`queue`,`due`);--> statement-breakpoint
CREATE INDEX `did_last_review_idx` ON `echoe_cards` (`did`,`last_review`);--> statement-breakpoint
CREATE INDEX `did_stability_idx` ON `echoe_cards` (`did`,`stability`);--> statement-breakpoint
CREATE INDEX `uid_card_id_idx` ON `echoe_cards` (`uid`,`card_id`);--> statement-breakpoint
CREATE INDEX `uid_nid_idx` ON `echoe_cards` (`uid`,`nid`);--> statement-breakpoint
CREATE INDEX `uid_did_queue_due_idx` ON `echoe_cards` (`uid`,`did`,`queue`,`due`);--> statement-breakpoint
CREATE INDEX `uid_last_review_idx` ON `echoe_cards` (`uid`,`last_review`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_cards` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `cid_idx` ON `echoe_revlog` (`cid`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_revlog` (`usn`);--> statement-breakpoint
CREATE INDEX `uid_idx` ON `echoe_revlog` (`uid`);--> statement-breakpoint
CREATE INDEX `uid_revlog_id_idx` ON `echoe_revlog` (`uid`,`revlog_id`);--> statement-breakpoint
CREATE INDEX `uid_cid_idx` ON `echoe_revlog` (`uid`,`cid`);--> statement-breakpoint
CREATE INDEX `uid_source_revlog_id_idx` ON `echoe_revlog` (`uid`,`source_revlog_id`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_revlog` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `echoe_decks` (`name`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_decks` (`usn`);--> statement-breakpoint
CREATE INDEX `uid_deck_id_idx` ON `echoe_decks` (`uid`,`deck_id`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_decks` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `echoe_deck_config` (`name`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_deck_config` (`usn`);--> statement-breakpoint
CREATE INDEX `uid_deck_config_id_idx` ON `echoe_deck_config` (`uid`,`deck_config_id`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_deck_config` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `name_idx` ON `echoe_notetypes` (`name`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_notetypes` (`usn`);--> statement-breakpoint
CREATE INDEX `uid_note_type_id_idx` ON `echoe_notetypes` (`uid`,`note_type_id`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_notetypes` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `ntid_idx` ON `echoe_templates` (`ntid`);--> statement-breakpoint
CREATE INDEX `ord_idx` ON `echoe_templates` (`ord`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_templates` (`usn`);--> statement-breakpoint
CREATE INDEX `uid_template_id_idx` ON `echoe_templates` (`uid`,`template_id`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `echoe_templates` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `filename_idx` ON `echoe_media` (`filename`);--> statement-breakpoint
CREATE INDEX `hash_idx` ON `echoe_media` (`hash`);--> statement-breakpoint
CREATE INDEX `uid_media_id_idx` ON `echoe_media` (`uid`,`media_id`);--> statement-breakpoint
CREATE INDEX `oid_idx` ON `echoe_graves` (`oid`);--> statement-breakpoint
CREATE INDEX `type_idx` ON `echoe_graves` (`type`);--> statement-breakpoint
CREATE INDEX `usn_idx` ON `echoe_graves` (`usn`);--> statement-breakpoint
CREATE INDEX `uid_grave_id_idx` ON `echoe_graves` (`uid`,`grave_id`);--> statement-breakpoint
CREATE INDEX `uid_oid_type_idx` ON `echoe_graves` (`uid`,`oid`,`type`);--> statement-breakpoint
CREATE INDEX `uid_idx` ON `inbox` (`uid`);--> statement-breakpoint
CREATE INDEX `category_idx` ON `inbox` (`category`);--> statement-breakpoint
CREATE INDEX `is_read_idx` ON `inbox` (`is_read`);--> statement-breakpoint
CREATE INDEX `uid_is_read_idx` ON `inbox` (`uid`,`is_read`);--> statement-breakpoint
CREATE INDEX `uid_category_idx` ON `inbox` (`uid`,`category`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `inbox` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `uid_idx` ON `inbox_report` (`uid`);--> statement-breakpoint
CREATE INDEX `date_idx` ON `inbox_report` (`date`);--> statement-breakpoint
CREATE INDEX `uid_idx` ON `inbox_source` (`uid`);--> statement-breakpoint
CREATE INDEX `uid_idx` ON `inbox_category` (`uid`);