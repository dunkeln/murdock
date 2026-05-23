import "server-only";

import { neon } from "@neondatabase/serverless";

const NEON_CONNECTION_URL_ENV = "NEON_CONN_URL";

export function createNeonSql() {
  const connectionString = process.env[NEON_CONNECTION_URL_ENV];

  if (!connectionString) {
    throw new Error(`${NEON_CONNECTION_URL_ENV} is required for database access.`);
  }

  return neon(connectionString);
}
