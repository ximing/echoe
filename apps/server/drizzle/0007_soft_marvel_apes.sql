ALTER TABLE `echoe_col` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_decks` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_deck_config` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_notetypes` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_templates` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
ALTER TABLE `echoe_config` ADD `uid` varchar(191) NOT NULL;--> statement-breakpoint
SET @echoe_config_has_primary := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'echoe_config'
    AND CONSTRAINT_TYPE = 'PRIMARY KEY'
);--> statement-breakpoint
SET @echoe_config_drop_pk_sql := IF(
  @echoe_config_has_primary > 0,
  'ALTER TABLE `echoe_config` DROP PRIMARY KEY',
  'SELECT 1'
);--> statement-breakpoint
PREPARE echoe_config_drop_pk_stmt FROM @echoe_config_drop_pk_sql;--> statement-breakpoint
EXECUTE echoe_config_drop_pk_stmt;--> statement-breakpoint
DEALLOCATE PREPARE echoe_config_drop_pk_stmt;--> statement-breakpoint
ALTER TABLE `echoe_config` ADD PRIMARY KEY(`uid`,`key`);--> statement-breakpoint
ALTER TABLE `echoe_col` ADD CONSTRAINT `uid_unique` UNIQUE(`uid`);--> statement-breakpoint
ALTER TABLE `echoe_decks` ADD CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`);--> statement-breakpoint
ALTER TABLE `echoe_deck_config` ADD CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`);--> statement-breakpoint
ALTER TABLE `echoe_notetypes` ADD CONSTRAINT `uid_name_unique` UNIQUE(`uid`,`name`);--> statement-breakpoint
ALTER TABLE `echoe_templates` ADD CONSTRAINT `uid_ntid_ord_unique` UNIQUE(`uid`,`ntid`,`ord`);
