import { Router, type Request, type Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";
import { AppError } from "../../domain/errors";
import type { ApiDependencies } from "../dependencies";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth-middleware";
import { generateCsrfToken } from "../middleware/csrf-middleware";
import { validateLoginInput, validateProfileInput } from "../validation/request-validators";

const CAPTCHA_COOKIE = "login_captcha";

type CaptchaState = {
  answer: string;
  expiresAt: number;
  nonce: string;
};

const parsePositiveNumberEnv = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const signCaptchaPayload = (payload: string, secret: string): string => {
  return createHmac("sha256", secret).update(payload).digest("base64url");
};

const encodeCaptchaState = (state: CaptchaState, secret: string): string => {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const signature = signCaptchaPayload(payload, secret);
  return `${payload}.${signature}`;
};

const decodeCaptchaState = (token: string, secret: string): CaptchaState | null => {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signCaptchaPayload(payload, secret);
  const left = Buffer.from(signature, "utf8");
  const right = Buffer.from(expectedSignature, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<CaptchaState>;
    if (typeof decoded.answer !== "string" || typeof decoded.expiresAt !== "number" || typeof decoded.nonce !== "string") {
      return null;
    }
    return {
      answer: decoded.answer,
      expiresAt: decoded.expiresAt,
      nonce: decoded.nonce,
    };
  } catch {
    return null;
  }
};

export const buildAuthRoutes = (deps: ApiDependencies): Router => {
  const router = Router();
  const requireAuth = authenticate(deps.tokenService);
  const captchaEnabled = process.env.LOGIN_CAPTCHA_ENABLED !== "false";
  const captchaTtlMs = parsePositiveNumberEnv(process.env.LOGIN_CAPTCHA_TTL_MS, 5 * 60 * 1000);
  const captchaSecret = process.env.CAPTCHA_SECRET || process.env.JWT_SECRET || "taskflow_captcha_fallback_secret";
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
  const captchaCookieOptions = {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    path: "/",
    maxAge: captchaTtlMs,
  } as const;
  const clearAuthCookieOptions = {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    path: "/",
  } as const;
  const clearCsrfCookieOptions = {
    httpOnly: false,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    path: "/",
  } as const;

  const issueCaptcha = (res: Response) => {
    const left = 2 + Math.floor(Math.random() * 10);
    const right = 1 + Math.floor(Math.random() * 9);
    const useAddition = Math.random() >= 0.5;
    const a = useAddition ? left : Math.max(left, right);
    const b = useAddition ? right : Math.min(left, right);
    const op = useAddition ? "+" : "-";
    const answer = String(useAddition ? a + b : a - b);
    const expiresAt = Date.now() + captchaTtlMs;
    const challenge = `What is ${a} ${op} ${b}?`;
    const token = encodeCaptchaState(
      {
        answer,
        expiresAt,
        nonce: randomBytes(12).toString("base64url"),
      },
      captchaSecret,
    );

    res.cookie(CAPTCHA_COOKIE, token, captchaCookieOptions);
    return { challenge, expiresAt };
  };

  const assertCaptcha = (req: Request, answer: string): void => {
    if (!captchaEnabled) {
      return;
    }
    const token = req.cookies?.[CAPTCHA_COOKIE];
    if (!token || typeof token !== "string") {
      throw new AppError("CAPTCHA required", 400);
    }
    const state = decodeCaptchaState(token, captchaSecret);
    if (!state) {
      throw new AppError("Invalid CAPTCHA", 400);
    }
    if (Date.now() > state.expiresAt) {
      throw new AppError("CAPTCHA expired. Please refresh and try again.", 400);
    }
    if (state.answer !== answer.trim()) {
      throw new AppError("Invalid CAPTCHA", 400);
    }
  };

  const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Please try again later." },
  });

  router.get("/captcha", (_req, res) => {
    const payload = issueCaptcha(res);
    res.json(payload);
  });

  router.post("/login", loginRateLimit, async (req, res, next) => {
    try {
      const { username, password, captchaAnswer } = validateLoginInput(req.body);
      assertCaptcha(req, captchaAnswer);
      const { user, token } = await deps.authService.login(username, password);
      const csrfToken = generateCsrfToken();

      res.cookie("token", token, cookieOptions);
      res.cookie("csrf_token", csrfToken, csrfCookieOptions);
      res.clearCookie(CAPTCHA_COOKIE, clearAuthCookieOptions);
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
      const statusCode = error instanceof AppError ? error.statusCode : 401;
      const username = typeof req.body?.username === "string" ? req.body.username : "unknown";
      deps.auditLogService.logEvent({
        actorUserId: null,
        action: "auth_login_failed",
        entityType: "auth",
        statusCode,
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
    res.clearCookie("token", clearAuthCookieOptions);
    res.clearCookie("csrf_token", clearCsrfCookieOptions);
    res.clearCookie(CAPTCHA_COOKIE, clearAuthCookieOptions);
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
