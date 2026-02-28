import { AppError } from "../../domain/errors";
import type { Role, TaskListQuery, TaskPriority, TaskSort, TaskStatus } from "../../domain/types";

const roleSet = new Set<Role>(["sysAdmin", "manager", "employee"]);
const prioritySet = new Set<TaskPriority>(["low", "normal", "high", "urgent"]);
const taskStatusSet = new Set<TaskStatus>(["created", "assigned", "pending", "in_progress", "completed"]);
const subtaskStatusSet = new Set(["pending", "completed"]);
const taskSortSet = new Set<TaskSort>(["deadline_asc", "deadline_desc", "created_desc", "created_asc", "priority_desc"]);
const taskScopeSet = new Set(["all", "created_by_me", "assigned_to_me"]);

const ensureObject = (value: unknown, message: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(message, 400);
  }
  return value as Record<string, unknown>;
};

const ensureString = (value: unknown, field: string, min = 1, max = 500): string => {
  if (typeof value !== "string") {
    throw new AppError(`Invalid ${field}`, 400);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  return trimmed;
};

const ensureOptionalString = (value: unknown, field: string, max = 2000): string | undefined => {
  if (typeof value === "undefined" || value === null || value === "") {
    return undefined;
  }
  return ensureString(value, field, 1, max);
};

const ensureDateString = (value: unknown, field: string): string => {
  const parsed = ensureString(value, field, 4, 64);
  const date = new Date(parsed);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  return parsed;
};

const ensureIdArray = (value: unknown, field: string): number[] => {
  if (typeof value === "undefined") return [];
  if (!Array.isArray(value)) {
    throw new AppError(`Invalid ${field}`, 400);
  }

  const ids = value.map((entry) => Number(entry));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  if (ids.length > 50) {
    throw new AppError(`${field} exceeds allowed size`, 400);
  }
  return [...new Set(ids)];
};

export const parsePositiveIntParam = (value: string, name: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(`Invalid ${name}`, 400);
  }
  return parsed;
};

export const validateLoginInput = (body: unknown): { username: string; password: string; captchaAnswer: string } => {
  const parsed = ensureObject(body, "Invalid login payload");
  const username = ensureString(parsed.username, "username", 3, 64);
  const password = ensureString(parsed.password, "password", 6, 128);
  const captchaAnswer = ensureString(parsed.captchaAnswer, "captchaAnswer", 1, 16);
  return { username, password, captchaAnswer };
};

export const validateTaskInput = (body: unknown): {
  title: string;
  instructions?: string;
  deadline: string;
  priority: TaskPriority;
  assigned_to: number[];
  subtasks: Array<{ id?: number; title: string; deadline: string }>;
  reminder_at?: string | null;
} => {
  const parsed = ensureObject(body, "Invalid task payload");
  const title = ensureString(parsed.title, "title", 2, 160);
  const instructions = ensureOptionalString(parsed.instructions, "instructions", 4000);
  const deadline = ensureDateString(parsed.deadline, "deadline");
  const priority = ensureString(parsed.priority, "priority", 3, 16) as TaskPriority;
  if (!prioritySet.has(priority)) {
    throw new AppError("Invalid priority", 400);
  }

  const assigned_to = ensureIdArray(parsed.assigned_to, "assigned_to");
  const reminderRaw = ensureOptionalString(parsed.reminder_at, "reminder_at", 64);
  const reminder_at = reminderRaw ? ensureDateString(reminderRaw, "reminder_at") : null;

  let subtasks: Array<{ id?: number; title: string; deadline: string }> = [];
  if (typeof parsed.subtasks !== "undefined") {
    if (!Array.isArray(parsed.subtasks)) {
      throw new AppError("Invalid subtasks", 400);
    }
    subtasks = parsed.subtasks.map((item, idx) => {
      const subtask = ensureObject(item, `Invalid subtasks[${idx}]`);
      const id = typeof subtask.id === "undefined" ? undefined : parsePositiveIntParam(String(subtask.id), "subtask id");
      return {
        id,
        title: ensureString(subtask.title, "subtask title", 2, 180),
        deadline: ensureDateString(subtask.deadline, "subtask deadline"),
      };
    });
  }

  return {
    title,
    instructions,
    deadline,
    priority,
    assigned_to,
    subtasks,
    reminder_at,
  };
};

