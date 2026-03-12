import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "DATABASE_URL is not set. Using in-memory fallback storage for this process.",
  );
}

export const pool = connectionString ? new Pool({ connectionString }) : null;
export const db = pool ? drizzle(pool, { schema }) : null;

export async function ensureDatabaseSchema(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      sid VARCHAR PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire"
    ON "session" (expire);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_users (
      id SERIAL PRIMARY KEY,
      annai_user_id TEXT UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      security_question TEXT,
      security_answer TEXT,
      subscription_status TEXT NOT NULL DEFAULT 'free',
      pro_access BOOLEAN NOT NULL DEFAULT FALSE,
      pro_access_reason TEXT,
      pro_access_updated_at TIMESTAMP,
      preferred_language TEXT NOT NULL DEFAULT 'en',
      home_currency TEXT NOT NULL DEFAULT 'USD',
      citizenship TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE annai_travel_users
    ADD COLUMN IF NOT EXISTS annai_user_id TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS pro_access BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pro_access_reason TEXT,
    ADD COLUMN IF NOT EXISTS pro_access_updated_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS home_currency TEXT NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS citizenship TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES annai_travel_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'inactive',
      platform TEXT,
      product_id TEXT,
      expires_at TIMESTAMP,
      original_transaction_id TEXT,
      is_sandbox BOOLEAN NOT NULL DEFAULT TRUE,
      last_verified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_subscription_webhook_events (
      id SERIAL PRIMARY KEY,
      platform TEXT NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      event_type TEXT,
      status TEXT NOT NULL DEFAULT 'received',
      payload_hash TEXT,
      error_message TEXT,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_gifted_entitlements (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES annai_travel_users(id) ON DELETE CASCADE,
      granted_by_user_id INTEGER NOT NULL REFERENCES annai_travel_users(id) ON DELETE CASCADE,
      plan_tier TEXT NOT NULL DEFAULT 'pro',
      reason TEXT,
      starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP,
      revoked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_coupon_codes (
      id SERIAL PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      label TEXT,
      duration_days INTEGER NOT NULL DEFAULT 30,
      created_by_user_id INTEGER REFERENCES annai_travel_users(id) ON DELETE SET NULL,
      redeemed_by_user_id INTEGER REFERENCES annai_travel_users(id) ON DELETE SET NULL,
      redeemed_at TIMESTAMP,
      expires_at TIMESTAMP,
      disabled_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_trips (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES annai_travel_users(id) ON DELETE CASCADE,
      origin TEXT,
      destination TEXT NOT NULL,
      trip_type TEXT NOT NULL DEFAULT 'one_way',
      start_date TIMESTAMP,
      end_date TIMESTAMP,
      notes TEXT,
      citizenship TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE annai_travel_trips
    ADD COLUMN IF NOT EXISTS origin TEXT,
    ADD COLUMN IF NOT EXISTS trip_type TEXT NOT NULL DEFAULT 'one_way';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_packing_lists (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES annai_travel_trips(id) ON DELETE CASCADE,
      item TEXT NOT NULL,
      is_packed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_budget_items (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES annai_travel_trips(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'USD',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_documents (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES annai_travel_trips(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      label TEXT NOT NULL,
      reference_number TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_itinerary_items (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES annai_travel_trips(id) ON DELETE CASCADE,
      day_number INTEGER NOT NULL,
      time_slot TEXT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      source_fingerprint TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE annai_travel_itinerary_items
    ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annai_travel_ai_response_cache (
      id SERIAL PRIMARY KEY,
      cache_key TEXT NOT NULL UNIQUE,
      feature TEXT NOT NULL,
      destination_normalized TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      request_payload JSONB NOT NULL,
      response_payload JSONB NOT NULL,
      prompt_version TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      last_hit_at TIMESTAMP,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
}
