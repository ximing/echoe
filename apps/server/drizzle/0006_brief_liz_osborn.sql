ALTER TABLE `echoe_revlog` ADD `uid` varchar(191);--> statement-breakpoint
CREATE INDEX `uid_idx` ON `echoe_revlog` (`uid`);