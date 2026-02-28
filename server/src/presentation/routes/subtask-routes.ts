import { Router } from "express";
import type { ApiDependencies } from "../dependencies";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth-middleware";
import { parsePositiveIntParam, validateSubtaskStatusInput } from "../validation/request-validators";

export const buildSubtaskRoutes = (deps: ApiDependencies): Router => {
  const router = Router();
  const requireAuth = authenticate(deps.tokenService);

  router.patch("/:id", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const subtaskId = parsePositiveIntParam(req.params.id, "subtask id");
      const { status, remarks } = validateSubtaskStatusInput(req.body);
      deps.taskService.updateSubtask(req.user!, subtaskId, status, remarks);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
