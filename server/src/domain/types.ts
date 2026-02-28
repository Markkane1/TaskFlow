export type Role = "sysAdmin" | "manager" | "employee";

export type TaskStatus = "created" | "assigned" | "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface AuthPayload {
  id: number;
  username: string;
  role: Role;
  full_name: string;
  email?: string | null;
  avatar_url?: string | null;
}

export interface AuthenticatedRequestUser extends AuthPayload {
  iat?: number;
  exp?: number;
}

export interface UserRecord {
  id: number;
  username: string;
  password: string;
  role: Role;
  full_name: string;
  email?: string | null;
  avatar_url?: string | null;
  daily_task_cap?: number;
  created_at: string;
}

export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  full_name: string;
  email?: string | null;
  avatar_url?: string | null;
  daily_task_cap?: number;
  created_at?: string;
}

export interface SubtaskInput {
  id?: number;
  title: string;
  deadline: string;
}

export interface CreateTaskInput {
  title: string;
  instructions?: string;
  deadline: string;
  priority: TaskPriority;
  assigned_to?: number[];
  subtasks?: SubtaskInput[];
  reminder_at?: string | null;
}

export interface UpdateTaskInput extends CreateTaskInput {}

export interface TaskStatusUpdateInput {
  status: TaskStatus;
  remarks?: string;
}

export interface PaginationInput {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type TaskListScope = "all" | "created_by_me" | "assigned_to_me";
export type TaskSort = "deadline_asc" | "deadline_desc" | "created_desc" | "created_asc" | "priority_desc";

export interface TaskListQuery {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  scope?: TaskListScope;
  sort?: TaskSort;
}

export interface TaskListOptions {
  includeHistory?: boolean;
}

export interface AuditLogEntry {
  id: number;
  actor_user_id: number | null;
  actor_username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  status_code: number | null;
  ip: string | null;
  user_agent: string | null;
  details: string | null;
  created_at: string;
}

export interface AuditLogQuery {
  action?: string;
  actorUserId?: number;
  statusCode?: number;
  from?: string;
  to?: string;
}

export interface NoticeReply {
  id: number;
  notice_id: number;
  user_id: number;
  user_name: string;
  role: Role;
  message: string;
  created_at: string;
}

export interface NoticeThread {
  id: number;
  title: string;
  message: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string | null;
  is_archived: number;
  reply_count: number;
  acknowledgement_count: number;
  acknowledged_by_me: number;
  replies: NoticeReply[];
}

export interface NoticeInput {
  title: string;
  message: string;
}

export interface NoticeReplyInput {
  message: string;
}
