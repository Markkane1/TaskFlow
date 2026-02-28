import { Router } from "express";
import type { ApiDependencies } from "../dependencies";
import { authenticate, authorize, type AuthenticatedRequest } from "../middleware/auth-middleware";

export const buildAnalyticsRoutes = (deps: ApiDependencies): Router => {
  const router = Router();
  const requireAuth = authenticate(deps.tokenService);

  router.get("/summary", requireAuth, authorize(["sysAdmin", "manager"]), (req: AuthenticatedRequest, res) => {
    res.json(deps.analyticsService.getSummary(req.user!));
  });

  router.get("/capacity", requireAuth, authorize(["sysAdmin", "manager"]), (req: AuthenticatedRequest, res) => {
    const summary = deps.analyticsService.getSummary(req.user!);
    res.json({
      capacityPlanning: summary.capacityPlanning || [],
      sla: summary.sla || {
        overdueTotal: 0,
        escalatedTotal: 0,
        pendingEscalation: 0,
      },
    });
  });

  return router;
};
