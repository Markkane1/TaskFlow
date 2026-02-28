import { Router } from "express";
import type { ApiDependencies } from "../dependencies";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth-middleware";
import { parsePositiveIntParam } from "../validation/request-validators";
import { AppError } from "../../domain/errors";

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

const parseNoticeInput = (body: unknown): { title: string; message: string } => {
  if (!body || typeof body !== "object") {
    throw new AppError("Invalid notice payload", 400);
  }
  const parsed = body as { title?: unknown; message?: unknown };
  if (typeof parsed.title !== "string" || parsed.title.trim().length < 2) {
    throw new AppError("Invalid title", 400);
  }
  if (typeof parsed.message !== "string" || parsed.message.trim().length < 2) {
    throw new AppError("Invalid message", 400);
  }
  return {
    title: parsed.title.trim(),
    message: parsed.message.trim(),
  };
};

const parseReplyInput = (body: unknown): { message: string } => {
  if (!body || typeof body !== "object") {
    throw new AppError("Invalid reply payload", 400);
  }
  const parsed = body as { message?: unknown };
  if (typeof parsed.message !== "string" || parsed.message.trim().length < 1) {
    throw new AppError("Invalid message", 400);
  }
  return { message: parsed.message.trim() };
};

export const buildNoticeRoutes = (deps: ApiDependencies): Router => {
  const router = Router();
  const requireAuth = authenticate(deps.tokenService);

  router.get("/", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const page = parseOptionalPositiveInt(req.query.page) || 1;
      const limit = Math.min(parseOptionalPositiveInt(req.query.limit) || 20, 100);
      const includeArchived = req.query.includeArchived === "true";
      res.json(deps.noticeService.listNotices(req.user!, { page, limit }, includeArchived));
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const input = parseNoticeInput(req.body);
      res.json(deps.noticeService.createNotice(req.user!, input));
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const noticeId = parsePositiveIntParam(req.params.id, "notice id");
      const input = parseNoticeInput(req.body);
      deps.noticeService.updateNotice(req.user!, noticeId, input);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/archive", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const noticeId = parsePositiveIntParam(req.params.id, "notice id");
      const archived = Boolean((req.body as { archived?: unknown })?.archived);
      deps.noticeService.archiveNotice(req.user!, noticeId, archived);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/replies", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const noticeId = parsePositiveIntParam(req.params.id, "notice id");
      const input = parseReplyInput(req.body);
      res.json(deps.noticeService.addReply(req.user!, noticeId, input));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/acknowledge", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const noticeId = parsePositiveIntParam(req.params.id, "notice id");
      deps.noticeService.acknowledge(req.user!, noticeId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
