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

    CREATE TABLE IF NOT EXISTS blockers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      comment TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      is_resolved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      CHECK(severity IN ('low', 'medium', 'high', 'critical'))
    );

    CREATE INDEX IF NOT EXISTS idx_type ON tasks(type);
    CREATE INDEX IF NOT EXISTS idx_created_at ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_external_id ON tasks(external_id);
    CREATE INDEX IF NOT EXISTS idx_date ON time_entries(date);
    CREATE INDEX IF NOT EXISTS idx_task_date ON time_entries(task_id, date);
    CREATE INDEX IF NOT EXISTS idx_dayoff_date ON day_offs(date);
    CREATE INDEX IF NOT EXISTS idx_blocker_task_id ON blockers(task_id);
    CREATE INDEX IF NOT EXISTS idx_blocker_resolved ON blockers(is_resolved);
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

  // Migration: Add display_order column if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    const hasDisplayOrderColumn = tableInfo.some(col => col.name === 'display_order');
    
    if (!hasDisplayOrderColumn) {
      console.log('Adding display_order column to tasks table...');
      db.exec('ALTER TABLE tasks ADD COLUMN display_order INTEGER');
      
      // Set display_order for existing tasks based on their current order
      const existingTasks = db.prepare('SELECT id FROM tasks ORDER BY created_at ASC').all() as Array<{ id: number }>;
      const updateStmt = db.prepare('UPDATE tasks SET display_order = ? WHERE id = ?');
      existingTasks.forEach((task, index) => {
        updateStmt.run(index, task.id);
      });
      
      console.log('Display order column added and initialized successfully');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  // Migration: Add completed_at column if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    const hasCompletedAtColumn = tableInfo.some(col => col.name === 'completed_at');
    
    if (!hasCompletedAtColumn) {
      console.log('Adding completed_at column to tasks table...');
      db.exec('ALTER TABLE tasks ADD COLUMN completed_at DATETIME');
      console.log('Completed_at column added successfully');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
};

// Initialize on first import
initDb();

export default db;
