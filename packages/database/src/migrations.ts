import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { validateMigrationSql } from './sql-guard.js';

export type Migration = Readonly<{ name: string; sql: string; checksum: string }>;
export type MigrationRow = { name: string; checksum: string };

export function migration(name: string, sql: string): Migration {
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name) || !sql.trim()) throw new Error('Invalid migration file');
  validateMigrationSql(sql);
  return Object.freeze({ name, sql, checksum: createHash('sha256').update(sql, 'utf8').digest('hex') });
}

export function validateMigrationOrder(entries: readonly Migration[]): void {
  if (!entries.length) throw new Error('Migration manifest is empty');
  for (const [index, entry] of entries.entries()) {
    const verified = migration(entry.name, entry.sql);
    if (Number(entry.name.slice(0, 4)) !== index + 1 || verified.checksum !== entry.checksum) throw new Error('Migration order or checksum is invalid');
  }
}

export async function loadMigrations(directory = path.resolve('database/migrations')): Promise<readonly Migration[]> {
  const files = (await readdir(directory, { withFileTypes: true })).filter((file) => file.name.endsWith('.sql'));
  if (files.some((file) => !file.isFile())) throw new Error('Migration entries must be regular files');
  const entries = await Promise.all(files.map(async (file) => migration(file.name, await readFile(path.join(directory, file.name), 'utf8'))));
  entries.sort((left, right) => left.name.localeCompare(right.name));
  validateMigrationOrder(entries);
  return Object.freeze(entries);
}

export function verifyApplied(entries: readonly Migration[], applied: readonly MigrationRow[]): void {
  validateMigrationOrder(entries);
  for (const [index, row] of applied.entries()) {
    const expected = entries[index];
    if (!expected || expected.name !== row.name || expected.checksum !== row.checksum) throw new Error('Applied migration history differs from source');
  }
}

export async function applyMigrations(pool: Pool, entries: readonly Migration[]): Promise<number> {
  validateMigrationOrder(entries);
  const client: PoolClient = await pool.connect();
  let discardConnection = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query('SELECT pg_advisory_xact_lock($1)', [1279542601]);
    await client.query('CREATE SCHEMA IF NOT EXISTS engine_meta');
    await client.query('REVOKE ALL ON SCHEMA engine_meta FROM PUBLIC');
    await client.query('CREATE TABLE IF NOT EXISTS engine_meta.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL CHECK (length(checksum) = 64), applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = await client.query<MigrationRow>('SELECT name, checksum FROM engine_meta.schema_migrations ORDER BY name');
    verifyApplied(entries, applied.rows);
    for (const entry of entries.slice(applied.rows.length)) {
      // SQL is trusted, reviewed repository migration content, never request/model input.
      await client.query(entry.sql);
      await client.query('INSERT INTO engine_meta.schema_migrations (name, checksum) VALUES ($1, $2)', [entry.name, entry.checksum]);
    }
    await client.query('COMMIT');
    return entries.length - applied.rows.length;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discardConnection = true; }
    throw error;
  } finally { client.release(discardConnection); }
}

export async function schemaCompatible(pool: Pool, entries: readonly Migration[]): Promise<boolean> {
  const applied = await pool.query<MigrationRow>('SELECT name, checksum FROM engine_meta.schema_migrations ORDER BY name');
  verifyApplied(entries, applied.rows);
  return applied.rows.length === entries.length;
}
