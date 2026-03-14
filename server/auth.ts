import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { createHmac, scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import type { User as AppUser } from "@shared/schema";
import connectPg from "connect-pg-simple";
import { createRateLimit } from "./rateLimit";

const scryptAsync = promisify(scrypt);
const ECOSYSTEM_SSO_TOKEN_TTL_SECONDS = 60;
const SESSION_COOKIE_NAME = "connect.sid";
const isProduction = process.env.NODE_ENV === "production";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

function getSessionSecret(): string {
  const configuredSecret = process.env.SESSION_SECRET?.trim();
  if (configuredSecret) return configuredSecret;
  if (isProduction) {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  return "annai-dev-session-secret";
}

function normalizeSecurityAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}

async function hashSecurityAnswer(answer: string): Promise<string> {
  return hashPassword(`security-answer:${normalizeSecurityAnswer(answer)}`);
}

async function compareSecurityAnswer(supplied: string, stored: string): Promise<boolean> {
  const normalizedSupplied = normalizeSecurityAnswer(supplied);

  if (stored.includes(".")) {
    return comparePasswords(`security-answer:${normalizedSupplied}`, stored);
  }

  const normalizedStored = normalizeSecurityAnswer(stored);
  const suppliedBuffer = Buffer.from(normalizedSupplied, "utf8");
  const storedBuffer = Buffer.from(normalizedStored, "utf8");

  if (suppliedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(suppliedBuffer, storedBuffer);
}

function getRateLimitKey(req: Request): string {
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  return `${req.path}:${req.ip}:${username}`;
}

const loginRateLimit = createRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Please wait a few minutes and try again.",
  keyGenerator: getRateLimitKey,
});

const registerRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: "Too many registration attempts. Please try again later.",
  keyGenerator: getRateLimitKey,
});

const passwordQuestionRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many password reset attempts. Please try again later.",
  keyGenerator: getRateLimitKey,
});

const passwordResetRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many password reset attempts. Please try again later.",
  keyGenerator: getRateLimitKey,
});

const changePasswordRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many password change attempts. Please try again later.",
  keyGenerator: (req) => `${req.path}:${req.ip}:${req.user?.id ?? "anon"}`,
});

const annaiExchangeRateLimit = createRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Too many Annai handoff attempts. Please try again later.",
});

function finalizeAuthenticatedSession(
  req: Request,
  res: Response,
  user: AppUser,
  successStatus = 200,
  errorMessage = "Login failed",
) {
  req.session.regenerate((regenerateErr) => {
    if (regenerateErr) {
      return res.status(500).json({ message: errorMessage });
    }

    req.session.csrfToken = randomBytes(24).toString("base64url");

    req.login(user, (loginErr) => {
      if (loginErr) {
        return res.status(500).json({ message: errorMessage });
      }

      return res.status(successStatus).json({ id: user.id, username: user.username });
    });
  });
}

type AnnaiSsoPayload = {
  iss: "annai-camping";
  aud: "annai-travel";
  sub: string;
  username: string;
  iat: number;
  exp: number;
  nonce: string;
  v: 1;
};

function getAnnaiSsoSecret(): string | undefined {
  const explicitSecret = process.env.ANNAI_SSO_SHARED_SECRET?.trim();
  if (explicitSecret) return explicitSecret;
  if (process.env.NODE_ENV !== "production") {
    return "annai-local-sso-secret";
  }
  return undefined;
}

