import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database | null = null;

export async function getDb(): Promise<Database> {
    if (db) return db;

    const dbPath = path.resolve(__dirname, '../../testgen_data.sqlite');

    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await initializeDb(db);
    return db;
}

async function initializeDb(database: Database) {
    await database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

    await database.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      requirement TEXT NOT NULL,
      generated_tests TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function getSetting(key: string): Promise<string | null> {
    const database = await getDb();
    const result = await database.get('SELECT value FROM settings WHERE key = ?', [key]);
    return result ? result.value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
    const database = await getDb();
    await database.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value]
    );
}

export async function getAllSettings(): Promise<Record<string, string>> {
    const database = await getDb();
    const results = await database.all('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const row of results) {
        settings[row.key] = row.value;
    }
    return settings;
}
