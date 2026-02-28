import db from "../database/db";
import type { AuditLogEntry, AuditLogQuery, PaginationInput } from "../../domain/types";

export class AuditLogRepository {
  create(input: {
    actorUserId?: number | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    statusCode?: number | null;
    ip?: string | null;
    userAgent?: string | null;
    details?: string | null;
  }): void {
    db.prepare(
      `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, status_code, ip, user_agent, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      input.actorUserId ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.statusCode ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      input.details ?? null,
    );
  }

  list(query: AuditLogQuery, pagination: PaginationInput): AuditLogEntry[] {
    const whereParts: string[] = [];
    const params: Array<string | number> = [];

    if (query.action) {
      whereParts.push("l.action = ?");
      params.push(query.action);
    }
    if (query.actorUserId) {
      whereParts.push("l.actor_user_id = ?");
      params.push(query.actorUserId);
    }
    if (query.statusCode) {
      whereParts.push("l.status_code = ?");
      params.push(query.statusCode);
    }
    if (query.from) {
      whereParts.push("datetime(l.created_at) >= datetime(?)");
      params.push(query.from);
    }
    if (query.to) {
      whereParts.push("datetime(l.created_at) <= datetime(?)");
      params.push(query.to);
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `
      SELECT
        l.*,
        u.username as actor_username
      FROM audit_logs l
      LEFT JOIN users u ON u.id = l.actor_user_id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(...params, pagination.limit, (pagination.page - 1) * pagination.limit) as AuditLogEntry[];

    return rows;
  }

  count(query: AuditLogQuery): number {
    const whereParts: string[] = [];
    const params: Array<string | number> = [];

    if (query.action) {
      whereParts.push("action = ?");
      params.push(query.action);
    }
    if (query.actorUserId) {
      whereParts.push("actor_user_id = ?");
      params.push(query.actorUserId);
    }
    if (query.statusCode) {
      whereParts.push("status_code = ?");
      params.push(query.statusCode);
    }
    if (query.from) {
      whereParts.push("datetime(created_at) >= datetime(?)");
      params.push(query.from);
    }
    if (query.to) {
      whereParts.push("datetime(created_at) <= datetime(?)");
      params.push(query.to);
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const row = db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`).get(...params) as { total: number };
    return row.total;
  }
}
