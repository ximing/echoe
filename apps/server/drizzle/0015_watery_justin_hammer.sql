ALTER TABLE `echoe_revlog` ADD `source_revlog_id` bigint;--> statement-breakpoint
CREATE INDEX `uid_source_revlog_id_idx` ON `echoe_revlog` (`uid`,`source_revlog_id`);