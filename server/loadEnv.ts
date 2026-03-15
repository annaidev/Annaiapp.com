import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex <= 0) return null;

  const key = trimmed.slice(0, separatorIndex).trim();
  if (!key) return null;

  let value = trimmed.slice(separatorIndex + 1).trim();
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));

  if (quoted) {
    value = value.slice(1, -1);
  } else {
    const hashIndex = value.indexOf("#");
    if (hashIndex >= 0) {
      value = value.slice(0, hashIndex).trim();
    }
  }

  if (value.includes("\\n")) {
    value = value.replace(/\\n/g, "\n");
  }

  return { key, value };
}

function loadEnvFile(filePath: string, overrideExisting: boolean) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    const hasExisting = typeof process.env[parsed.key] !== "undefined";
    if (!hasExisting || overrideExisting) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

const projectRoot = resolve(process.cwd());
const isProduction = process.env.NODE_ENV === "production";
const overrideExisting = !isProduction;

loadEnvFile(resolve(projectRoot, ".env"), overrideExisting);
loadEnvFile(resolve(projectRoot, ".env.local"), overrideExisting);

function isTemplateDatabaseUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.includes("USER:PASSWORD@HOST:5432/DBNAME")) return true;
  return /\b(USER|PASSWORD|HOST|DBNAME)\b/i.test(normalized);
}

const configuredDatabaseUrl = process.env.DATABASE_URL?.trim();
if (configuredDatabaseUrl && isTemplateDatabaseUrl(configuredDatabaseUrl)) {
  console.warn(
    "DATABASE_URL appears to use template placeholders (USER/PASSWORD/HOST/DBNAME). Ignoring it for this run.",
  );
  delete process.env.DATABASE_URL;
}
