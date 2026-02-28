import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { ApiDependencies } from "./dependencies";
import { auditLogMiddleware } from "./middleware/audit-log-middleware";
import { csrfGuard } from "./middleware/csrf-middleware";
import { errorHandler } from "./middleware/error-middleware";
import { originGuard } from "./middleware/origin-guard-middleware";
import { requestLogger } from "./middleware/request-logger";
import { buildAnalyticsRoutes } from "./routes/analytics-routes";
import { buildAuditLogRoutes } from "./routes/audit-log-routes";
import { buildAuthRoutes } from "./routes/auth-routes";
import { buildNoticeRoutes } from "./routes/notice-routes";
import { buildSubtaskRoutes } from "./routes/subtask-routes";
import { buildTaskRoutes } from "./routes/task-routes";
import { buildUserRoutes } from "./routes/user-routes";

export const buildApp = (deps: ApiDependencies, clientUrl: string) => {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin: clientUrl,
      credentials: true,
    }),
  );

  app.use(requestLogger);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(originGuard(clientUrl));

  const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });
  app.use("/api", apiRateLimiter);
  app.use("/api", auditLogMiddleware(deps.auditLogService));
  app.use("/api", csrfGuard(["/api/auth/login", "/api/auth/csrf"]));

  app.use("/api/auth", buildAuthRoutes(deps));
  app.use("/api/users", buildUserRoutes(deps));
  app.use("/api/tasks", buildTaskRoutes(deps));
  app.use("/api/subtasks", buildSubtaskRoutes(deps));
  app.use("/api/notices", buildNoticeRoutes(deps));
  app.use("/api/analytics", buildAnalyticsRoutes(deps));
  app.use("/api/audit-logs", buildAuditLogRoutes(deps));

  app.use("/api/*", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  app.use(errorHandler);

  return app;
};
