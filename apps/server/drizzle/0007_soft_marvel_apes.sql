ALTER TABLE `echoe_config` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `echoe_config` ADD PRIMARY KEY(`uid`,`key`);--> statement-breakpoint
ALTER TABLE `echoe_col` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_decks` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_deck_config` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_notetypes` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_templates` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_config` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_col` ADD CONSTRAINT `uid_unique` UNIQUE(`uid`);--> statement-breakpoint
ALTER TABLE `echoe_decks` ADD CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`);--> statement-breakpoint
ALTER TABLE `echoe_deck_config` ADD CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`);--> statement-breakpoint
ALTER TABLE `echoe_notetypes` ADD CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`);--> statement-breakpoint
ALTER TABLE `echoe_templates` ADD CONSTRAINT `uid_ntid_ord_unique` UNIQUE(`uid`,`ntid`,`ord`);
