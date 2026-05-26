import "server-only";

import { drizzle } from "drizzle-orm/neon-http";

import * as matterOperationsSchema from "@/lib/server/db/schema/matter-operations";

import { createNeonSql } from "./client";

export function createDrizzleDb() {
  return drizzle(createNeonSql(), {
    schema: matterOperationsSchema,
  });
}
