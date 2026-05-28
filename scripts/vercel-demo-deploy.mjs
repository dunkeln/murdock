#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(rootDir, ".env");
const vercelProjectPath = resolve(rootDir, ".vercel/project.json");

const REQUIRED_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "MISTRAL_API_KEY",
  "NEON_CONN_URL",
  "OPENAI_API_KEY",
];

const OPTIONAL_ENV_KEYS = [
  "ANTHROPIC_MODEL",
  "CASE_CHAT_CONTEXT_TOKEN_BUDGET",
  "CASE_CHAT_RETAINED_MESSAGE_COUNT",
  "HARNESS_AUTO_MAX_RETRIES",
  "HARNESS_MAX_SEGMENT_CALLS",
  "HARNESS_MAX_SOURCE_CALLS",
  "HARNESS_REVIEW_REDUCER_LLM",
  "HARNESS_WORKFLOW_VERSION",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_EXPORT_MODE",
  "LANGFUSE_HOST",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_RELEASE",
  "LANGFUSE_RUNTIME_PROMPT_LABEL",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_TRACING_ENVIRONMENT",
  "MURDOCK_MCP_API_TOKEN",
  "OPENAI_MODEL",
  "OTEL_SERVICE_NAME",
  "XAI_API_KEY",
];

const DEFAULT_ENV = {
  HARNESS_WORKFLOW_VERSION: "v3",
  LANGFUSE_RELEASE: "vercel-demo",
  LANGFUSE_TRACING_ENVIRONMENT: "preview",
  OTEL_SERVICE_NAME: "murdock",
};

function parseArgs(argv) {
  const args = new Set(argv.slice(2));

  return {
    dryRun: args.has("--dry-run"),
    environment: args.has("--prod") || args.has("--production")
      ? "production"
      : "preview",
    skipDeploy: args.has("--env-only"),
    skipEnv: args.has("--deploy-only"),
  };
}

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const env = {};

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  if (env.NEON_CONN_URL?.endsWith("&") && env.channel_binding) {
    env.NEON_CONN_URL = `${env.NEON_CONN_URL}channel_binding=${env.channel_binding}`;
  }

  if (!env.LANGFUSE_HOST && env.LANGFUSE_BASE_URL) {
    env.LANGFUSE_HOST = env.LANGFUSE_BASE_URL;
  }

  return { ...DEFAULT_ENV, ...env };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    input: options.input,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
}

function runOptional(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    input: options.input,
  });

  return result.status === 0;
}

function assertRequiredEnv(env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required demo env values in .env: ${missing.join(", ")}`,
    );
  }
}

function deployableEnv(env) {
  const keys = [...new Set([...REQUIRED_ENV_KEYS, ...OPTIONAL_ENV_KEYS])].sort();

  return keys.flatMap((key) => {
    const value = env[key];

    return value ? [[key, value]] : [];
  });
}

function syncVercelEnv(env, environment) {
  for (const [key, value] of deployableEnv(env)) {
    runOptional("npx", ["vercel", "env", "rm", key, environment, "--yes"]);
    run("npx", ["vercel", "env", "add", key, environment], {
      input: `${value}\n`,
    });
  }
}

function deploy(environment) {
  const args = ["vercel", "--yes"];

  if (environment === "production") {
    args.push("--prod");
  }

  run("npx", args);
}

function ensureVercelProjectLinked() {
  if (existsSync(vercelProjectPath)) {
    return;
  }

  run("npx", ["vercel", "link", "--yes"]);
}

function main() {
  const args = parseArgs(process.argv);
  const env = parseEnvFile(envPath);

  assertRequiredEnv(env);

  if (args.dryRun) {
    const keys = deployableEnv(env).map(([key]) => key);

    console.log(
      JSON.stringify(
        {
          environment: args.environment,
          envKeys: keys,
          envPath,
          skipDeploy: args.skipDeploy,
          skipEnv: args.skipEnv,
        },
        null,
        2,
      ),
    );
    return;
  }

  ensureVercelProjectLinked();

  if (!args.skipEnv) {
    syncVercelEnv(env, args.environment);
  }

  if (!args.skipDeploy) {
    deploy(args.environment);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
