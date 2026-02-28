import { AppError } from "../../domain/errors";
import type {
  AuthenticatedRequestUser,
  CreateTaskInput,
  PaginatedResult,
  PaginationInput,
  TaskListOptions,
  TaskListQuery,
  TaskStatusUpdateInput,
  UpdateTaskInput,
} from "../../domain/types";
import { EmailNotifier } from "../../infrastructure/notifications/email-notifier";
import { NotificationGateway } from "../../infrastructure/realtime/notification-gateway";
import { TaskRepository } from "../../infrastructure/repositories/task-repository";
import { UserRepository } from "../../infrastructure/repositories/user-repository";

export class TaskService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly notifications: NotificationGateway,
    private readonly users: UserRepository,
    private readonly emailNotifier: EmailNotifier,
  ) {}

  listTasks(
    user: AuthenticatedRequestUser,
    pagination?: PaginationInput,
    query?: TaskListQuery,
    options?: TaskListOptions,
  ): any[] | PaginatedResult<any> {
    if (!pagination) {
      return this.tasks.listForUser(user, undefined, query, options);
    }

    const items = this.tasks.listForUser(user, pagination, query, options);
    const total = this.tasks.countForUser(user, query);
    return {
      items,
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    };
  }

  getTaskById(user: AuthenticatedRequestUser, taskId: number): any {
    const task = this.tasks.findById(taskId);
    if (!task) {
      throw new AppError("Task not found", 404);
    }

    if (!this.tasks.canAccessTask(user, taskId)) {
      throw new AppError("Unauthorized", 403);
    }

    return this.tasks.getTaskWithDetails(taskId);
  }

  createTask(
    user: AuthenticatedRequestUser,
    input: CreateTaskInput,
  ): { id: number; capacityWarnings?: Array<{ user_id: number; full_name: string; active_tasks: number; daily_task_cap: number }> } {
    this.assertRole(user, ["manager", "sysAdmin"]);
    this.validateAssignees(user, input.assigned_to || []);

    const taskId = this.tasks.create(input, user.id);
    const createdTask = this.tasks.findById(taskId);

    if (input.assigned_to && createdTask) {
      this.notifications.notifyUsers(input.assigned_to, "task_created", `New task assigned: ${createdTask.title}`, createdTask);
      const recipients = this.users.listByIds(input.assigned_to);
      this.dispatchTaskEmail({
        taskId,
        taskTitle: createdTask.title,
        event: "task_created",
        recipients,
        actorName: user.full_name,
        remarks: "Task assigned",
      });
    }

    const capacityWarnings = this.tasks.getOverAllocationWarnings(input.assigned_to || []);
    return capacityWarnings.length ? { id: taskId, capacityWarnings } : { id: taskId };
  }

  deleteTask(user: AuthenticatedRequestUser, taskId: number): void {
    this.assertRole(user, ["manager", "sysAdmin"]);

    const task = this.tasks.findById(taskId);
    if (!task) {
      throw new AppError("Task not found", 404);
    }

    if (user.role !== "sysAdmin" && task.manager_id !== user.id) {
      throw new AppError("Unauthorized", 403);
    }

    this.tasks.delete(taskId);
    this.notifications.notifyAll("task_deleted", `Task deleted: ${task.title}`, { id: taskId });
  }

  updateTask(user: AuthenticatedRequestUser, taskId: number, input: UpdateTaskInput): void {
    this.assertRole(user, ["manager", "sysAdmin"]);
    this.validateAssignees(user, input.assigned_to || []);

    const task = this.tasks.findById(taskId);
    if (!task) {
      throw new AppError("Task not found", 404);
    }

    if (user.role !== "sysAdmin" && task.manager_id !== user.id) {
      throw new AppError("Unauthorized", 403);
    }

    if (task.status === "assigned") {
      throw new AppError("Task must be started by an assignee before task details can be changed", 400);
    }

    this.tasks.update(taskId, input, user.id, task.status);

    const participantIds = [...new Set([task.manager_id, ...this.tasks.getAssigneeIds(taskId)])];
    const updatedTask = this.tasks.getTaskWithDetails(taskId);

    if (updatedTask) {
      this.notifications.notifyUsers(participantIds, "task_updated", `Task updated: ${updatedTask.title}`, updatedTask);
      const recipients = this.users.listByIds(participantIds);
      this.dispatchTaskEmail({
        taskId,
        taskTitle: updatedTask.title,
        event: "task_updated",
        recipients,
        actorName: user.full_name,
        remarks: "Task details updated",
      });
    }
  }

  updateTaskStatus(user: AuthenticatedRequestUser, taskId: number, input: TaskStatusUpdateInput): void {
    const task = this.tasks.findById(taskId);
    if (!task) {
      throw new AppError("Task not found", 404);
    }

    const isManager = task.manager_id === user.id;
    const isAssigned = this.tasks.isAssigned(taskId, user.id);

    if (!isManager && !isAssigned && user.role !== "sysAdmin") {
      throw new AppError("Unauthorized", 403);
    }

    if (task.status === "assigned") {
      if (input.status !== "in_progress") {
        throw new AppError("Task must be started before other task state changes", 400);
      }
      if (!isAssigned) {
        throw new AppError("Only an assigned team member can start this task", 403);
      }
    }

    this.tasks.updateStatus(taskId, user.id, task.status, input);

    const updatedTask = this.tasks.findById(taskId);
    if (!updatedTask) {
      return;
    }

    if (updatedTask.manager_id) {
      this.notifications.notifyUser(
        updatedTask.manager_id,
        "task_status_updated",
        `Task status updated to ${input.status}: ${updatedTask.title}`,
        updatedTask,
      );
    }

    const assigneeIds = this.tasks.getAssigneeIds(taskId).filter((id) => id !== user.id);
    this.notifications.notifyUsers(
      assigneeIds,
      "task_status_updated",
      `Task status updated to ${input.status}: ${updatedTask.title}`,
      updatedTask,
    );

    const participants = this.users.listByIds([...new Set([updatedTask.manager_id, ...this.tasks.getAssigneeIds(taskId)])]);
    this.dispatchTaskEmail({
      taskId,
      taskTitle: updatedTask.title,
      event: "task_status_updated",
      recipients: participants,
      actorName: user.full_name,
      remarks: input.remarks || `Status changed to ${input.status}`,
    });
  }

  updateReminder(user: AuthenticatedRequestUser, taskId: number, reminderAt: string): void {
    const task = this.tasks.findById(taskId);
    if (!task) {
      throw new AppError("Task not found", 404);
    }

    if (task.manager_id !== user.id && user.role !== "sysAdmin") {
      throw new AppError("Unauthorized", 403);
    }

    if (task.status === "assigned") {
      throw new AppError("Task must be started before reminder can be changed", 400);
    }

    this.tasks.updateReminder(taskId, reminderAt);
    this.tasks.addHistory({
      taskId,
      userId: user.id,
      statusFrom: task.status,
      statusTo: task.status,
      remarks: `Reminder updated to ${reminderAt}`,
    });

    const participantIds = [...new Set([task.manager_id, ...this.tasks.getAssigneeIds(taskId)])];
    const payload = { ...task, reminder_at: reminderAt, reminder_sent: 0 };
    this.notifications.notifyUsers(
      participantIds,
      "task_reminder_updated",
      `Reminder updated for task: ${task.title}`,
      payload,
    );

    const recipients = this.users.listByIds(participantIds);
    this.dispatchTaskEmail({
      taskId,
      taskTitle: task.title,
      event: "task_reminder_updated",
      recipients,
      actorName: user.full_name,
      remarks: `Reminder set to ${reminderAt}`,
    });
  }

  updateSubtask(user: AuthenticatedRequestUser, subtaskId: number, status: string, remarks?: string): void {
    const task = this.tasks.findTaskBySubtaskId(subtaskId);
    if (!task) {
      throw new AppError("Subtask not found", 404);
    }

    const isAssigned = this.tasks.isAssigned(task.id, user.id);
    const isManager = task.manager_id === user.id;
    if (!isAssigned && !isManager && user.role !== "sysAdmin") {
      throw new AppError("Unauthorized", 403);
    }

    if (task.status === "assigned") {
      throw new AppError("Start the task before updating subtasks", 400);
    }

    const subtask = this.tasks.updateSubtask(subtaskId, status, remarks);
    if (subtask) {
      this.tasks.addHistory({
        taskId: task.id,
        userId: user.id,
        statusFrom: task.status,
        statusTo: task.status,
        remarks: remarks || `Subtask "${subtask.title}" marked as ${status}`,
      });

      const participants = [...new Set([task.manager_id, ...this.tasks.getAssigneeIds(task.id)])];
      this.notifications.notifyUsers(
        participants,
        "subtask_updated",
        `Subtask updated: ${subtask.title}`,
        { ...subtask, task_id: task.id },
      );
      const recipients = this.users.listByIds(participants);
      this.dispatchTaskEmail({
        taskId: task.id,
        taskTitle: task.title,
        event: "subtask_updated",
        recipients,
        actorName: user.full_name,
        remarks: remarks || `Subtask "${subtask.title}" -> ${status}`,
      });
    }
  }

  processDueReminders(): void {
    const dueReminders = this.tasks.getDueReminders(new Date().toISOString());
    const reminderAssigneeMap = this.tasks.getAssigneeMap(dueReminders.map((task) => task.id));

    for (const task of dueReminders) {
      const participantIds = [...new Set([task.manager_id, ...(reminderAssigneeMap[task.id] || [])])];
      this.notifications.notifyUsers(participantIds, "task_reminder", `Reminder: Task \"${task.title}\" is due soon!`, task);
      this.tasks.markReminderSent(task.id);
    }

    const escalationDelayMinutes = Number(process.env.SLA_ESCALATION_MINUTES_AFTER_DEADLINE || 60);
    const dueEscalations = this.tasks.getDueEscalations(new Date().toISOString(), escalationDelayMinutes);
    if (!dueEscalations.length) {
      return;
    }

    const sysAdmins = this.users.listByRole("sysAdmin");
    const escalationAssigneeMap = this.tasks.getAssigneeMap(dueEscalations.map((task) => task.id));

    for (const task of dueEscalations) {
      const participantIds = [
        ...new Set([task.manager_id, ...(escalationAssigneeMap[task.id] || []), ...sysAdmins.map((u) => u.id)]),
      ];
      this.notifications.notifyUsers(
        participantIds,
        "task_escalated",
        `SLA escalation: Task "${task.title}" is overdue`,
        { ...task, escalation_delay_minutes: escalationDelayMinutes },
      );
      this.tasks.addHistory({
        taskId: task.id,
        userId: task.manager_id,
        statusFrom: task.status,
        statusTo: task.status,
        remarks: `SLA escalation triggered after ${escalationDelayMinutes} minutes overdue`,
      });
      this.tasks.markEscalated(task.id);
    }
  }

  resendTaskNotificationEmail(user: AuthenticatedRequestUser, taskId: number): void {
    const task = this.tasks.findById(taskId);
    if (!task) {
      throw new AppError("Task not found", 404);
    }

    if (user.role !== "sysAdmin" && task.manager_id !== user.id) {
      throw new AppError("Unauthorized", 403);
    }

    const recipientIds = [...new Set([task.manager_id, ...this.tasks.getAssigneeIds(taskId)])];
    const recipients = this.users.listByIds(recipientIds);
    this.dispatchTaskEmail({
      taskId,
      taskTitle: task.title,
      event: "manual_resend",
      recipients,
      actorName: user.full_name,
      remarks: "Manual resend requested",
    });
  }

  private assertRole(user: AuthenticatedRequestUser, allowedRoles: string[]): void {
    if (!allowedRoles.includes(user.role)) {
      throw new AppError("Forbidden", 403);
    }
  }

  private dispatchTaskEmail(payload: {
    taskId: number;
    taskTitle: string;
    event: string;
    recipients: ReturnType<UserRepository["listByIds"]>;
    actorName: string;
    remarks?: string;
  }): void {
    this.emailNotifier.sendTaskEventEmail(payload).catch((error) => {
      console.error("Task email notification failed", error);
    });
  }

  private validateAssignees(user: AuthenticatedRequestUser, assigneeIds: number[]): void {
    if (!assigneeIds.length) return;

    const assignees = this.users.listByIds(assigneeIds);
    if (assignees.length !== assigneeIds.length) {
      throw new AppError("One or more assignees are invalid", 400);
    }

    const hasSysAdminAssignee = assignees.some((assignee) => assignee.role === "sysAdmin");
    if (hasSysAdminAssignee) {
      throw new AppError("Tasks cannot be assigned to system administrators", 400);
    }

    if (user.role === "manager") {
      const hasNonEmployeeAssignee = assignees.some((assignee) => assignee.role !== "employee");
      if (hasNonEmployeeAssignee) {
        throw new AppError("Managers can assign tasks only to employees", 403);
      }
    }
  }
}
