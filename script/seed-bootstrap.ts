import { createHash, randomBytes, scrypt } from "crypto";
import { promisify } from "util";
import { eq, sql } from "drizzle-orm";
import { ensureDatabaseSchema, db } from "../server/db";
import { couponCodes, users } from "../shared/schema";

const scryptAsync = promisify(scrypt);

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function generateCouponCode(): string {
  const token = randomBytes(8).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `ANNAI-${token.slice(0, 12)}`;
}

function generatePassword(length = 20): string {
  const raw = randomBytes(Math.ceil(length * 0.75)).toString("base64url");
  return `${raw.slice(0, length)}!aA1`;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function main() {
  if (!db) {
    throw new Error("Database config is required. Set DATABASE_URL or PG* env vars first.");
  }

  await ensureDatabaseSchema();

  const ownerUsername = (parseArg("owner") ?? process.env.OWNER_USERNAME ?? "spooky").trim();
  const requestedPassword = parseArg("password") ?? process.env.OWNER_PASSWORD;
  const shouldResetExistingPassword = (parseArg("reset-password") ?? "").trim().toLowerCase() === "true";
  const couponCount = Math.max(1, Math.min(200, parseNumber(parseArg("count"), 20)));
  const couponDurationDays = Math.max(1, Math.min(365, parseNumber(parseArg("days"), 30)));
  const couponLabel = parseArg("label")?.trim() || "bootstrap";

  if (!ownerUsername) {
    throw new Error("Owner username cannot be empty.");
  }

  const [existingOwner] = await db
    .select()
    .from(users)
    .where(eq(users.username, ownerUsername))
    .limit(1);

  let ownerId: number;
  let ownerPasswordToUse = requestedPassword?.trim() ?? "";
  let ownerAction = "";

  if (!existingOwner) {
    if (!ownerPasswordToUse) {
      ownerPasswordToUse = generatePassword(16);
    }

    const [created] = await db
      .insert(users)
      .values({
        username: ownerUsername,
        password: await hashPassword(ownerPasswordToUse),
        securityQuestion: "Seed bootstrap account",
        securityAnswer: await hashPassword("security-answer:bootstrap"),
        subscriptionStatus: "inactive",
        proAccess: true,
        proAccessReason: "seed_bootstrap",
        proAccessUpdatedAt: new Date(),
      })
      .returning({ id: users.id });

    ownerId = created.id;
    ownerAction = "created";
  } else {
    ownerId = existingOwner.id;
    ownerAction = "updated";

    const updatePayload: Partial<typeof existingOwner> = {
      proAccess: true,
      proAccessReason: "seed_bootstrap",
      proAccessUpdatedAt: new Date(),
    };

    if (ownerPasswordToUse && shouldResetExistingPassword) {
      updatePayload.password = await hashPassword(ownerPasswordToUse);
    } else if (!ownerPasswordToUse && shouldResetExistingPassword) {
      ownerPasswordToUse = generatePassword(16);
      updatePayload.password = await hashPassword(ownerPasswordToUse);
    }

    await db.update(users).set(updatePayload).where(eq(users.id, ownerId));
  }

  const issuedCodes: string[] = [];
  const issuedHashes = new Set<string>();
  const maxAttempts = couponCount * 20;
  let attempts = 0;

  while (issuedCodes.length < couponCount && attempts < maxAttempts) {
    attempts += 1;
    const code = generateCouponCode();
    const codeHash = createHash("sha256").update(code).digest("hex");
    if (issuedHashes.has(codeHash)) continue;

    issuedHashes.add(codeHash);
    try {
      await db.insert(couponCodes).values({
        codeHash,
        label: couponLabel,
        durationDays: couponDurationDays,
        createdByUserId: ownerId,
      });
      issuedCodes.push(code);
    } catch {
      // Unique conflict on hash, retry.
    }
  }

  const [userCountRow] = await db
    .select({ userCount: sql<number>`count(*)` })
    .from(users);
  const [couponCountRow] = await db
    .select({ couponCountTotal: sql<number>`count(*)` })
    .from(couponCodes);

  console.log(`Owner ${ownerAction}: ${ownerUsername} (id: ${ownerId})`);
  console.log(`Owner Pro access: enabled`);
  if (!existingOwner || shouldResetExistingPassword) {
    console.log(`Owner password: ${ownerPasswordToUse}`);
  } else {
    console.log(`Owner password: unchanged`);
  }
  console.log(`Issued coupons: ${issuedCodes.length}/${couponCount} (duration ${couponDurationDays} days, label "${couponLabel}")`);
  console.log(`DB totals -> users: ${Number(userCountRow.userCount)}, coupons: ${Number(couponCountRow.couponCountTotal)}`);
  if (issuedCodes.length > 0) {
    console.log("Coupon codes:");
    for (const code of issuedCodes) {
      console.log(code);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
