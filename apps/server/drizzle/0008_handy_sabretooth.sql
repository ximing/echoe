ALTER TABLE `echoe_revlog` MODIFY COLUMN `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_notes` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_cards` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_media` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_graves` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_notes` ADD CONSTRAINT `uid_guid_unique` UNIQUE(`uid`,`guid`);--> statement-breakpoint
ALTER TABLE `echoe_media` ADD CONSTRAINT `uid_filename_unique` UNIQUE(`uid`,`filename`);--> statement-breakpoint
CREATE INDEX `uid_mid_idx` ON `echoe_notes` (`uid`,`mid`);--> statement-breakpoint
CREATE INDEX `uid_sfld_idx` ON `echoe_notes` (`uid`,`sfld`);--> statement-breakpoint
CREATE INDEX `uid_mod_idx` ON `echoe_notes` (`uid`,`mod`);--> statement-breakpoint
CREATE INDEX `uid_nid_idx` ON `echoe_cards` (`uid`,`nid`);--> statement-breakpoint
CREATE INDEX `uid_did_queue_due_idx` ON `echoe_cards` (`uid`,`did`,`queue`,`due`);--> statement-breakpoint
CREATE INDEX `uid_last_review_idx` ON `echoe_cards` (`uid`,`last_review`);--> statement-breakpoint
CREATE INDEX `uid_cid_idx` ON `echoe_revlog` (`uid`,`cid`);--> statement-breakpoint
CREATE INDEX `uid_id_idx` ON `echoe_revlog` (`uid`,`id`);--> statement-breakpoint
CREATE INDEX `uid_name_idx` ON `echoe_deck_config` (`uid`,`name`);--> statement-breakpoint
CREATE INDEX `uid_oid_type_idx` ON `echoe_graves` (`uid`,`oid`,`type`);