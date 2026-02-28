import { Router } from "express";
import { AppError } from "../../domain/errors";
import type { ApiDependencies } from "../dependencies";
import { authenticate, authorize, type AuthenticatedRequest } from "../middleware/auth-middleware";
import {
  parsePositiveIntParam,
  validateChangePasswordInput,
  validateProfileInput,
  validateResetPasswordInput,
  validateUserInput,
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

export const buildUserRoutes = (deps: ApiDependencies): Router => {
  const router = Router();
  const requireAuth = authenticate(deps.tokenService);

  router.get("/", requireAuth, authorize(["sysAdmin", "manager"]), (req: AuthenticatedRequest, res) => {
    const page = parseOptionalPositiveInt(req.query.page);
    const limit = parseOptionalPositiveInt(req.query.limit);
    const usePagination = typeof page !== "undefined" || typeof limit !== "undefined";

    if (!usePagination) {
      res.json(deps.userService.listUsersForRequester(req.user!));
      return;
    }

    res.json(
      deps.userService.listUsersForRequester(req.user!, {
        page: page || 1,
        limit: Math.min(limit || 25, 200),
      }),
    );
  });

  router.post("/", requireAuth, authorize(["sysAdmin"]), async (req, res, next) => {
    try {
      const { username, password, role, full_name, email, avatar_url, daily_task_cap } = validateUserInput(req.body);
      if (!password) {
        throw new AppError("Password is required", 400);
      }
      const user = await deps.userService.createUser({
        username,
        password,
        role,
        full_name,
        email,
        avatar_url,
        daily_task_cap,
      });
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", requireAuth, authorize(["sysAdmin"]), (req, res, next) => {
    try {
      const userId = parsePositiveIntParam(req.params.id, "user id");
      deps.userService.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id", requireAuth, authorize(["sysAdmin"]), async (req, res, next) => {
    try {
      const userId = parsePositiveIntParam(req.params.id, "user id");
      const { username, password, role, full_name, email, avatar_url, daily_task_cap } = validateUserInput(req.body);
      await deps.userService.updateUser({
        id: userId,
        username,
        role,
        full_name,
        email,
        avatar_url,
        daily_task_cap,
        password,
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/reset-password", requireAuth, authorize(["sysAdmin"]), async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = parsePositiveIntParam(req.params.id, "user id");
      const { newPassword } = validateResetPasswordInput(req.body);
      await deps.userService.resetUserPassword({
        actorRole: req.user!.role,
        userId,
        newPassword,
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.put("/me/password", requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { currentPassword, newPassword } = validateChangePasswordInput(req.body);
      await deps.userService.changeMyPassword({
        userId: req.user!.id,
        currentPassword,
        newPassword,
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.put("/me/profile", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const { full_name, email, avatar_url } = validateProfileInput(req.body);
      const profile = deps.userService.updateMyProfile({
        userId: req.user!.id,
        full_name,
        email,
        avatar_url,
      });
      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/me/profile", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const { full_name, email, avatar_url } = validateProfileInput(req.body);
      const profile = deps.userService.updateMyProfile({
        userId: req.user!.id,
        full_name,
        email,
        avatar_url,
      });
      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
