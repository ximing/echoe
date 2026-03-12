ALTER TABLE `echoe_cards` ADD `stability` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_cards` ADD `difficulty` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_cards` ADD `last_review` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `did_queue_due_idx` ON `echoe_cards` (`did`,`queue`,`due`);--> statement-breakpoint
CREATE INDEX `did_last_review_idx` ON `echoe_cards` (`did`,`last_review`);--> statement-breakpoint
CREATE INDEX `did_stability_idx` ON `echoe_cards` (`did`,`stability`);