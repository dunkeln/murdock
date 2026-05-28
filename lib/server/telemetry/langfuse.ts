import "server-only";

import {
  type LangfuseGenerationAttributes,
  propagateAttributes,
  startActiveObservation,
  updateActiveObservation,
} from "@langfuse/tracing";

import {
  type TelemetryMetadata,
  toTelemetryMetadata,
} from "@/lib/telemetry";

type ObserveOptions<TOutput> = {
  input?: unknown;
  metadata?: TelemetryMetadata;
  name: string;
  output?: (value: TOutput) => unknown;
};

type GenerationOptions<TOutput> = ObserveOptions<TOutput> & {
  generation?: (value: TOutput) => LangfuseGenerationAttributes;
};

type TraceOptions<TOutput> = ObserveOptions<TOutput> & {
  sessionId?: string;
  tags?: string[];
  userId?: string;
};

export async function withLangfuseTrace<TOutput>(
  options: TraceOptions<TOutput>,
  fn: () => Promise<TOutput>
): Promise<TOutput> {
  return propagateAttributes(
    {
      traceName: options.name,
      userId: options.userId,
      sessionId: options.sessionId,
      tags: options.tags,
      metadata: options.metadata
        ? toTelemetryMetadata(options.metadata)
        : undefined,
    },
    () => withLangfuseObservation(options, fn)
  );
}

export async function withLangfuseObservation<TOutput>(
  options: ObserveOptions<TOutput>,
  fn: () => Promise<TOutput>
): Promise<TOutput> {
  return startActiveObservation(
    options.name,
    async () => {
      updateActiveObservation({
        input: options.input,
        metadata: options.metadata,
      });

      try {
        const output = await fn();

        updateActiveObservation({
          output: options.output ? options.output(output) : undefined,
        });

        return output;
      } catch (error) {
        updateActiveObservation({
          level: "ERROR",
          statusMessage:
            error instanceof Error ? error.message : "Unexpected error",
        });

        throw error;
      }
    },
    {
      asType: "span",
    }
  );
}

export async function withLangfuseGeneration<TOutput>(
  options: GenerationOptions<TOutput>,
  fn: () => Promise<TOutput>
): Promise<TOutput> {
  return startActiveObservation(
    options.name,
    async () => {
      updateActiveObservation({
        input: options.input,
        metadata: options.metadata,
      });

      try {
        const output = await fn();

        updateActiveObservation({
          ...(options.generation ? options.generation(output) : {}),
          output: options.output ? options.output(output) : undefined,
        });

        return output;
      } catch (error) {
        updateActiveObservation({
          level: "ERROR",
          statusMessage:
            error instanceof Error ? error.message : "Unexpected error",
        });

        throw error;
      }
    },
    {
      asType: "generation",
    }
  );
}
