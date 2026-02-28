import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../domain/errors";
import type { AuthenticatedRequestUser } from "../../domain/types";
import { TokenService } from "../../infrastructure/security/token-service";

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedRequestUser;
}

export const authenticate = (tokenService: TokenService) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const token = req.cookies?.token;

    if (!token) {
      next(new AppError("Unauthorized", 401));
      return;
    }

    try {
      req.user = tokenService.verify(token);
      next();
    } catch {
      next(new AppError("Invalid token", 401));
    }
  };
};

export const authorize = (roles: string[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError("Forbidden", 403));
      return;
    }

    next();
  };
};
