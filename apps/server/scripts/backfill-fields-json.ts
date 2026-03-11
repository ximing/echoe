#!/usr/bin/env tsx

/**
 * Backfill Script: Populate fields_json from flds + fld_names
 *
 * Reads each note's flds (\x1f-separated) and fld_names (JSON array),
 * combines them into Record<string, string>, and writes to fields_json.
 *
 * Notes where fields_json already has non-empty values are skipped (idempotent).
 *
 * Usage:
 *   cd apps/server
 *   pnpm tsx scripts/backfill-fields-json.ts
 *
 * Exit codes:
 *   0 - Completed successfully
 *   1 - Fatal error
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { isNull, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema/index.js';
import type { CanonicalFields } from '../src/types/note-fields.js';

const { echoeNotes } = schema;

// Statistics counters
let total = 0;
let succeeded = 0;
let skipped = 0;
let failed = 0;

async function main() {
  console.log('\n🔄 Starting fields_json backfill...\n');

  const dbConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'echoe',
  };

  console.log(`📊 Connecting to database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

  const pool = mysql.createPool({
    ...dbConfig,
    connectionLimit: 5,
    waitForConnections: true,
  });

  const db = drizzle(pool, { schema, mode: 'default' });

  try {
    // Fetch all notes (select only needed columns for efficiency)
    const notes = await db
      .select({
        id: echoeNotes.id,
        flds: echoeNotes.flds,
        fldNames: echoeNotes.fldNames,
        fieldsJson: echoeNotes.fieldsJson,
      })
      .from(echoeNotes);

    total = notes.length;
    console.log(`📋 Found ${total} notes to process\n`);

    for (const note of notes) {
      try {
        // Skip notes where fields_json is already non-empty
        const existingFieldsJson = note.fieldsJson as CanonicalFields | null;
        if (existingFieldsJson && typeof existingFieldsJson === 'object' && Object.keys(existingFieldsJson).length > 0) {
          skipped++;
          continue;
        }

        // Parse fld_names — already a string[] from JSON column (or null)
        let fieldNames: string[];
        if (Array.isArray(note.fldNames)) {
          fieldNames = note.fldNames as string[];
        } else if (typeof note.fldNames === 'string') {
          // Fallback: parse as JSON string if column returned as string
          try {
            fieldNames = JSON.parse(note.fldNames as string) as string[];
          } catch {
            fieldNames = [];
          }
        } else {
          fieldNames = [];
        }

        // Parse flds — \x1f-separated values
        const fieldValues = note.flds ? note.flds.split('\x1f') : [];

        // Build fields_json: map field name → value
        const fieldsJson: CanonicalFields = {};
        for (let i = 0; i < fieldNames.length; i++) {
          fieldsJson[fieldNames[i] || `field_${i}`] = fieldValues[i] || '';
        }

        // If we have no field names but have field values, create generic keys
        if (fieldNames.length === 0 && fieldValues.length > 0) {
          for (let i = 0; i < fieldValues.length; i++) {
            fieldsJson[`field_${i}`] = fieldValues[i] || '';
          }
        }

        // Write to database
        await db
          .update(echoeNotes)
          .set({ fieldsJson })
          .where(sql`${echoeNotes.id} = ${note.id}`);

        succeeded++;
      } catch (err) {
        failed++;
        console.error(`  ❌ Failed to process note ${note.id}:`, err);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('📋 BACKFILL SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total notes:     ${total}`);
    console.log(`  ✅ Succeeded:  ${succeeded}`);
    console.log(`  ⏭️  Skipped:   ${skipped}`);
    console.log(`  ❌ Failed:     ${failed}`);
    console.log('='.repeat(50));

    if (failed > 0) {
      console.log('\n⚠️  Some notes failed to backfill. Check logs above for details.');
    } else {
      console.log('\n✅ Backfill completed successfully.');
    }

    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Fatal error during backfill:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
