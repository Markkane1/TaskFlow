import { AnalyticsService } from "../../server/src/application/services/analytics-service";
import { AuditLogService } from "../../server/src/application/services/audit-log-service";
import { AuthService } from "../../server/src/application/services/auth-service";
import { NoticeService } from "../../server/src/application/services/notice-service";
import { TaskService } from "../../server/src/application/services/task-service";
import { UserService } from "../../server/src/application/services/user-service";
import db from "../../server/src/infrastructure/database/db";
import { EmailNotifier } from "../../server/src/infrastructure/notifications/email-notifier";
import { NotificationGateway } from "../../server/src/infrastructure/realtime/notification-gateway";
import { AnalyticsRepository } from "../../server/src/infrastructure/repositories/analytics-repository";
import { AuditLogRepository } from "../../server/src/infrastructure/repositories/audit-log-repository";
import { NoticeRepository } from "../../server/src/infrastructure/repositories/notice-repository";
import { TaskRepository } from "../../server/src/infrastructure/repositories/task-repository";
import { UserRepository } from "../../server/src/infrastructure/repositories/user-repository";
import { PasswordHasher } from "../../server/src/infrastructure/security/password-hasher";
import { TokenService } from "../../server/src/infrastructure/security/token-service";
import { buildApp } from "../../server/src/presentation/app";
import type { PublicUser, Role } from "../../server/src/domain/types";

export const resetDatabase = (): void => {
  db.exec(`
    DELETE FROM notice_acknowledgements;
    DELETE FROM notice_replies;
    DELETE FROM notices;
    DELETE FROM task_history;
    DELETE FROM subtasks;
    DELETE FROM task_assignments;
    DELETE FROM tasks;
    DELETE FROM audit_logs;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
};

export type TestContext = ReturnType<typeof createTestContext>;

export const createTestContext = (clientUrl = "http://localhost:5173") => {
  const userRepository = new UserRepository();
  const taskRepository = new TaskRepository();
  const analyticsRepository = new AnalyticsRepository();
  const auditLogRepository = new AuditLogRepository();
  const noticeRepository = new NoticeRepository();

  const hasher = new PasswordHasher();
  const secret = process.env.JWT_SECRET || "test_jwt_secret_for_ci_and_local_runs_32_chars_min";
  const tokenService = new TokenService(secret);
  const authService = new AuthService(userRepository, hasher, tokenService);
  const userService = new UserService(userRepository, hasher);
  const notificationGateway = new NotificationGateway();
  const emailNotifier = new EmailNotifier(false);
  const taskService = new TaskService(taskRepository, notificationGateway, userRepository, emailNotifier);
  const noticeService = new NoticeService(noticeRepository, notificationGateway);
  const analyticsService = new AnalyticsService(analyticsRepository);
  const auditLogService = new AuditLogService(auditLogRepository);

  const app = buildApp(
    {
      authService,
      userService,
      taskService,
      noticeService,
      analyticsService,
      auditLogService,
      tokenService,
      isProduction: false,
    },
    clientUrl,
  );

  return {
    app,
    authService,
    userService,
    taskService,
    noticeService,
    analyticsService,
    auditLogService,
    tokenService,
  };
};

export const seedUser = async (
  userService: UserService,
  input: {
    username: string;
    password: string;
    role: Role;
    full_name: string;
    email?: string;
    daily_task_cap?: number;
  },
): Promise<PublicUser> => {
  return userService.createUser({
    username: input.username,
    password: input.password,
    role: input.role,
    full_name: input.full_name,
    email: input.email || `${input.username}@taskflow.test`,
    daily_task_cap: input.daily_task_cap || 5,
  });
};
