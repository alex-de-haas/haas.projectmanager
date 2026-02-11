import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDirPath = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDirPath, 'time_tracker.db');
const backupDirPath = path.join(dataDirPath, 'backups');
const legacyDbPath = path.join(process.cwd(), 'time_tracker.db');
const legacyBackupDirPath = path.join(process.cwd(), 'db_backups');
const backupAlias = 'restore_source';

const ensureDataDirectory = () => {
  if (!fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath, { recursive: true });
  }
};

const migrateLegacyStorage = () => {
  ensureDataDirectory();

  if (!fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) {
    fs.renameSync(legacyDbPath, dbPath);
  }

  if (fs.existsSync(legacyBackupDirPath)) {
    if (!fs.existsSync(backupDirPath)) {
      fs.mkdirSync(backupDirPath, { recursive: true });
    }

    for (const entry of fs.readdirSync(legacyBackupDirPath)) {
      const legacyEntryPath = path.join(legacyBackupDirPath, entry);
      const newEntryPath = path.join(backupDirPath, entry);

      if (!fs.existsSync(newEntryPath)) {
        fs.renameSync(legacyEntryPath, newEntryPath);
      }
    }

    if (fs.readdirSync(legacyBackupDirPath).length === 0) {
      fs.rmdirSync(legacyBackupDirPath);
    }
  }
};

migrateLegacyStorage();

// Create database if it doesn't exist
const db = new Database(dbPath);

