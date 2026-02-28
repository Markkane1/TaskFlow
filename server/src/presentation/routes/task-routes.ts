import { Router } from "express";
import type { ApiDependencies } from "../dependencies";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth-middleware";
import {
  parsePositiveIntParam,
  validateReminderInput,
  validateTaskListQuery,
  validateTaskInput,
  validateTaskStatusInput,
} from "../validation/request-validators";

const parseOptionalPositiveInt = (value: unknown): number | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
};

export const buildTaskRoutes = (deps: ApiDependencies): Router => {
  const router = Router();
  const requireAuth = authenticate(deps.tokenService);

  router.get("/", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const page = parseOptionalPositiveInt(req.query.page);
      const limit = parseOptionalPositiveInt(req.query.limit);
      const usePagination = typeof page !== "undefined" || typeof limit !== "undefined";
      const query = validateTaskListQuery(req.query);
      const includeHistory = parseOptionalBoolean(req.query.includeHistory) ?? false;

      if (!usePagination) {
        res.json(deps.taskService.listTasks(req.user!, undefined, query, { includeHistory }));
        return;
      }

      res.json(
        deps.taskService.listTasks(
          req.user!,
          {
            page: page || 1,
            limit: Math.min(limit || 25, 200),
          },
          query,
          { includeHistory },
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const taskId = parsePositiveIntParam(req.params.id, "task id");
      res.json(deps.taskService.getTaskById(req.user!, taskId));
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const input = validateTaskInput(req.body);
      res.json(deps.taskService.createTask(req.user!, input));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const taskId = parsePositiveIntParam(req.params.id, "task id");
      deps.taskService.deleteTask(req.user!, taskId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const taskId = parsePositiveIntParam(req.params.id, "task id");
      const input = validateTaskInput(req.body);
      deps.taskService.updateTask(req.user!, taskId, input);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/status", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const taskId = parsePositiveIntParam(req.params.id, "task id");
      const input = validateTaskStatusInput(req.body);
      deps.taskService.updateTaskStatus(req.user!, taskId, input);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/reminder", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const taskId = parsePositiveIntParam(req.params.id, "task id");
      const { reminder_at } = validateReminderInput(req.body);
      deps.taskService.updateReminder(req.user!, taskId, reminder_at);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/resend-email", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const taskId = parsePositiveIntParam(req.params.id, "task id");
      deps.taskService.resendTaskNotificationEmail(req.user!, taskId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
