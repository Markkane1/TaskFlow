import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../domain/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const originGuard = (allowedOrigin: string) => {
  const normalizedAllowedOrigin = new URL(allowedOrigin).origin;

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
      if (normalizedOrigin !== normalizedAllowedOrigin) {
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