// Initialize database schema
const initDb = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      email TEXT,
      password_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'task',
      status TEXT,
      external_id TEXT,
      external_source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
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
      user_id INTEGER NOT NULL DEFAULT 1,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, key)
    );

    CREATE TABLE IF NOT EXISTS day_offs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      date TEXT NOT NULL,
      description TEXT,
      is_half_day INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS release_work_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      release_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      external_id TEXT,
      external_source TEXT,
      work_item_type TEXT,
      state TEXT,
      tags TEXT,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blockers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      task_id INTEGER NOT NULL,
      comment TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      is_resolved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      CHECK(severity IN ('low', 'medium', 'high', 'critical'))
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_release_status ON releases(status);
    CREATE INDEX IF NOT EXISTS idx_release_work_items_release_id ON release_work_items(release_id);
    CREATE INDEX IF NOT EXISTS idx_release_work_items_external_id ON release_work_items(external_id);
    CREATE INDEX IF NOT EXISTS idx_blocker_task_id ON blockers(task_id);
    CREATE INDEX IF NOT EXISTS idx_blocker_resolved ON blockers(is_resolved);
    CREATE INDEX IF NOT EXISTS idx_checklist_task_id ON checklist_items(task_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_order ON checklist_items(task_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_user_invitations_user_id ON user_invitations(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_invitations_expires_at ON user_invitations(expires_at);
  `);

  const ensureUserColumn = (tableName: string) => {
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    const hasUserIdColumn = tableInfo.some((col) => col.name === "user_id");
    if (!hasUserIdColumn) {
      console.log(`Adding user_id column to ${tableName} table...`);
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1`);
      console.log(`user_id column added to ${tableName} successfully`);
    }
  };

  try {
    ensureUserColumn("tasks");
    ensureUserColumn("releases");
    ensureUserColumn("release_work_items");
    ensureUserColumn("blockers");
    ensureUserColumn("checklist_items");
  } catch (error) {
    console.error('Migration error:', error);
  }

  try {
    const usersTableInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const hasEmailColumn = usersTableInfo.some((col) => col.name === "email");
    const hasPasswordHashColumn = usersTableInfo.some((col) => col.name === "password_hash");

    if (!hasEmailColumn) {
      db.exec("ALTER TABLE users ADD COLUMN email TEXT");
    }
    if (!hasPasswordHashColumn) {
      db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
    }

    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email)");
  } catch (error) {
    console.error('Migration error:', error);
  }

  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS idx_settings_user_key ON settings(user_id, key);
      CREATE INDEX IF NOT EXISTS idx_dayoffs_user_date ON day_offs(user_id, date);
      CREATE INDEX IF NOT EXISTS idx_releases_user_id ON releases(user_id);
      CREATE INDEX IF NOT EXISTS idx_release_work_items_user_id ON release_work_items(user_id);
      CREATE INDEX IF NOT EXISTS idx_blockers_user_id ON blockers(user_id);
      CREATE INDEX IF NOT EXISTS idx_checklist_user_id ON checklist_items(user_id);
    `);
  } catch (error) {
    console.error('Migration error:', error);
  }

  try {
    const dayOffTableInfo = db.prepare("PRAGMA table_info(day_offs)").all() as Array<{ name: string }>;
    const hasUserIdColumn = dayOffTableInfo.some((col) => col.name === "user_id");

    if (!hasUserIdColumn) {
      console.log("Migrating day_offs table for multi-user support...");
      db.exec(`
        CREATE TABLE day_offs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1,
          date TEXT NOT NULL,
          description TEXT,
          is_half_day INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, date)
        );
      `);
      db.exec(`
        INSERT INTO day_offs_new (id, user_id, date, description, is_half_day, created_at)
        SELECT id, 1, date, description, COALESCE(is_half_day, 0), created_at FROM day_offs;
      `);
      db.exec("DROP TABLE day_offs");
      db.exec("ALTER TABLE day_offs_new RENAME TO day_offs");
      db.exec("CREATE INDEX IF NOT EXISTS idx_dayoffs_user_date ON day_offs(user_id, date)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_dayoff_date ON day_offs(date)");
      console.log("day_offs table migrated successfully");
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  try {
    const settingsTableInfo = db.prepare("PRAGMA table_info(settings)").all() as Array<{ name: string }>;
    const hasUserIdColumn = settingsTableInfo.some((col) => col.name === "user_id");

    if (!hasUserIdColumn) {
      console.log("Migrating settings table for multi-user support...");
      db.exec(`
        CREATE TABLE settings_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, key)
        );
      `);
      db.exec(`
        INSERT INTO settings_new (id, user_id, key, value, created_at, updated_at)
        SELECT id, 1, key, value, created_at, updated_at FROM settings;
      `);
      db.exec("DROP TABLE settings");
      db.exec("ALTER TABLE settings_new RENAME TO settings");
      db.exec("CREATE INDEX IF NOT EXISTS idx_settings_user_key ON settings(user_id, key)");
      console.log("settings table migrated successfully");
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

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

  // Migration: Add status column to releases table if it doesn't exist
  try {
    const releasesTableInfo = db.prepare("PRAGMA table_info(releases)").all() as Array<{ name: string }>;
    const hasStatusColumn = releasesTableInfo.some(col => col.name === 'status');

    if (!hasStatusColumn) {
      console.log('Adding status column to releases table...');
      db.exec("ALTER TABLE releases ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
      console.log('Status column added to releases successfully');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  // Migration: Add display_order column to releases table if it doesn't exist
  try {
    const releasesTableInfo = db.prepare("PRAGMA table_info(releases)").all() as Array<{ name: string }>;
    const hasDisplayOrderColumn = releasesTableInfo.some(col => col.name === 'display_order');

    if (!hasDisplayOrderColumn) {
      console.log('Adding display_order column to releases table...');
      db.exec('ALTER TABLE releases ADD COLUMN display_order INTEGER DEFAULT 0');

      const existingReleases = db
        .prepare('SELECT id FROM releases ORDER BY start_date ASC, created_at ASC')
        .all() as Array<{ id: number }>;
      const updateStmt = db.prepare('UPDATE releases SET display_order = ? WHERE id = ?');
      existingReleases.forEach((release, index) => {
        updateStmt.run(index, release.id);
      });

      console.log('Display order column added to releases and initialized successfully');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  // Migration: remove expired invitation rows
  try {
    db.prepare(
      "DELETE FROM user_invitations WHERE expires_at <= CAST(strftime('%s', 'now') AS INTEGER) OR used_at IS NOT NULL"
    ).run();
  } catch (error) {
    console.error('Migration error:', error);
  }

};

// Initialize on first import
initDb();

interface BackupFileInfo {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

const ensureBackupDirectory = () => {
  if (!fs.existsSync(backupDirPath)) {
    fs.mkdirSync(backupDirPath, { recursive: true });
  }
};

const sanitizeBackupFileName = (fileName: string) => {
  if (!/^[a-zA-Z0-9._-]+\.db$/.test(fileName)) {
    throw new Error('Invalid backup file name');
  }
  return fileName;
};

const resolveBackupPath = (fileName: string) => {
  const safeFileName = sanitizeBackupFileName(fileName);
  const fullPath = path.resolve(backupDirPath, safeFileName);

  if (!fullPath.startsWith(`${backupDirPath}${path.sep}`)) {
    throw new Error('Invalid backup path');
  }

  return fullPath;
};

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

const generateBackupFileName = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const dd = `${now.getDate()}`.padStart(2, '0');
  const hh = `${now.getHours()}`.padStart(2, '0');
  const min = `${now.getMinutes()}`.padStart(2, '0');
  const sec = `${now.getSeconds()}`.padStart(2, '0');

  return `time_tracker_backup_${yyyy}${mm}${dd}_${hh}${min}${sec}.db`;
};

export const createDatabaseBackup = async (requestedFileName?: string): Promise<BackupFileInfo> => {
  ensureBackupDirectory();

  const fileName = requestedFileName ? sanitizeBackupFileName(requestedFileName) : generateBackupFileName();
  const backupPath = resolveBackupPath(fileName);

  if (fs.existsSync(backupPath)) {
    throw new Error('A backup file with this name already exists');
  }

  await db.backup(backupPath);
  const stats = fs.statSync(backupPath);

  return {
    fileName,
    sizeBytes: stats.size,
    createdAt: stats.birthtime.toISOString(),
  };
};

export const listDatabaseBackups = (): BackupFileInfo[] => {
  ensureBackupDirectory();

  return fs
    .readdirSync(backupDirPath)
    .filter((entry) => entry.endsWith('.db'))
    .map((fileName) => {
      const fullPath = resolveBackupPath(fileName);
      const stats = fs.statSync(fullPath);

      return {
        fileName,
        sizeBytes: stats.size,
        createdAt: stats.birthtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const deleteDatabaseBackup = (fileName: string) => {
  ensureBackupDirectory();
  const backupPath = resolveBackupPath(fileName);

  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file not found');
  }

  fs.unlinkSync(backupPath);
};

export const restoreDatabaseFromBackup = (fileName: string) => {
  ensureBackupDirectory();
  const backupPath = resolveBackupPath(fileName);

  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file not found');
  }

  const escapedPath = backupPath.replace(/'/g, "''");

  db.exec('PRAGMA foreign_keys = OFF');
  let attached = false;
  let transactionStarted = false;

  try {
    db.exec(`ATTACH DATABASE '${escapedPath}' AS ${backupAlias}`);
    attached = true;

    const mainTables = db
      .prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;
    const sourceTables = db
      .prepare(`SELECT name FROM ${backupAlias}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all() as Array<{ name: string }>;

    const sourceTableSet = new Set(sourceTables.map((table) => table.name));
    const tablesToRestore = mainTables
      .map((table) => table.name)
      .filter((tableName) => sourceTableSet.has(tableName));

    if (tablesToRestore.length === 0) {
      throw new Error('Backup does not contain compatible tables');
    }

    db.exec('BEGIN');
    transactionStarted = true;

    for (const tableName of tablesToRestore) {
      const quotedName = quoteIdentifier(tableName);
      db.exec(`DELETE FROM main.${quotedName}`);
      db.exec(`INSERT INTO main.${quotedName} SELECT * FROM ${backupAlias}.${quotedName}`);
    }

    const mainHasSqliteSequence = db
      .prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
      .get() as { name: string } | undefined;
    const backupHasSqliteSequence = db
      .prepare(`SELECT name FROM ${backupAlias}.sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'`)
      .get() as { name: string } | undefined;

    if (mainHasSqliteSequence && backupHasSqliteSequence) {
      db.exec('DELETE FROM main.sqlite_sequence');
      db.exec(`INSERT INTO main.sqlite_sequence SELECT * FROM ${backupAlias}.sqlite_sequence`);
    }

    db.exec('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      db.exec('ROLLBACK');
    }
    throw error;
  } finally {
    if (attached) {
      db.exec(`DETACH DATABASE ${backupAlias}`);
    }
    db.exec('PRAGMA foreign_keys = ON');
  }
};

export default db;
