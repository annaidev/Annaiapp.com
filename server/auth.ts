import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User } from "@shared/schema";
import connectPg from "connect-pg-simple";

const scryptAsync = promisify(scrypt);

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

declare global {
  namespace Express {
    interface User extends import("@shared/schema").User {}
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
  app.use(passport.session());

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
      done(null, user || undefined);
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
    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Login failed" });
      req.login(user, (err) => {
        if (err) return next(err);
        return res.json({ id: user.id, username: user.username });
      });
    })(req, res, next);
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
