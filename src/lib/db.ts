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
      is_half_day INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS release_work_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      external_id TEXT,
      external_source TEXT,
      work_item_type TEXT,
      state TEXT,
      tags TEXT,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_type ON tasks(type);
    CREATE INDEX IF NOT EXISTS idx_created_at ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_external_id ON tasks(external_id);
    CREATE INDEX IF NOT EXISTS idx_date ON time_entries(date);
    CREATE INDEX IF NOT EXISTS idx_task_date ON time_entries(task_id, date);
    CREATE INDEX IF NOT EXISTS idx_dayoff_date ON day_offs(date);
    CREATE INDEX IF NOT EXISTS idx_release_start_date ON releases(start_date);
    CREATE INDEX IF NOT EXISTS idx_release_end_date ON releases(end_date);
    CREATE INDEX IF NOT EXISTS idx_release_work_items_release_id ON release_work_items(release_id);
    CREATE INDEX IF NOT EXISTS idx_release_work_items_external_id ON release_work_items(external_id);
    CREATE INDEX IF NOT EXISTS idx_blocker_task_id ON blockers(task_id);
    CREATE INDEX IF NOT EXISTS idx_blocker_resolved ON blockers(is_resolved);
    CREATE INDEX IF NOT EXISTS idx_checklist_task_id ON checklist_items(task_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_order ON checklist_items(task_id, display_order);
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

  // Migration: Add is_half_day column to day_offs table if it doesn't exist
  try {
    const dayOffTableInfo = db.prepare("PRAGMA table_info(day_offs)").all() as Array<{ name: string }>;
    const hasHalfDayColumn = dayOffTableInfo.some(col => col.name === 'is_half_day');

    if (!hasHalfDayColumn) {
      console.log('Adding is_half_day column to day_offs table...');
      db.exec('ALTER TABLE day_offs ADD COLUMN is_half_day INTEGER NOT NULL DEFAULT 0');
      console.log('is_half_day column added successfully');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  // Migration: Add display_order column to release_work_items table if it doesn't exist
  try {
    const releaseWorkItemsTableInfo = db.prepare("PRAGMA table_info(release_work_items)").all() as Array<{ name: string }>;
    const hasDisplayOrderColumn = releaseWorkItemsTableInfo.some(col => col.name === 'display_order');
    
    if (!hasDisplayOrderColumn) {
      console.log('Adding display_order column to release_work_items table...');
      db.exec('ALTER TABLE release_work_items ADD COLUMN display_order INTEGER DEFAULT 0');
      
      // Set display_order for existing work items based on their current order per release
      const releases = db.prepare('SELECT DISTINCT release_id FROM release_work_items').all() as Array<{ release_id: number }>;
      const updateStmt = db.prepare('UPDATE release_work_items SET display_order = ? WHERE id = ?');
      
      for (const { release_id } of releases) {
        const existingWorkItems = db.prepare('SELECT id FROM release_work_items WHERE release_id = ? ORDER BY created_at ASC').all(release_id) as Array<{ id: number }>;
        existingWorkItems.forEach((item, index) => {
          updateStmt.run(index, item.id);
        });
      }
      
      console.log('Display order column added to release_work_items and initialized successfully');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  // Migration: Add tags column to release_work_items table if it doesn't exist
  try {
    const releaseWorkItemsTableInfo = db.prepare("PRAGMA table_info(release_work_items)").all() as Array<{ name: string }>;
    const hasTagsColumn = releaseWorkItemsTableInfo.some(col => col.name === 'tags');
    
    if (!hasTagsColumn) {
      console.log('Adding tags column to release_work_items table...');
      db.exec('ALTER TABLE release_work_items ADD COLUMN tags TEXT');
      console.log('Tags column added to release_work_items successfully');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  // Insert default settings if they don't exist
  try {
    const defaultDayLengthSetting = db.prepare('SELECT * FROM settings WHERE key = ?').get('default_day_length');
    if (!defaultDayLengthSetting) {
      console.log('Creating default_day_length setting...');
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('default_day_length', '8');
      console.log('Default day length setting created (8 hours)');
    }
  } catch (error) {
    console.error('Error creating default settings:', error);
  }
};

// Initialize on first import
initDb();

export default db;
