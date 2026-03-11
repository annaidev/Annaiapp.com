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

const scryptAsync = promisify(scrypt);
const ECOSYSTEM_SSO_TOKEN_TTL_SECONDS = 60;

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

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const PgStore = connectPg(session);
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
      secret: process.env.SESSION_SECRET || "annai-fallback-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use((req, res, next) => {
    passport.session()(req, res, (err: unknown) => {
      if (!err) {
        return next();
      }

      if (err instanceof Error && err.message === "Failed to deserialize user out of session") {
        req.logout(() => {
          req.session?.destroy(() => {
            res.clearCookie("connect.sid");
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

  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const { username, password, securityQuestion, securityAnswer } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      if (username.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      if (!securityQuestion || !securityAnswer) {
        return res.status(400).json({ message: "Security question and answer are required" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const hashedPassword = await hashPassword(password);
      const hashedAnswer = (securityAnswer as string).trim().toLowerCase();
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        securityQuestion,
        securityAnswer: hashedAnswer,
      });

      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed after registration" });
        return res.status(201).json({ id: user.id, username: user.username });
      });
    } catch (err) {
      console.error("Registration error:", err);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/forgot-password/question", async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ message: "Username is required" });
      const user = await storage.getUserByUsername(username);
      if (!user || !user.securityQuestion) {
        return res.status(404).json({ message: "Account not found or no security question set" });
      }
      return res.json({ securityQuestion: user.securityQuestion });
    } catch (err) {
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/forgot-password/reset", async (req: Request, res: Response) => {
    try {
      const { username, securityAnswer, newPassword } = req.body;
      if (!username || !securityAnswer || !newPassword) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if ((newPassword as string).length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user || !user.securityAnswer) {
        return res.status(404).json({ message: "Account not found" });
      }
      const normalizedAnswer = (securityAnswer as string).trim().toLowerCase();
      if (normalizedAnswer !== user.securityAnswer) {
        return res.status(401).json({ message: "Incorrect security answer" });
      }
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);
      return res.json({ message: "Password reset successfully" });
    } catch (err) {
      return res.status(500).json({ message: "Something went wrong" });
    }
  });

  app.post("/api/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: AppUser | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Login failed" });
      req.login(user, (err) => {
        if (err) return next(err);
        return res.json({ id: user.id, username: user.username });
      });
    })(req, res, next);
  });

  app.post("/api/auth/annai/exchange", async (req: Request, res: Response) => {
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

    req.login(user, (err) => {
      if (err) return res.status(500).json({ message: "Travel login failed after Annai exchange" });
      return res.json({ id: user.id, username: user.username });
    });
  });

  app.post("/api/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
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