function signAnnaiSsoPayload(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

function verifyAnnaiSsoToken(token: string): AnnaiSsoPayload | undefined {
  const secret = getAnnaiSsoSecret();
  if (!secret) return undefined;

  const parts = token.split(".");
  if (parts.length !== 2) return undefined;
  const [encodedPayload, providedSignatureBase64] = parts;
  if (!encodedPayload || !providedSignatureBase64) return undefined;

  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(providedSignatureBase64, "base64url");
  } catch {
    return undefined;
  }

  const expectedSignature = signAnnaiSsoPayload(encodedPayload, secret);
  if (providedSignature.length !== expectedSignature.length) return undefined;
  if (!timingSafeEqual(providedSignature, expectedSignature)) return undefined;

  let payload: AnnaiSsoPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AnnaiSsoPayload;
  } catch {
    return undefined;
  }

  if (!payload || payload.v !== 1) return undefined;
  if (payload.iss !== "annai-camping" || payload.aud !== "annai-travel") return undefined;
  if (typeof payload.sub !== "string" || !payload.sub) return undefined;
  if (typeof payload.username !== "string" || !payload.username) return undefined;
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return undefined;
  return payload;
}

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}

declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
  }
}

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const PgStore = connectPg(session);
  const sessionSecret = getSessionSecret();
  const sessionStore =
    process.env.DATABASE_URL
      ? new PgStore({
          conString: process.env.DATABASE_URL,
        })
      : new MemoryStore({
          checkPeriod: 1000 * 60 * 60 * 24,
        });

  app.use(
    session({
      store: sessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      proxy: isProduction,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use((req, _res, next) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = randomBytes(24).toString("base64url");
    }
    next();
  });
  app.use((req, res, next) => {
    passport.session()(req, res, (err: unknown) => {
      if (!err) {
        return next();
      }

      if (err instanceof Error && err.message === "Failed to deserialize user out of session") {
        req.logout(() => {
          req.session?.destroy(() => {
            res.clearCookie(SESSION_COOKIE_NAME);
            next();
          });
        });
        return;
      }

      next(err);
    });
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) return done(null, false, { message: "Invalid username or password" });
        const isValid = await comparePasswords(password, user.password);
        if (!isValid) return done(null, false, { message: "Invalid username or password" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.get("/api/csrf-token", (req: Request, res: Response) => {
    res.json({ csrfToken: req.session.csrfToken });
  });

  app.use((req, res, next) => {
    const method = req.method.toUpperCase();
    const requiresCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    if (!requiresCsrf || !req.path.startsWith("/api/")) {
      return next();
    }

    if (
      req.path === "/api/subscription/webhooks/apple" ||
      req.path === "/api/subscription/webhooks/google"
    ) {
      return next();
    }

    const providedToken = req.header("x-csrf-token");
    const expectedToken = req.session.csrfToken;
    if (!providedToken || !expectedToken) {
      return res.status(403).json({ message: "CSRF token required" });
    }

    const providedBuffer = Buffer.from(providedToken, "utf8");
    const expectedBuffer = Buffer.from(expectedToken, "utf8");
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return res.status(403).json({ message: "Invalid CSRF token" });
    }

    return next();
  });

  app.post("/api/register", registerRateLimit, async (req: Request, res: Response) => {
    try {
      const { username, password, securityQuestion, securityAnswer } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      if (username.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }
      if (password.length < 10) {
        return res.status(400).json({ message: "Password must be at least 10 characters" });
      }
      if (!securityQuestion || !securityAnswer) {
        return res.status(400).json({ message: "Security question and answer are required" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const hashedPassword = await hashPassword(password);
      const hashedAnswer = await hashSecurityAnswer(securityAnswer as string);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        securityQuestion,
        securityAnswer: hashedAnswer,
      });

      return finalizeAuthenticatedSession(req, res, user, 201, "Login failed after registration");
    } catch (err) {
      console.error("Registration error:", err);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/forgot-password/question", passwordQuestionRateLimit, async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ message: "Username is required" });
      const user = await storage.getUserByUsername(username);
      const genericPrompt = "Enter the security answer you set when creating your account.";
      if (!user || !user.securityQuestion) {
        return res.status(200).json({ securityQuestion: genericPrompt });
      }
      return res.status(200).json({ securityQuestion: genericPrompt });
    } catch (err) {
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/forgot-password/reset", passwordResetRateLimit, async (req: Request, res: Response) => {
    try {
      const { username, securityAnswer, newPassword } = req.body;
      if (!username || !securityAnswer || !newPassword) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if ((newPassword as string).length < 10) {
        return res.status(400).json({ message: "Password must be at least 10 characters" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user || !user.securityAnswer) {
        return res.status(401).json({ message: "Unable to verify reset details" });
      }
      const isValidAnswer = await compareSecurityAnswer(securityAnswer as string, user.securityAnswer);
      if (!isValidAnswer) {
        return res.status(401).json({ message: "Unable to verify reset details" });
      }
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);
      if (!user.securityAnswer.includes(".")) {
        await storage.updateUser(user.id, {
          securityAnswer: await hashSecurityAnswer(securityAnswer as string),
        });
      }
      return res.json({ message: "Password reset successfully" });
    } catch (err) {
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/login", loginRateLimit, (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: AppUser | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Login failed" });
      return finalizeAuthenticatedSession(req, res, user, 200, "Login failed");
    })(req, res, next);
  });

  app.post("/api/auth/annai/exchange", annaiExchangeRateLimit, async (req: Request, res: Response) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!token) {
      return res.status(400).json({ message: "Annai handoff token is required" });
    }

    const payload = verifyAnnaiSsoToken(token);
    if (!payload) {
      return res.status(401).json({ message: "Invalid or expired Annai handoff token" });
    }

    let user = await storage.getUserByAnnaiUserId(payload.sub);
    if (!user) {
      const usernameConflict = await storage.getUserByUsername(payload.username);
      if (usernameConflict && usernameConflict.annaiUserId !== payload.sub) {
        return res.status(409).json({
          message: "A Travel account with this username already exists and must be linked manually.",
        });
      }

      if (usernameConflict) {
        user = await storage.setUserAnnaiUserId(usernameConflict.id, payload.sub);
      } else {
        user = await storage.createUser({
          annaiUserId: payload.sub,
          username: payload.username,
          password: await hashPassword(randomBytes(24).toString("hex")),
          securityQuestion: null,
          securityAnswer: null,
        });
      }
    }

    return finalizeAuthenticatedSession(req, res, user, 200, "Travel login failed after Annai exchange");
  });

  app.post("/api/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      req.session?.destroy((sessionErr) => {
        if (sessionErr) {
          return res.status(500).json({ message: "Logout failed" });
        }
        res.clearCookie(SESSION_COOKIE_NAME);
        return res.json({ message: "Logged out" });
      });
    });
  });

  app.post("/api/account/change-password", requireAuth, changePasswordRateLimit, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      if ((newPassword as string).length < 10) {
        return res.status(400).json({ message: "Password must be at least 10 characters" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const isValidCurrentPassword = await comparePasswords(currentPassword as string, user.password);
      if (!isValidCurrentPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const isSamePassword = await comparePasswords(newPassword as string, user.password);
      if (isSamePassword) {
        return res.status(400).json({ message: "New password must be different from your current password" });
      }

      const hashedPassword = await hashPassword(newPassword as string);
      await storage.updateUserPassword(user.id, hashedPassword);
      return res.status(200).json({ message: "Password updated successfully" });
    } catch {
      return res.status(500).json({ message: "Unable to update password" });
    }
  });

  app.delete("/api/account", requireAuth, (req: Request, res: Response) => {
    const userId = req.user!.id;

    req.logout((logoutErr) => {
      if (logoutErr) {
        return res.status(500).json({ message: "Account deletion failed during logout" });
      }

      req.session?.destroy(async (sessionErr) => {
        if (sessionErr) {
          return res.status(500).json({ message: "Account deletion failed while clearing the session" });
        }

        try {
          await storage.deleteUser(userId);
          res.clearCookie(SESSION_COOKIE_NAME);
          return res.status(204).send();
        } catch (error) {
          console.error("Account deletion error:", error);
          return res.status(500).json({ message: "Account deletion failed" });
        }
      });
    });
  });

  app.get("/api/user", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const user = req.user!;
    return res.json({ id: user.id, username: user.username });
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}
