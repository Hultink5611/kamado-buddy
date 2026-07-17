import * as SQLite from 'expo-sqlite';
import type { Cook, LearnedSetting } from '../logic/types';

let _db: SQLite.SQLiteDatabase | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('kamado.db');
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cooks (
      id TEXT PRIMARY KEY NOT NULL,
      started_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS learned (
      band_max INTEGER PRIMARY KEY NOT NULL,
      data TEXT NOT NULL
    );
  `);
  return _db;
}

/* ---- cooks ---- */

export async function saveCook(cook: Cook): Promise<void> {
  const d = await db();
  await d.runAsync(
    'INSERT OR REPLACE INTO cooks (id, started_at, data) VALUES (?, ?, ?)',
    cook.id,
    cook.startedAt,
    JSON.stringify(cook)
  );
}

export async function listCooks(): Promise<Cook[]> {
  const d = await db();
  const rows = await d.getAllAsync<{ data: string }>(
    'SELECT data FROM cooks ORDER BY started_at DESC'
  );
  return rows.map((r) => JSON.parse(r.data) as Cook);
}

export async function getCook(id: string): Promise<Cook | null> {
  const d = await db();
  const row = await d.getFirstAsync<{ data: string }>(
    'SELECT data FROM cooks WHERE id = ?',
    id
  );
  return row ? (JSON.parse(row.data) as Cook) : null;
}

export async function deleteCook(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM cooks WHERE id = ?', id);
}

/* ---- settings (key/value) ---- */

export async function getSetting(key: string): Promise<string | null> {
  const d = await db();
  const row = await d.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const d = await db();
  await d.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    key,
    value
  );
}

/* ---- learned vent settings ---- */

export async function getLearned(): Promise<LearnedSetting[]> {
  const d = await db();
  const rows = await d.getAllAsync<{ data: string }>('SELECT data FROM learned');
  return rows.map((r) => JSON.parse(r.data) as LearnedSetting);
}

export async function saveLearned(list: LearnedSetting[]): Promise<void> {
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM learned');
    for (const l of list) {
      await d.runAsync(
        'INSERT OR REPLACE INTO learned (band_max, data) VALUES (?, ?)',
        l.bandMaxC,
        JSON.stringify(l)
      );
    }
  });
}

/* ---- export ---- */

export async function exportAll(): Promise<string> {
  const [cooks, learned] = await Promise.all([listCooks(), getLearned()]);
  return JSON.stringify({ exportedAt: Date.now(), cooks, learned }, null, 2);
}
