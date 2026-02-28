import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { ApiDependencies } from "../dependencies";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth-middleware";
import { generateCsrfToken } from "../middleware/csrf-middleware";
import { validateLoginInput, validateProfileInput } from "../validation/request-validators";

export const buildAuthRoutes = (deps: ApiDependencies): Router => {
  const router = Router();
  const requireAuth = authenticate(deps.tokenService);
  const cookieSameSite = (process.env.COOKIE_SAME_SITE || "strict") as "lax" | "strict" | "none";
  const cookieSecure =
    process.env.COOKIE_SECURE === "true" || (process.env.COOKIE_SECURE !== "false" && deps.isProduction);
  const cookieMaxAgeMs = Number(process.env.AUTH_COOKIE_MAX_AGE_MS || 12 * 60 * 60 * 1000);
  if (cookieSameSite === "none" && !cookieSecure) {
    throw new Error("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true");
  }
  const cookieOptions = {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    path: "/",
    maxAge: Number.isFinite(cookieMaxAgeMs) && cookieMaxAgeMs > 0 ? cookieMaxAgeMs : 12 * 60 * 60 * 1000,
  } as const;
  const csrfCookieOptions = {
    httpOnly: false,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    path: "/",
    maxAge: Number.isFinite(cookieMaxAgeMs) && cookieMaxAgeMs > 0 ? cookieMaxAgeMs : 12 * 60 * 60 * 1000,
  } as const;

  const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Please try again later." },
  });

  router.post("/login", loginRateLimit, async (req, res, next) => {
    try {
      const { username, password } = validateLoginInput(req.body);
      const { user, token } = await deps.authService.login(username, password);
      const csrfToken = generateCsrfToken();

      res.cookie("token", token, cookieOptions);
      res.cookie("csrf_token", csrfToken, csrfCookieOptions);
      deps.auditLogService.logEvent({
        actorUserId: user.id,
        action: "auth_login_success",
        entityType: "auth",
        statusCode: 200,
        ip: req.socket.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
        details: JSON.stringify({ username }),
      });

      res.json(user);
    } catch (error) {
      const username = typeof req.body?.username === "string" ? req.body.username : "unknown";
      deps.auditLogService.logEvent({
        actorUserId: null,
        action: "auth_login_failed",
        entityType: "auth",
        statusCode: 401,
        ip: req.socket.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
        details: JSON.stringify({ username }),
      });
      next(error);
    }
  });

  router.get("/csrf", (_req, res) => {
    const csrfToken = generateCsrfToken();
    res.cookie("csrf_token", csrfToken, csrfCookieOptions);
    res.json({ csrfToken });
  });

  router.post("/logout", (req, res) => {
    res.clearCookie("token", cookieOptions);
    res.clearCookie("csrf_token", csrfCookieOptions);
    deps.auditLogService.logEvent({
      actorUserId: null,
      action: "auth_logout",
      entityType: "auth",
      statusCode: 200,
      ip: req.socket.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });
    res.json({ success: true });
  });

  router.get("/me", requireAuth, (req: AuthenticatedRequest, res, next) => {
    try {
      const profile = deps.userService.getMyProfile(req.user!.id);
      res.json(profile);
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

  return router;
};
