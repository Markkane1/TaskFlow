import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";

type MaintenanceConfig = {
  db: Database.Database;
  dbPath: string;
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const formatSnapshotTimestamp = (date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
};

const runIntegrityAndSizeCheck = (db: Database.Database, dbPath: string): void => {
  try {
    const integrity = String(db.pragma("integrity_check", { simple: true }));
    const pageCount = Number(db.pragma("page_count", { simple: true }) || 0);
    const pageSize = Number(db.pragma("page_size", { simple: true }) || 0);
    const estimatedSize = pageCount * pageSize;
    const fileSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    const walPath = `${dbPath}-wal`;
    const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

    if (integrity !== "ok") {
      console.error(`[db-monitor] integrity_check failed: ${integrity}`);
      return;
    }

    console.log(
      `[db-monitor] integrity=ok db_size=${fileSize}B wal_size=${walSize}B estimated_size=${estimatedSize}B pages=${pageCount}`,
    );
  } catch (error) {
    console.error("[db-monitor] check failed", error);
  }
};

const runBackupSnapshot = async (db: Database.Database, dbPath: string): Promise<void> => {
  const backupDir = process.env.DB_BACKUP_DIR || "backups";
  const absoluteDir = path.resolve(backupDir);
  fs.mkdirSync(absoluteDir, { recursive: true });

  const baseName = path.basename(dbPath, path.extname(dbPath)) || "taskflow";
  const fileName = `${baseName}-${formatSnapshotTimestamp()}.db`;
  const outputPath = path.join(absoluteDir, fileName);

  await db.backup(outputPath);
  console.log(`[db-backup] snapshot created: ${outputPath}`);
};

export const startDatabaseMaintenance = ({ db, dbPath }: MaintenanceConfig): void => {
  const backupEnabled = process.env.DB_BACKUP_ENABLED !== "false";
  const backupIntervalHours = toPositiveInt(process.env.DB_BACKUP_INTERVAL_HOURS, 24);
  const monitorEnabled = process.env.DB_MONITOR_ENABLED !== "false";
  const monitorIntervalMinutes = toPositiveInt(process.env.DB_MONITOR_INTERVAL_MINUTES, 15);

  if (monitorEnabled) {
    runIntegrityAndSizeCheck(db, dbPath);
    const monitorTimer = setInterval(() => {
      runIntegrityAndSizeCheck(db, dbPath);
    }, monitorIntervalMinutes * 60 * 1000);
    monitorTimer.unref();
  }

  if (backupEnabled) {
    let backupInProgress = false;

    const executeBackup = async () => {
      if (backupInProgress) {
        return;
      }

      backupInProgress = true;
      try {
        await runBackupSnapshot(db, dbPath);
      } catch (error) {
        console.error("[db-backup] snapshot failed", error);
      } finally {
        backupInProgress = false;
      }
    };

    executeBackup();
    const backupTimer = setInterval(() => {
      executeBackup().catch((error) => {
        console.error("[db-backup] scheduled snapshot failed", error);
      });
    }, backupIntervalHours * 60 * 60 * 1000);
    backupTimer.unref();
  }
};
