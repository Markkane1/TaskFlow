import db from "../database/db";
import type {
  AuthenticatedRequestUser,
  CreateTaskInput,
  TaskListOptions,
  PaginationInput,
  TaskListQuery,
  TaskStatus,
  TaskStatusUpdateInput,
  UpdateTaskInput,
} from "../../domain/types";

interface SqlTask {
  id: number;
  title: string;
  instructions: string | null;
  remarks: string | null;
  deadline: string;
  reminder_at: string | null;
  reminder_sent: number;
  status: TaskStatus;
  priority: string;
  manager_id: number;
  created_at: string;
}

export class TaskRepository {
  listForUser(
    user: AuthenticatedRequestUser,
    pagination?: PaginationInput,
    query?: TaskListQuery,
    options: TaskListOptions = {},
  ): any[] {
    const { whereClause, params } = this.getListWhereClause(user, query);
    const sortSql = this.getSortSql(query?.sort);
    const queryParts = [`SELECT t.* FROM tasks t WHERE ${whereClause} ORDER BY t.created_at DESC`];
    const queryParams: Array<string | number> = [...params];
    queryParts[0] = `SELECT t.* FROM tasks t WHERE ${whereClause} ORDER BY ${sortSql}, t.created_at DESC`;

    if (pagination) {
      queryParts.push("LIMIT ? OFFSET ?");
      queryParams.push(pagination.limit, (pagination.page - 1) * pagination.limit);
    }

    const tasks = db.prepare(queryParts.join(" ")).all(...queryParams) as SqlTask[];

    return this.enrichTasks(tasks, options.includeHistory !== false);
  }

  countForUser(user: AuthenticatedRequestUser, query?: TaskListQuery): number {
    const { whereClause, params } = this.getListWhereClause(user, query);
    const row = db.prepare(`SELECT COUNT(*) as total FROM tasks t WHERE ${whereClause}`).get(...params) as { total: number };
    return row.total;
  }

  findById(taskId: number): SqlTask | undefined {
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as SqlTask | undefined;
  }

  canAccessTask(user: AuthenticatedRequestUser, taskId: number): boolean {
    const { whereClause, params } = this.getVisibilityClause(user);
    const row = db
      .prepare(`SELECT 1 as ok FROM tasks t WHERE t.id = ? AND ${whereClause} LIMIT 1`)
      .get(taskId, ...params) as { ok: number } | undefined;
    return Boolean(row?.ok);
  }

  getAssigneeIds(taskId: number): number[] {
    const rows = db.prepare("SELECT user_id FROM task_assignments WHERE task_id = ?").all(taskId) as Array<{ user_id: number }>;
    return rows.map((row) => row.user_id);
  }

