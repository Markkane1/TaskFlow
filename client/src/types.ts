import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Role = 'sysAdmin' | 'manager' | 'employee';

export interface User {
  id: number;
  username: string;
  role: Role;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  daily_task_cap?: number;
}

export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  deadline: string;
  status: 'pending' | 'completed';
  remarks?: string;
}

export interface TaskHistory {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  status_from?: string;
  status_to: string;
  remarks?: string;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  instructions?: string;
  remarks?: string;
  deadline: string;
  reminder_at?: string;
  reminder_sent?: number;
  status: 'created' | 'assigned' | 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  manager_id: number;
  created_at: string;
  subtasks: Subtask[];
  assignments: User[];
  history: TaskHistory[];
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
  updated_at?: string | null;
  is_archived: number;
  reply_count: number;
  acknowledgement_count: number;
  acknowledged_by_me: number;
  replies: NoticeReply[];
}
