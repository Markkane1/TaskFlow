import db from "../database/db";
import type { AuthenticatedRequestUser } from "../../domain/types";

export class AnalyticsRepository {
  getSummary(user: AuthenticatedRequestUser): any {
    const now = new Date().toISOString();
    const managerArgs = user.role === "manager" ? [user.id] : [];
    const scopedWhere = user.role === "manager" ? "WHERE t.manager_id = ?" : "";
    const scopedAnd = user.role === "manager" ? "AND t.manager_id = ?" : "";

    const statusStats = db
      .prepare(`
        SELECT status, COUNT(*) as count
        FROM tasks t
        ${scopedWhere}
        GROUP BY status
      `)
      .all(...managerArgs);

    const priorityStats = db
      .prepare(`
        SELECT priority, COUNT(*) as count
        FROM tasks t
        ${scopedWhere}
        GROUP BY priority
      `)
      .all(...managerArgs);

    const overdueStats = db
      .prepare(`
        SELECT COUNT(*) as count
        FROM tasks t
        WHERE deadline < ? AND status != 'completed'
        ${scopedAnd}
      `)
      .get(now, ...managerArgs) as { count: number };

    const loadDistribution = db
      .prepare(`
        SELECT u.full_name, COUNT(ta.task_id) as task_count
        FROM users u
        JOIN task_assignments ta ON u.id = ta.user_id
        JOIN tasks t ON ta.task_id = t.id
        WHERE t.status != 'completed'
        ${scopedAnd}
        GROUP BY u.id
      `)
      .all(...managerArgs);

    const performance = db
      .prepare(`
        SELECT
          u.full_name,
          COUNT(DISTINCT t.id) as completed_count,
          AVG((strftime('%s', h_end.created_at) - strftime('%s', t.created_at)) / 3600.0) as avg_hours
        FROM users u
        JOIN task_assignments ta ON u.id = ta.user_id
        JOIN tasks t ON ta.task_id = t.id
        JOIN task_history h_end ON t.id = h_end.task_id AND h_end.status_to = 'completed'
        WHERE t.status = 'completed'
        ${scopedAnd}
        GROUP BY u.id
      `)
      .all(...managerArgs);

    const completionTrend = db
      .prepare(`
        WITH RECURSIVE dates(day) AS (
          SELECT date('now', '-13 days')
          UNION ALL
          SELECT date(day, '+1 day')
          FROM dates
          WHERE day < date('now')
        ),
        completed AS (
          SELECT date(h.created_at) as day, COUNT(DISTINCT h.task_id) as completed_count
          FROM task_history h
          JOIN tasks t ON t.id = h.task_id
          WHERE h.status_to = 'completed'
          ${scopedAnd}
          GROUP BY date(h.created_at)
        )
        SELECT dates.day, COALESCE(completed.completed_count, 0) as completed_count
        FROM dates
        LEFT JOIN completed ON completed.day = dates.day
        ORDER BY dates.day ASC
      `)
      .all(...managerArgs);

    const upcomingDeadlines = db
      .prepare(`
        SELECT t.id, t.title, t.deadline, t.priority, t.status
        FROM tasks t
        WHERE t.status != 'completed'
        AND datetime(t.deadline) >= datetime('now')
        ${scopedAnd}
        ORDER BY datetime(t.deadline) ASC
        LIMIT 8
      `)
      .all(...managerArgs);

    const totals = db
      .prepare(`
        SELECT
          COUNT(*) as total_tasks,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tasks
        FROM tasks t
        ${scopedWhere}
      `)
      .get(...managerArgs) as {
      total_tasks: number;
      completed_tasks: number;
      in_progress_tasks: number;
    };

    const avgCompletion = db
      .prepare(`
        SELECT AVG((strftime('%s', h_end.created_at) - strftime('%s', t.created_at)) / 3600.0) as avg_completion_hours
        FROM tasks t
        JOIN task_history h_end ON h_end.task_id = t.id AND h_end.status_to = 'completed'
        WHERE t.status = 'completed'
        ${scopedAnd}
      `)
      .get(...managerArgs) as { avg_completion_hours: number | null };

    const teamUtilization = db
      .prepare(`
        SELECT
          u.full_name,
          SUM(CASE WHEN t.status != 'completed' THEN 1 ELSE 0 END) as active_tasks,
          SUM(CASE WHEN t.deadline < ? AND t.status != 'completed' THEN 1 ELSE 0 END) as overdue_tasks,
          SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
        FROM users u
        LEFT JOIN task_assignments ta ON ta.user_id = u.id
        LEFT JOIN tasks t ON t.id = ta.task_id
        WHERE u.role IN ('employee', 'manager')
        ${user.role === "manager" ? "AND (t.manager_id = ? OR t.manager_id IS NULL)" : ""}
        GROUP BY u.id
      `)
      .all(now, ...managerArgs);

    const managerProductivity = db
      .prepare(`
        SELECT
          m.id,
          m.full_name,
          COUNT(t.id) as total_created,
          SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN t.deadline < ? AND t.status != 'completed' THEN 1 ELSE 0 END) as overdue
        FROM users m
        LEFT JOIN tasks t ON t.manager_id = m.id
        WHERE m.role IN ('manager', 'sysAdmin')
        ${user.role === "manager" ? "AND m.id = ?" : ""}
        GROUP BY m.id
        ORDER BY total_created DESC
      `)
      .all(now, ...managerArgs);

    const capacityPlanning = db
      .prepare(
        `
        SELECT
          u.id as user_id,
          u.full_name,
          u.daily_task_cap,
          SUM(CASE WHEN t.status != 'completed' THEN 1 ELSE 0 END) as active_tasks,
          SUM(CASE WHEN date(t.deadline) = date('now') AND t.status != 'completed' THEN 1 ELSE 0 END) as due_today,
          SUM(CASE WHEN t.deadline < ? AND t.status != 'completed' THEN 1 ELSE 0 END) as overdue_open
        FROM users u
        LEFT JOIN task_assignments ta ON ta.user_id = u.id
        LEFT JOIN tasks t ON t.id = ta.task_id
        WHERE u.role IN ('employee', 'manager')
        ${user.role === "manager" ? "AND (t.manager_id = ? OR t.manager_id IS NULL)" : ""}
        GROUP BY u.id
      `,
      )
      .all(now, ...managerArgs)
      .map((row: any) => {
        const cap = Number(row.daily_task_cap || 5);
        const active = Number(row.active_tasks || 0);
        return {
          ...row,
          daily_task_cap: cap,
          active_tasks: active,
          due_today: Number(row.due_today || 0),
          overdue_open: Number(row.overdue_open || 0),
          over_allocated: active > cap,
          utilization_percent: cap > 0 ? Math.round((active / cap) * 100) : 0,
        };
      });

    const slaStats = db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN t.status != 'completed' AND datetime(t.deadline) < datetime('now') THEN 1 ELSE 0 END) as overdue_total,
          SUM(CASE WHEN t.status != 'completed' AND datetime(t.deadline) < datetime('now') AND t.escalated_at IS NOT NULL THEN 1 ELSE 0 END) as escalated_total,
          SUM(CASE WHEN t.status != 'completed' AND datetime(t.deadline) < datetime('now') AND t.escalated_at IS NULL THEN 1 ELSE 0 END) as pending_escalation
        FROM tasks t
        ${scopedWhere}
      `,
      )
      .get(...managerArgs) as {
      overdue_total: number;
      escalated_total: number;
      pending_escalation: number;
    };

    const completionRate =
      totals.total_tasks > 0 ? Number(((totals.completed_tasks / totals.total_tasks) * 100).toFixed(1)) : 0;

    return {
      statusStats,
      priorityStats,
      overdueCount: overdueStats.count,
      loadDistribution,
      performance,
      completionTrend,
      upcomingDeadlines,
      teamUtilization,
      managerProductivity,
      capacityPlanning,
      sla: {
        overdueTotal: Number(slaStats.overdue_total || 0),
        escalatedTotal: Number(slaStats.escalated_total || 0),
        pendingEscalation: Number(slaStats.pending_escalation || 0),
      },
      kpis: {
        totalTasks: totals.total_tasks || 0,
        completedTasks: totals.completed_tasks || 0,
        inProgressTasks: totals.in_progress_tasks || 0,
        completionRate,
        avgCompletionHours: avgCompletion.avg_completion_hours ? Number(avgCompletion.avg_completion_hours.toFixed(1)) : 0,
      },
    };
  }
}
