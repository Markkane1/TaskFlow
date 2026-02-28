import db from "../database/db";
import type { AuthenticatedRequestUser, PaginationInput, PublicUser, Role, UserRecord } from "../../domain/types";

export class UserRepository {
  findByUsername(username: string): UserRecord | undefined {
    return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRecord | undefined;
  }

  findById(id: number): UserRecord | undefined {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRecord | undefined;
  }

  getPublicById(id: number): PublicUser | undefined {
    return db
      .prepare("SELECT id, username, role, full_name, email, avatar_url, daily_task_cap, created_at FROM users WHERE id = ?")
      .get(id) as PublicUser | undefined;
  }

  listAll(): PublicUser[] {
    return db
      .prepare("SELECT id, username, role, full_name, email, avatar_url, daily_task_cap, created_at FROM users ORDER BY created_at DESC")
      .all() as PublicUser[];
  }

  listForRequester(requester: AuthenticatedRequestUser, pagination?: PaginationInput): PublicUser[] {
    const { whereClause, params } = this.getRequesterScopeClause(requester);
    const queryParts = [
      "SELECT id, username, role, full_name, email, avatar_url, daily_task_cap, created_at FROM users",
      `WHERE ${whereClause}`,
      "ORDER BY created_at DESC",
    ];
    const queryParams: Array<string | number> = [...params];

    if (pagination) {
      queryParts.push("LIMIT ? OFFSET ?");
      queryParams.push(pagination.limit, (pagination.page - 1) * pagination.limit);
    }

    return db.prepare(queryParts.join(" ")).all(...queryParams) as PublicUser[];
  }

  countForRequester(requester: AuthenticatedRequestUser): number {
    const { whereClause, params } = this.getRequesterScopeClause(requester);
    const row = db.prepare(`SELECT COUNT(*) as total FROM users WHERE ${whereClause}`).get(...params) as { total: number };
    return row.total;
  }

  listByIds(ids: number[]): PublicUser[] {
    if (!ids.length) return [];

    const placeholders = ids.map(() => "?").join(",");
    return db
      .prepare(`SELECT id, username, role, full_name, email, avatar_url, daily_task_cap, created_at FROM users WHERE id IN (${placeholders})`)
      .all(...ids) as PublicUser[];
  }

  listByRole(role: Role): PublicUser[] {
    return db
      .prepare("SELECT id, username, role, full_name, email, avatar_url, daily_task_cap, created_at FROM users WHERE role = ?")
      .all(role) as PublicUser[];
  }

  create(input: {
    username: string;
    hashedPassword: string;
    role: Role;
    full_name: string;
    email?: string | null;
    avatar_url?: string | null;
    daily_task_cap?: number;
  }): PublicUser {
    const result = db
      .prepare("INSERT INTO users (username, password, role, full_name, email, avatar_url, daily_task_cap) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(
        input.username,
        input.hashedPassword,
        input.role,
        input.full_name,
        input.email || null,
        input.avatar_url || null,
        input.daily_task_cap || 5,
      );

    return {
      id: Number(result.lastInsertRowid),
      username: input.username,
      role: input.role,
      full_name: input.full_name,
      email: input.email || null,
      avatar_url: input.avatar_url || null,
      daily_task_cap: input.daily_task_cap || 5,
    };
  }

  update(input: {
    id: number;
    username: string;
    role: Role;
    full_name: string;
    email?: string | null;
    avatar_url?: string | null;
    daily_task_cap?: number;
    hashedPassword?: string;
  }): void {
    if (input.hashedPassword) {
      db.prepare(
        "UPDATE users SET username = ?, password = ?, role = ?, full_name = ?, email = ?, avatar_url = ?, daily_task_cap = ? WHERE id = ?",
      ).run(
        input.username,
        input.hashedPassword,
        input.role,
        input.full_name,
        input.email || null,
        input.avatar_url || null,
        input.daily_task_cap || 5,
        input.id,
      );
      return;
    }

    db.prepare("UPDATE users SET username = ?, role = ?, full_name = ?, email = ?, avatar_url = ?, daily_task_cap = ? WHERE id = ?").run(
      input.username,
      input.role,
      input.full_name,
      input.email || null,
      input.avatar_url || null,
      input.daily_task_cap || 5,
      input.id,
    );
  }

  updatePassword(input: { id: number; hashedPassword: string }): void {
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(input.hashedPassword, input.id);
  }

  updateProfile(input: { id: number; full_name: string; email?: string | null; avatar_url?: string | null }): void {
    db.prepare("UPDATE users SET full_name = ?, email = ?, avatar_url = ? WHERE id = ?").run(
      input.full_name,
      input.email || null,
      input.avatar_url || null,
      input.id,
    );
  }

  deleteNonSysAdmin(id: number): void {
    db.prepare("DELETE FROM users WHERE id = ? AND role != 'sysAdmin'").run(id);
  }

  private getRequesterScopeClause(requester: AuthenticatedRequestUser): {
    whereClause: string;
    params: Array<string | number>;
  } {
    if (requester.role === "sysAdmin") {
      return { whereClause: "1 = 1", params: [] };
    }

    if (requester.role === "manager") {
      return { whereClause: "role = 'employee'", params: [] };
    }

    return { whereClause: "1 = 0", params: [] };
  }
}
