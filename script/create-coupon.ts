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
  const count = Math.max(1, Math.min(100, Number(parseArg("count") ?? "1")));
  const label = parseArg("label")?.trim() || null;
  const creatorUsername = parseArg("by")?.trim() || "Spooky";

  const [creator] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, creatorUsername))
    .limit(1);

  const durationDays = Number.isFinite(days) && days > 0 ? days : 30;
  const batch: Array<{ code: string; codeHash: string }> = [];
  const usedCodes = new Set<string>();

  while (batch.length < count) {
    const code = makeCouponCode();
    if (usedCodes.has(code)) {
      continue;
    }

    usedCodes.add(code);
    batch.push({
      code,
      codeHash: createHash("sha256").update(code).digest("hex"),
    });
  }

  await db.insert(couponCodes).values(
    batch.map(({ codeHash }) => ({
      codeHash,
      label,
      durationDays,
      createdByUserId: creator?.id ?? null,
    })),
  );

  console.log(`Created ${batch.length} coupon code${batch.length === 1 ? "" : "s"}`);
  console.log(`Duration: ${durationDays} days`);
  if (label) {
    console.log(`Label: ${label}`);
  }
  console.log("Codes:");
  for (const { code } of batch) {
    console.log(code);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
