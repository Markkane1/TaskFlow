import { randomBytes } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../domain/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const generateCsrfToken = (): string => randomBytes(32).toString("hex");

export const csrfGuard = (ignorePaths: string[] = []) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const method = req.method.toUpperCase();
    if (SAFE_METHODS.has(method)) {
      next();
      return;
    }

    if (ignorePaths.some((path) => req.path === path || req.originalUrl.startsWith(path))) {
      next();
      return;
    }

    const cookieToken = req.cookies?.csrf_token;
    const headerToken = req.header("x-csrf-token");

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      next(new AppError("Invalid CSRF token", 403));
      return;
    }

    next();
  };
};
