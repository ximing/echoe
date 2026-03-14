#!/usr/bin/env node
/**
 * Docker Migration Script
 *
 * This script handles database migrations in Docker environment.
 * It can run three types of migrations:
 * 1. generate - Generate new Drizzle migration files
 * 2. migrate - Run pending Drizzle migrations
 * 3. migrate-data - Migrate data from LanceDB to MySQL (one-time)
 *
 * Usage:
 *   node docker-migrate.js generate
 *   node docker-migrate.js migrate
 *   node docker-migrate.js migrate-data
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { info, error } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

const command = process.argv[2];

if (!command || !['generate', 'migrate', 'migrate-data'].includes(command)) {
  error('Usage: node docker-migrate.js <generate|migrate|migrate-data>');
  error('');
  error('Commands:');
  error('  generate      - Generate new Drizzle migration files');
  error('  migrate       - Run pending Drizzle migrations');
  error('  migrate-data  - Migrate data from LanceDB to MySQL (one-time)');
  process.exit(1);
}

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    info(`Running: ${cmd} ${args.join(' ')}`);

    const proc = spawn(cmd, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  try {
    switch (command) {
      case 'generate':
        info('Generating Drizzle migration files...');
        await runCommand('pnpm', ['drizzle-kit', 'generate']);
        info('Migration files generated successfully');
        break;

      case 'migrate':
        info('Running Drizzle migrations...');
        await runCommand('node', ['--loader', 'ts-node/esm', './src/db/migrate.ts']);
        info('Migrations completed successfully');
        break;

      case 'migrate-data':
        info('Migrating data from LanceDB to MySQL...');
        info('This is a one-time operation. Make sure you have backups!');
        await runCommand('tsx', ['src/scripts/migrate-lancedb-to-mysql.ts']);
        info('Data migration completed successfully');
        break;
    }
  } catch (err) {
    error('Migration failed:', err);
    process.exit(1);
  }
}

main();
