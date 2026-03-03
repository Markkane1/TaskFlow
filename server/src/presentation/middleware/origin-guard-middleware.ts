import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../domain/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const normalizeOrigin = (value?: string | null): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const originGuard = (allowedOrigin?: string) => {
  const normalizedAllowedOrigin = normalizeOrigin(allowedOrigin);

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const origin = req.headers.origin;
    if (!origin) {
      // Non-browser clients may not send Origin.
      next();
      return;
    }

    try {
      const normalizedOrigin = new URL(origin).origin;
      const requestHost = req.get("host");
      const requestOrigin = normalizeOrigin(requestHost ? `${req.protocol}://${requestHost}` : null);
      const isAllowed =
        normalizedOrigin === normalizedAllowedOrigin ||
        (requestOrigin !== null && normalizedOrigin === requestOrigin);

      if (!isAllowed) {
        next(new AppError("Invalid request origin", 403));
        return;
      }
    } catch {
      next(new AppError("Invalid request origin", 403));
      return;
    }

    next();
  };
};
