import "dotenv/config";
import { randomBytes } from "crypto";
import http from "http";
import { Server as SocketServer } from "socket.io";
import { AnalyticsService } from "./application/services/analytics-service";
import { AuditLogService } from "./application/services/audit-log-service";
import { AuthService } from "./application/services/auth-service";
import { NoticeService } from "./application/services/notice-service";
import { TaskService } from "./application/services/task-service";
import { UserService } from "./application/services/user-service";
import db, { dbPath } from "./infrastructure/database/db";
import { startDatabaseMaintenance } from "./infrastructure/database/maintenance";
import { EmailNotifier } from "./infrastructure/notifications/email-notifier";
import { NotificationGateway } from "./infrastructure/realtime/notification-gateway";
import { AnalyticsRepository } from "./infrastructure/repositories/analytics-repository";
import { AuditLogRepository } from "./infrastructure/repositories/audit-log-repository";
import { NoticeRepository } from "./infrastructure/repositories/notice-repository";
import { TaskRepository } from "./infrastructure/repositories/task-repository";
import { UserRepository } from "./infrastructure/repositories/user-repository";
import { PasswordHasher } from "./infrastructure/security/password-hasher";
import { TokenService } from "./infrastructure/security/token-service";
import { buildApp } from "./presentation/app";

const PORT = Number(process.env.PORT || 3000);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const EMAIL_NOTIFICATIONS_ENABLED = process.env.EMAIL_NOTIFICATIONS_ENABLED === "true";
const SEED_DEFAULT_ADMIN = process.env.SEED_DEFAULT_ADMIN === "true";

const resolveJwtSecret = (): string => {
  const configuredSecret = process.env.JWT_SECRET;
  if (configuredSecret && configuredSecret.length >= 32) {
    return configuredSecret;
  }

  if (IS_PRODUCTION) {
    throw new Error("JWT_SECRET must be set and at least 32 characters in production");
  }

  console.warn("JWT_SECRET is missing/weak in development. Using an ephemeral secret for this runtime.");
  return randomBytes(48).toString("hex");
};

const JWT_SECRET = resolveJwtSecret();

const userRepository = new UserRepository();
const taskRepository = new TaskRepository();
const analyticsRepository = new AnalyticsRepository();
const auditLogRepository = new AuditLogRepository();
const noticeRepository = new NoticeRepository();

const hasher = new PasswordHasher();
const tokenService = new TokenService(JWT_SECRET);

const authService = new AuthService(userRepository, hasher, tokenService);
const userService = new UserService(userRepository, hasher);

const getCookieValue = (cookieHeader: string | undefined, name: string): string | undefined => {
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(";").map((entry) => entry.trim());
  const target = cookies.find((entry) => entry.startsWith(`${name}=`));
  if (!target) return undefined;
  return decodeURIComponent(target.slice(name.length + 1));
};

const bootstrap = async (): Promise<void> => {
  if (SEED_DEFAULT_ADMIN) {
    await userService.seedAdminIfMissing();
  }
  startDatabaseMaintenance({ db, dbPath });

  const notificationGateway = new NotificationGateway();
  const emailNotifier = new EmailNotifier(EMAIL_NOTIFICATIONS_ENABLED);
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
      isProduction: IS_PRODUCTION,
    },
    CLIENT_URL,
  );

  const appServer = http.createServer(app);
  const io = new SocketServer(appServer, {
    cors: {
      origin: CLIENT_URL,
      credentials: true,
    },
  });
  notificationGateway.bind(io);

  io.use((socket, next) => {
    try {
      const token = getCookieValue(socket.handshake.headers.cookie, "token");
      if (!token) {
        next(new Error("Unauthorized socket"));
        return;
      }
      const user = tokenService.verify(token);
      socket.data.user = { id: user.id, role: user.role };
      next();
    } catch {
      next(new Error("Unauthorized socket"));
    }
  });

  io.on("connection", (socket) => {
    const authUser = socket.data.user as { id: number } | undefined;
    if (!authUser) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user_${authUser.id}`);
  });

  const reminderTimer = setInterval(() => {
    taskService.processDueReminders();
  }, 60_000);
  reminderTimer.unref();

  appServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Stop the existing process or set PORT to a different value.`);
      return;
    }

    console.error("Server startup error", error);
  });

  appServer.listen(PORT, "0.0.0.0", () => {
    console.log(`TaskFlow server running on http://localhost:${PORT}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
