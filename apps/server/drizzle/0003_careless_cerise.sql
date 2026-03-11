-- Convert rich_text_fields: parse existing text values as JSON objects
-- Rows where the value is NULL or already valid JSON are left as-is
-- Rows where the value is not valid JSON are set to NULL (safe fallback)
UPDATE `echoe_notes`
SET `rich_text_fields` = CASE
  WHEN `rich_text_fields` IS NULL THEN NULL
  WHEN JSON_VALID(`rich_text_fields`) THEN `rich_text_fields`
  ELSE NULL
END
WHERE `rich_text_fields` IS NOT NULL;
--> statement-breakpoint
-- Convert fld_names: parse existing text values as JSON arrays
-- Rows where the value is NULL or already valid JSON are left as-is
-- Rows where the value is not valid JSON are set to NULL (safe fallback)
UPDATE `echoe_notes`
SET `fld_names` = CASE
  WHEN `fld_names` IS NULL THEN NULL
  WHEN JSON_VALID(`fld_names`) THEN `fld_names`
  ELSE NULL
END
WHERE `fld_names` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `echoe_notes` MODIFY COLUMN `rich_text_fields` json;--> statement-breakpoint
ALTER TABLE `echoe_notes` MODIFY COLUMN `fld_names` json;