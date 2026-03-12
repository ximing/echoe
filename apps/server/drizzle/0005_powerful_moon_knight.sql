ALTER TABLE `echoe_revlog` ADD `stability` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `difficulty` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `last_review` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_due` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_ivl` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_factor` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_reps` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_lapses` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_left` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_type` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_queue` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_stability` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_difficulty` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_revlog` ADD `pre_last_review` bigint DEFAULT 0 NOT NULL;