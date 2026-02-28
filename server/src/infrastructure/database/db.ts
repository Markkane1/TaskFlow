import Database from "better-sqlite3";

export const dbPath = process.env.TASKFLOW_DB_PATH || "taskflow.db";
const busyTimeoutMs = Number(process.env.SQLITE_BUSY_TIMEOUT_MS || 5000);
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma(`busy_timeout = ${Number.isFinite(busyTimeoutMs) ? busyTimeoutMs : 5000}`);
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('sysAdmin', 'manager', 'employee')) NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    daily_task_cap INTEGER DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    instructions TEXT,
    remarks TEXT,
    deadline DATETIME NOT NULL,
    reminder_at DATETIME,
    reminder_sent INTEGER DEFAULT 0,
    escalated_at DATETIME,
    status TEXT CHECK(status IN ('created', 'assigned', 'pending', 'in_progress', 'completed')) DEFAULT 'created',
    priority TEXT CHECK(priority IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
    manager_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status_from TEXT,
    status_to TEXT,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    deadline DATETIME NOT NULL,
    status TEXT CHECK(status IN ('pending', 'completed')) DEFAULT 'pending',
    remarks TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_assignments (
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (task_id, user_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    status_code INTEGER,
    ip TEXT,
    user_agent TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notice_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notice_acknowledgements (
    notice_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    acknowledged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notice_id, user_id),
    FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const migrateColumn = (sql: string) => {
  try {
    db.prepare(sql).run();
  } catch {
    // Column already exists.
  }
};

migrateColumn("ALTER TABLE tasks ADD COLUMN reminder_at DATETIME");
migrateColumn("ALTER TABLE tasks ADD COLUMN reminder_sent INTEGER DEFAULT 0");
migrateColumn("ALTER TABLE tasks ADD COLUMN escalated_at DATETIME");
migrateColumn("ALTER TABLE users ADD COLUMN email TEXT");
migrateColumn("ALTER TABLE users ADD COLUMN avatar_url TEXT");
migrateColumn("ALTER TABLE users ADD COLUMN daily_task_cap INTEGER DEFAULT 5");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_manager_status_deadline_created
    ON tasks(manager_id, status, deadline, created_at);

  CREATE INDEX IF NOT EXISTS idx_task_assignments_user_task
    ON task_assignments(user_id, task_id);

  CREATE INDEX IF NOT EXISTS idx_task_history_task_created_status
    ON task_history(task_id, created_at, status_to);

  CREATE INDEX IF NOT EXISTS idx_tasks_escalated_status_deadline
    ON tasks(escalated_at, status, deadline);

  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_action
    ON audit_logs(created_at, action);

  CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
    ON audit_logs(actor_user_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_notices_created_archived
    ON notices(created_at, is_archived);

  CREATE INDEX IF NOT EXISTS idx_notice_replies_notice_created
    ON notice_replies(notice_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_notice_ack_notice_user
    ON notice_acknowledgements(notice_id, user_id);
`);

export default db;
