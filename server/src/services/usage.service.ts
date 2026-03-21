import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { env } from '../config';

const DB_PATH = path.join(__dirname, '../../data/usage.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage (
        user_id TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        last_reset TEXT
      )
    `);
  }
  return db;
}

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export class UsageService {
  private static freeLimit = parseInt(env.FREE_QUERIES_PER_DAY || '10', 10);

  static checkLimit(userId: string, hasBYOK: boolean = false): { allowed: boolean; remaining: number } {
    if (hasBYOK) {
      return { allowed: true, remaining: Infinity };
    }

    const today = getTodayKey();
    const row = getDb().prepare('SELECT * FROM usage WHERE user_id = ?').get(userId) as { count: number; last_reset: string } | undefined;

    if (!row || row.last_reset !== today) {
      return { allowed: true, remaining: this.freeLimit };
    }

    const remaining = Math.max(0, this.freeLimit - row.count);
    return {
      allowed: row.count < this.freeLimit,
      remaining,
    };
  }

  static incrementUsage(userId: string): void {
    const today = getTodayKey();
    const existing = getDb().prepare('SELECT * FROM usage WHERE user_id = ?').get(userId) as { count: number; last_reset: string } | undefined;

    if (!existing || existing.last_reset !== today) {
      getDb().prepare('INSERT OR REPLACE INTO usage (user_id, count, last_reset) VALUES (?, 1, ?)').run(userId, today);
    } else {
      getDb().prepare('UPDATE usage SET count = count + 1 WHERE user_id = ?').run(userId);
    }
  }

  static getUsage(userId: string): { used: number; remaining: number; resetAt: string } {
    const today = getTodayKey();
    const row = getDb().prepare('SELECT * FROM usage WHERE user_id = ?').get(userId) as { count: number; last_reset: string } | undefined;

    const used = row?.last_reset === today ? row.count : 0;
    const remaining = Math.max(0, this.freeLimit - used);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    return {
      used,
      remaining,
      resetAt: tomorrow.toISOString(),
    };
  }
}
