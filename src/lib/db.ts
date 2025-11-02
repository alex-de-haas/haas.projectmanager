import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'time_tracker.db');

// Create database if it doesn't exist
const db = new Database(dbPath);

// Initialize database schema
const initDb = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'task',
      status TEXT,
      external_id TEXT,
      external_source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK(type IN ('task', 'bug'))
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      hours REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      UNIQUE(task_id, date)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS day_offs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_type ON tasks(type);
    CREATE INDEX IF NOT EXISTS idx_created_at ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_external_id ON tasks(external_id);
    CREATE INDEX IF NOT EXISTS idx_date ON time_entries(date);
    CREATE INDEX IF NOT EXISTS idx_task_date ON time_entries(task_id, date);
    CREATE INDEX IF NOT EXISTS idx_dayoff_date ON day_offs(date);
  `);

  // Migration: Add status column if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    const hasStatusColumn = tableInfo.some(col => col.name === 'status');
    
    if (!hasStatusColumn) {
      console.log('Adding status column to tasks table...');
      db.exec('ALTER TABLE tasks ADD COLUMN status TEXT');
      console.log('Status column added successfully');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
};

// Initialize on first import
initDb();

export default db;
