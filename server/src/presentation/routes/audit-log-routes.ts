import { Router } from "express";
import type { ApiDependencies } from "../dependencies";
import { authenticate, authorize, type AuthenticatedRequest } from "../middleware/auth-middleware";

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

export const buildAuditLogRoutes = (deps: ApiDependencies): Router => {
  const router = Router();
  const requireAuth = authenticate(deps.tokenService);

  router.get("/", requireAuth, authorize(["sysAdmin"]), (req: AuthenticatedRequest, res, next) => {
    try {
      const page = parseOptionalPositiveInt(req.query.page) || 1;
      const limit = Math.min(parseOptionalPositiveInt(req.query.limit) || 25, 100);
      const actorUserId = parseOptionalPositiveInt(req.query.actorUserId);
      const statusCode = parseOptionalPositiveInt(req.query.statusCode);
      const action = typeof req.query.action === "string" ? req.query.action : undefined;
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;

      res.json(
        deps.auditLogService.listLogs(
          req.user!,
          {
            action,
            actorUserId,
            statusCode,
            from,
            to,
          },
          { page, limit },
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
};
