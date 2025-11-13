// server/db.ts
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

// --- THIS IS THE FIX ---
// Import 'ws' using CommonJS-compatible syntax
import ws = require('ws');
// --- END OF FIX ---

import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });

// Helper function to get the DB instance (used in routes.ts)
export function getDb() {
  return db;
}