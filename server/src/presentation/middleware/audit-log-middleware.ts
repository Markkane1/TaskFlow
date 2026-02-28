import type { NextFunction, Request, Response } from "express";
import { AuditLogService } from "../../application/services/audit-log-service";
import type { AuthenticatedRequest } from "./auth-middleware";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const toAction = (req: Request, statusCode: number): string => {
  if (statusCode === 401) return "auth_unauthorized";
  if (statusCode === 403) return "auth_forbidden";

  const normalizedPath = req.path
    .replace(/\d+/g, ":id")
    .replace(/[^\w/:-]/g, "")
    .replace(/\//g, "_")
    .replace(/^_+/, "");
  return `${req.method.toLowerCase()}_${normalizedPath || "root"}`;
};

const toEntityMeta = (req: Request): { entityType?: string; entityId?: string } => {
  const segments = req.path.split("/").filter(Boolean);
  if (!segments.length) {
    return {};
  }
  const entityType = segments[0];
  const maybeId = segments.find((segment) => /^\d+$/.test(segment));
  return {
    entityType,
    entityId: maybeId,
  };
};

export const auditLogMiddleware = (auditLogs: AuditLogService) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const shouldTrackByMethod = !SAFE_METHODS.has(req.method.toUpperCase());

    res.on("finish", () => {
      const statusCode = res.statusCode;
      const shouldTrackByStatus = statusCode === 401 || statusCode === 403;
      if (!shouldTrackByMethod && !shouldTrackByStatus) {
        return;
      }

      const action = toAction(req, statusCode);
      const { entityType, entityId } = toEntityMeta(req);
      const details = JSON.stringify({
        method: req.method,
        path: req.path,
        query: req.query,
      });
      const forwardedFor = req.headers["x-forwarded-for"];
      const ip = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : typeof forwardedFor === "string"
          ? forwardedFor.split(",")[0].trim()
          : req.socket.remoteAddress || null;

      auditLogs.logEvent({
        actorUserId: req.user?.id ?? null,
        action,
        entityType: entityType || null,
        entityId: entityId || null,
        statusCode,
        ip,
        userAgent: req.headers["user-agent"] || null,
        details,
      });
    });

    next();
  };
};
