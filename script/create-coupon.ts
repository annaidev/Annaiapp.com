import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { ensureDatabaseSchema, db } from "../server/db";
import { couponCodes, users } from "../shared/schema";

function parseArg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function makeCouponCode() {
  const token = randomBytes(8).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `ANNAI-${token.slice(0, 12)}`;
}

async function main() {
  if (!db) {
    throw new Error("DATABASE_URL is required to create coupon codes.");
  }

  await ensureDatabaseSchema();

  const days = Number(parseArg("days") ?? "30");
  const label = parseArg("label")?.trim() || null;
  const creatorUsername = parseArg("by")?.trim() || "Spooky";
  const code = makeCouponCode();
  const codeHash = createHash("sha256").update(code).digest("hex");

  const [creator] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, creatorUsername))
    .limit(1);

  await db.insert(couponCodes).values({
    codeHash,
    label,
    durationDays: Number.isFinite(days) && days > 0 ? days : 30,
    createdByUserId: creator?.id ?? null,
  });

  console.log(`Coupon code: ${code}`);
  console.log(`Duration: ${Number.isFinite(days) && days > 0 ? days : 30} days`);
  if (label) {
    console.log(`Label: ${label}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
