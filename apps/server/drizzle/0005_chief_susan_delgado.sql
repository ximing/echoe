ALTER TABLE `inbox` MODIFY COLUMN `source` varchar(50) NOT NULL DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `inbox` MODIFY COLUMN `category` varchar(50) NOT NULL DEFAULT 'backend';