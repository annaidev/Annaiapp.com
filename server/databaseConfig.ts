import "./loadEnv";
import type { PoolConfig } from "pg";

function toBool(value?: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

const connectionString = process.env.DATABASE_URL?.trim();

const hasDiscretePgConfig = Boolean(
  process.env.PGHOST?.trim() &&
    process.env.PGUSER?.trim() &&
    process.env.PGDATABASE?.trim(),
);

function buildDiscretePoolConfig(): PoolConfig {
  const sslMode = (process.env.PGSSLMODE ?? "").trim().toLowerCase();
  const requireSsl = sslMode === "require" || toBool(process.env.PGSSL);
  const portRaw = process.env.PGPORT?.trim();
  const parsedPort = portRaw ? Number.parseInt(portRaw, 10) : 5432;

  return {
    host: process.env.PGHOST?.trim(),
    port: Number.isFinite(parsedPort) ? parsedPort : 5432,
    database: process.env.PGDATABASE?.trim(),
    user: process.env.PGUSER?.trim(),
    password: process.env.PGPASSWORD ?? "",
    ...(requireSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

function shouldEnableSslForConnectionString(value: string): boolean {
  const sslModeFromEnv = (process.env.PGSSLMODE ?? "").trim().toLowerCase();
  if (sslModeFromEnv === "disable") return false;
  if (sslModeFromEnv === "require") return true;
  if (toBool(process.env.PGSSL)) return true;

  try {
    const parsed = new URL(value);
    const sslModeFromUrl = parsed.searchParams.get("sslmode")?.trim().toLowerCase();
    if (sslModeFromUrl === "disable") return false;
    if (sslModeFromUrl === "require" || sslModeFromUrl === "verify-ca" || sslModeFromUrl === "verify-full") {
      return true;
    }

    // Render's external postgres endpoints require TLS.
    if (parsed.hostname.endsWith(".render.com")) {
      return true;
    }
  } catch {
    // Fall through to default behavior below.
  }

  return false;
}

export const databasePoolConfig: PoolConfig | null = connectionString
  ? {
      connectionString,
      ...(shouldEnableSslForConnectionString(connectionString)
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
    }
  : hasDiscretePgConfig
    ? buildDiscretePoolConfig()
    : null;

export const hasDatabaseConfig = databasePoolConfig !== null;