export const validateTaskStatusInput = (body: unknown): { status: TaskStatus; remarks?: string } => {
  const parsed = ensureObject(body, "Invalid status payload");
  const status = ensureString(parsed.status, "status", 3, 32) as TaskStatus;
  if (!taskStatusSet.has(status)) {
    throw new AppError("Invalid status", 400);
  }
  const remarks = ensureOptionalString(parsed.remarks, "remarks", 2000);
  return { status, remarks };
};

export const validateTaskListQuery = (query: unknown): TaskListQuery => {
  const parsed = ensureObject(query, "Invalid task query");
  const result: TaskListQuery = {};

  const search = ensureOptionalString(parsed.search, "search", 120);
  if (search) result.search = search;

  const status = ensureOptionalString(parsed.status, "status", 32) as TaskStatus | undefined;
  if (status) {
    if (!taskStatusSet.has(status)) {
      throw new AppError("Invalid status", 400);
    }
    result.status = status;
  }

  const priority = ensureOptionalString(parsed.priority, "priority", 16) as TaskPriority | undefined;
  if (priority) {
    if (!prioritySet.has(priority)) {
      throw new AppError("Invalid priority", 400);
    }
    result.priority = priority;
  }

  const scope = ensureOptionalString(parsed.scope, "scope", 32);
  if (scope) {
    if (!taskScopeSet.has(scope)) {
      throw new AppError("Invalid scope", 400);
    }
    result.scope = scope as TaskListQuery["scope"];
  }

  const sort = ensureOptionalString(parsed.sort, "sort", 32) as TaskSort | undefined;
  if (sort) {
    if (!taskSortSet.has(sort)) {
      throw new AppError("Invalid sort", 400);
    }
    result.sort = sort;
  }

  return result;
};

export const validateReminderInput = (body: unknown): { reminder_at: string } => {
  const parsed = ensureObject(body, "Invalid reminder payload");
  return {
    reminder_at: ensureDateString(parsed.reminder_at, "reminder_at"),
  };
};

export const validateSubtaskStatusInput = (body: unknown): { status: string; remarks?: string } => {
  const parsed = ensureObject(body, "Invalid subtask payload");
  const status = ensureString(parsed.status, "status", 3, 16);
  if (!subtaskStatusSet.has(status)) {
    throw new AppError("Invalid subtask status", 400);
  }
  const remarks = ensureOptionalString(parsed.remarks, "remarks", 2000);
  return { status, remarks };
};

export const validateResetPasswordInput = (body: unknown): { newPassword: string } => {
  const parsed = ensureObject(body, "Invalid reset password payload");
  const newPassword = ensureString(parsed.newPassword, "newPassword", 8, 128);
  return { newPassword };
};

export const validateChangePasswordInput = (body: unknown): { currentPassword: string; newPassword: string } => {
  const parsed = ensureObject(body, "Invalid password payload");
  const currentPassword = ensureString(parsed.currentPassword, "currentPassword", 1, 128);
  const newPassword = ensureString(parsed.newPassword, "newPassword", 8, 128);
  return { currentPassword, newPassword };
};

export const validateProfileInput = (body: unknown): { full_name: string; email?: string; avatar_url?: string | null } => {
  const parsed = ensureObject(body, "Invalid profile payload");
  const full_name = ensureString(parsed.full_name, "full_name", 2, 120);
  const email = ensureOptionalString(parsed.email, "email", 160);
  const avatarUrl = ensureOptionalString(parsed.avatar_url, "avatar_url", 900_000) ?? null;
  return { full_name, email, avatar_url: avatarUrl };
};

export const validateUserInput = (body: unknown): {
  username: string;
  password?: string;
  role: Role;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  daily_task_cap?: number;
} => {
  const parsed = ensureObject(body, "Invalid user payload");
  const username = ensureString(parsed.username, "username", 3, 64);
  const role = ensureString(parsed.role, "role", 4, 16) as Role;
  if (!roleSet.has(role)) {
    throw new AppError("Invalid role", 400);
  }
  const full_name = ensureString(parsed.full_name, "full_name", 2, 120);
  const password = typeof parsed.password === "undefined" ? undefined : ensureString(parsed.password, "password", 8, 128);
  const email = ensureOptionalString(parsed.email, "email", 160);
  const avatar_url = ensureOptionalString(parsed.avatar_url, "avatar_url", 900_000) ?? null;
  const dailyTaskCap =
    typeof parsed.daily_task_cap === "undefined" ? 5 : parsePositiveIntParam(String(parsed.daily_task_cap), "daily_task_cap");
  return { username, password, role, full_name, email, avatar_url, daily_task_cap: Math.min(dailyTaskCap, 50) };
};
