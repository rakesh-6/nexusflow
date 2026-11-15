import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.ts";
import { PrismaClient } from "../generated/prisma/client.ts";

// One shared database client for the whole app. It connects lazily on the
// first query, so the server can start even while the database is asleep.
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  // Neon's free tier pauses when idle; waking up can take a few seconds.
  connectionTimeoutMillis: 15_000,
  max: 10,
});

export const prisma = new PrismaClient({
  adapter,
  transactionOptions: {
    // Prisma's defaults (2 s to start, 5 s to finish) are too short when Neon
    // is waking up or when each query crosses the ocean to the database region.
    maxWait: 15_000,
    timeout: 15_000,
  },
});