  getAssigneeMap(taskIds: number[]): Record<number, number[]> {
    if (!taskIds.length) {
      return {};
    }

    const placeholders = taskIds.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT task_id, user_id FROM task_assignments WHERE task_id IN (${placeholders})`)
      .all(...taskIds) as Array<{ task_id: number; user_id: number }>;

    const map: Record<number, number[]> = {};
    for (const row of rows) {
      if (!map[row.task_id]) {
        map[row.task_id] = [];
      }
      map[row.task_id].push(row.user_id);
    }

    return map;
  }

  isAssigned(taskId: number, userId: number): boolean {
    const assignment = db.prepare("SELECT task_id FROM task_assignments WHERE task_id = ? AND user_id = ?").get(taskId, userId);
    return Boolean(assignment);
  }

  create(input: CreateTaskInput, actorId: number): number {
    const transaction = db.transaction(() => {
      const result = db
        .prepare(`
          INSERT INTO tasks (title, instructions, deadline, priority, manager_id, status, reminder_at, escalated_at)
          VALUES (?, ?, ?, ?, ?, 'created', ?, NULL)
        `)
        .run(input.title, input.instructions || null, input.deadline, input.priority, actorId, input.reminder_at || null);

      const taskId = Number(result.lastInsertRowid);

      db.prepare(
        "INSERT INTO task_history (task_id, user_id, status_to, remarks) VALUES (?, ?, 'created', 'Task created')",
      ).run(taskId, actorId);

      if (input.assigned_to && Array.isArray(input.assigned_to)) {
        const assignStmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
        for (const userId of input.assigned_to) {
          assignStmt.run(taskId, userId);
        }

        db.prepare("UPDATE tasks SET status = 'assigned' WHERE id = ?").run(taskId);
        db.prepare(
          "INSERT INTO task_history (task_id, user_id, status_from, status_to, remarks) VALUES (?, ?, 'created', 'assigned', 'Task assigned to team members')",
        ).run(taskId, actorId);
      }

      if (input.subtasks && Array.isArray(input.subtasks)) {
        const subtaskStmt = db.prepare("INSERT INTO subtasks (task_id, title, deadline) VALUES (?, ?, ?)");
        for (const subtask of input.subtasks) {
          subtaskStmt.run(taskId, subtask.title, subtask.deadline);
        }
      }

      return taskId;
    });

    return transaction();
  }

  update(taskId: number, input: UpdateTaskInput, actorId: number, currentStatus: TaskStatus): void {
    const transaction = db.transaction(() => {
      db.prepare(
        "UPDATE tasks SET title = ?, instructions = ?, deadline = ?, priority = ?, reminder_at = ?, reminder_sent = 0, escalated_at = NULL WHERE id = ?",
      ).run(input.title, input.instructions || null, input.deadline, input.priority, input.reminder_at || null, taskId);

      if (input.assigned_to && Array.isArray(input.assigned_to)) {
        db.prepare("DELETE FROM task_assignments WHERE task_id = ?").run(taskId);

        const assignStmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
        for (const userId of input.assigned_to) {
          assignStmt.run(taskId, userId);
        }

        const nextStatus = input.assigned_to.length > 0 ? "assigned" : "created";
        db.prepare("UPDATE tasks SET status = ? WHERE id = ? AND status IN ('created', 'assigned')").run(nextStatus, taskId);
      }

      if (input.subtasks && Array.isArray(input.subtasks)) {
        const insertStmt = db.prepare("INSERT INTO subtasks (task_id, title, deadline) VALUES (?, ?, ?)");
        const updateStmt = db.prepare("UPDATE subtasks SET title = ?, deadline = ? WHERE id = ? AND task_id = ?");

        for (const subtask of input.subtasks) {
          if (!subtask.id) {
            insertStmt.run(taskId, subtask.title, subtask.deadline);
          } else {
            updateStmt.run(subtask.title, subtask.deadline, subtask.id, taskId);
          }
        }
      }

      db.prepare("INSERT INTO task_history (task_id, user_id, status_to, remarks) VALUES (?, ?, ?, 'Task details updated')").run(
        taskId,
        actorId,
        currentStatus,
      );
    });

    transaction();
  }

  delete(taskId: number): void {
    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM task_assignments WHERE task_id = ?").run(taskId);
      db.prepare("DELETE FROM subtasks WHERE task_id = ?").run(taskId);
      db.prepare("DELETE FROM task_history WHERE task_id = ?").run(taskId);
      db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
    });

    transaction();
  }

  updateStatus(taskId: number, actorId: number, currentStatus: TaskStatus, input: TaskStatusUpdateInput): void {
    const transaction = db.transaction(() => {
      db.prepare("UPDATE tasks SET status = ?, remarks = ? WHERE id = ?").run(input.status, input.remarks || null, taskId);
      db.prepare("INSERT INTO task_history (task_id, user_id, status_from, status_to, remarks) VALUES (?, ?, ?, ?, ?)").run(
        taskId,
        actorId,
        currentStatus,
        input.status,
        input.remarks || `Status updated to ${input.status}`,
      );
    });

    transaction();
  }

  addHistory(input: {
    taskId: number;
    userId: number;
    statusFrom?: string | null;
    statusTo?: string | null;
    remarks?: string | null;
  }): void {
    db.prepare(
      "INSERT INTO task_history (task_id, user_id, status_from, status_to, remarks) VALUES (?, ?, ?, ?, ?)",
    ).run(input.taskId, input.userId, input.statusFrom || null, input.statusTo || null, input.remarks || null);
  }

  updateReminder(taskId: number, reminderAt: string): void {
    db.prepare("UPDATE tasks SET reminder_at = ?, reminder_sent = 0 WHERE id = ?").run(reminderAt, taskId);
  }

  findTaskBySubtaskId(subtaskId: number): SqlTask | undefined {
    return db
      .prepare(
        "SELECT t.* FROM tasks t JOIN subtasks s ON s.task_id = t.id WHERE s.id = ?",
      )
      .get(subtaskId) as SqlTask | undefined;
  }

  updateSubtask(subtaskId: number, status: string, remarks?: string): any {
    db.prepare("UPDATE subtasks SET status = ?, remarks = ? WHERE id = ?").run(status, remarks || null, subtaskId);
    return db.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId);
  }

  getTaskWithDetails(taskId: number): any {
    const task = this.findById(taskId);
    if (!task) {
      return null;
    }
    const [detailed] = this.enrichTasks([task], true);
    return detailed || null;
  }

  getDueReminders(nowIso: string): any[] {
    return db
      .prepare(
        "SELECT * FROM tasks WHERE reminder_at <= ? AND status != 'completed' AND (reminder_sent IS NULL OR reminder_sent = 0)",
      )
      .all(nowIso) as any[];
  }

  markReminderSent(taskId: number): void {
    db.prepare("UPDATE tasks SET reminder_sent = 1 WHERE id = ?").run(taskId);
  }

  getDueEscalations(nowIso: string, escalationDelayMinutes: number): any[] {
    return db
      .prepare(
        `
        SELECT * FROM tasks
        WHERE status != 'completed'
          AND escalated_at IS NULL
          AND datetime(deadline) <= datetime(?, '-' || ? || ' minutes')
      `,
      )
      .all(nowIso, Math.max(0, escalationDelayMinutes)) as any[];
  }

  markEscalated(taskId: number): void {
    db.prepare("UPDATE tasks SET escalated_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);
  }

  getOverAllocationWarnings(userIds: number[]): Array<{ user_id: number; full_name: string; active_tasks: number; daily_task_cap: number }> {
    if (!userIds.length) {
      return [];
    }

    const placeholders = userIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `
        SELECT
          u.id as user_id,
          u.full_name,
          u.daily_task_cap,
          SUM(CASE WHEN t.status != 'completed' THEN 1 ELSE 0 END) as active_tasks
        FROM users u
        LEFT JOIN task_assignments ta ON ta.user_id = u.id
        LEFT JOIN tasks t ON t.id = ta.task_id
        WHERE u.id IN (${placeholders})
        GROUP BY u.id
      `,
      )
      .all(...userIds) as Array<{ user_id: number; full_name: string; active_tasks: number; daily_task_cap: number }>;

    return rows
      .map((row) => ({
        ...row,
        active_tasks: Number(row.active_tasks || 0),
        daily_task_cap: Number(row.daily_task_cap || 5),
      }))
      .filter((row) => row.active_tasks > row.daily_task_cap);
  }

  private getVisibilityClause(user: AuthenticatedRequestUser): { whereClause: string; params: Array<string | number> } {
    if (user.role === "sysAdmin") {
      return { whereClause: "1 = 1", params: [] };
    }

    if (user.role === "manager") {
      return {
        whereClause:
          "t.manager_id = ? OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND ta.user_id = ?)",
        params: [user.id, user.id],
      };
    }

    return {
      whereClause: "EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.id AND ta.user_id = ?)",
      params: [user.id],
    };
  }

  private getListWhereClause(
    user: AuthenticatedRequestUser,
    query?: TaskListQuery,
  ): { whereClause: string; params: Array<string | number> } {
    const base = this.getVisibilityClause(user);
    const whereParts = [base.whereClause];
    const params: Array<string | number> = [...base.params];

    if (!query) {
      return { whereClause: whereParts.join(" AND "), params };
    }

    if (query.status) {
      whereParts.push("t.status = ?");
      params.push(query.status);
    }

    if (query.priority) {
      whereParts.push("t.priority = ?");
      params.push(query.priority);
    }

    if (query.scope === "created_by_me") {
      whereParts.push("t.manager_id = ?");
      params.push(user.id);
    } else if (query.scope === "assigned_to_me") {
      whereParts.push("EXISTS (SELECT 1 FROM task_assignments ta_scope WHERE ta_scope.task_id = t.id AND ta_scope.user_id = ?)");
      params.push(user.id);
    }

    if (query.search) {
      const q = `%${query.search.toLowerCase()}%`;
      whereParts.push(`
        (
          LOWER(t.title) LIKE ?
          OR LOWER(COALESCE(t.instructions, '')) LIKE ?
          OR EXISTS (
            SELECT 1 FROM task_assignments ta_search
            JOIN users u_search ON u_search.id = ta_search.user_id
            WHERE ta_search.task_id = t.id
              AND (LOWER(u_search.full_name) LIKE ? OR LOWER(u_search.username) LIKE ?)
          )
        )
      `);
      params.push(q, q, q, q);
    }

    return { whereClause: whereParts.join(" AND "), params };
  }

  private getSortSql(sort?: TaskListQuery["sort"]): string {
    switch (sort) {
      case "deadline_asc":
        return "t.deadline ASC";
      case "deadline_desc":
        return "t.deadline DESC";
      case "created_asc":
        return "t.created_at ASC";
      case "priority_desc":
        return "CASE t.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC";
      case "created_desc":
      default:
        return "t.created_at DESC";
    }
  }

  private enrichTasks(tasks: SqlTask[], includeHistory = true): any[] {
    if (!tasks.length) {
      return [];
    }

    const taskIds = tasks.map((task) => task.id);
    const placeholders = taskIds.map(() => "?").join(",");

    const subtasks = db
      .prepare(`SELECT * FROM subtasks WHERE task_id IN (${placeholders})`)
      .all(...taskIds) as Array<{ task_id: number }>;

    const assignments = db
      .prepare(
        `
        SELECT ta.task_id, u.id, u.full_name, u.username
        FROM task_assignments ta
        JOIN users u ON u.id = ta.user_id
        WHERE ta.task_id IN (${placeholders})
      `,
      )
      .all(...taskIds) as Array<{ task_id: number; id: number; full_name: string; username: string }>;

    const history = includeHistory
      ? (db
          .prepare(
            `
        SELECT h.*, u.full_name as user_name
        FROM task_history h
        JOIN users u ON h.user_id = u.id
        WHERE h.task_id IN (${placeholders})
        ORDER BY h.task_id ASC, h.created_at DESC
      `,
          )
          .all(...taskIds) as Array<{ task_id: number }>)
      : [];

    const subtasksByTask: Record<number, any[]> = {};
    const assignmentsByTask: Record<number, any[]> = {};
    const historyByTask: Record<number, any[]> = {};

    for (const subtask of subtasks) {
      if (!subtasksByTask[subtask.task_id]) subtasksByTask[subtask.task_id] = [];
      subtasksByTask[subtask.task_id].push(subtask);
    }

    for (const assignment of assignments) {
      if (!assignmentsByTask[assignment.task_id]) assignmentsByTask[assignment.task_id] = [];
      assignmentsByTask[assignment.task_id].push({
        id: assignment.id,
        full_name: assignment.full_name,
        username: assignment.username,
      });
    }

    if (includeHistory) {
      for (const entry of history) {
        if (!historyByTask[entry.task_id]) historyByTask[entry.task_id] = [];
        historyByTask[entry.task_id].push(entry);
      }
    }

    return tasks.map((task) => ({
      ...task,
      subtasks: subtasksByTask[task.id] || [],
      assignments: assignmentsByTask[task.id] || [],
      history: historyByTask[task.id] || [],
    }));
  }
}
