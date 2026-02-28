import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../domain/errors";

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  const isProduction = process.env.NODE_ENV === "production";

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof Error) {
    console.error(err);
  } else {
    console.error("Unhandled error", err);
  }

  const message = isProduction ? "Internal server error" : err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
};
