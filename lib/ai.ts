import { z } from "zod";

export const messageRoleSchema = z.enum(["user", "assistant"]);

export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageSchema = z.object({
  role: messageRoleSchema,
  content: z.string().min(1),
});

export type Message = z.infer<typeof messageSchema>;

export const modelUseSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const providerIdSchema = z.string().min(1);

export const schemaNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Expected a provider-safe schema name using letters, numbers, underscores, or hyphens.",
  );

export const providerConfigSchema = z.object({
  id: providerIdSchema,
  hasKey: z.boolean(),
  model: z.string().min(1).nullable(),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const selectModelInputSchema = z.object({
  use: modelUseSchema.default("harness-extract"),
  preferredProvider: providerIdSchema.nullable().default(null),
});

export type SelectModelInput = z.input<typeof selectModelInputSchema>;

export const modelRouteSchema = z.object({
  provider: providerIdSchema,
  model: z.string().min(1).nullable(),
  use: modelUseSchema,
});

export type ModelRoute = z.infer<typeof modelRouteSchema>;

export const modelRouteErrorSchema = z.object({
  isError: z.literal(true),
  errorCategory: z.enum(["configuration", "unavailable"]),
  isRetryable: z.boolean(),
  message: z.string().min(1),
});

export type ModelRouteError = z.infer<typeof modelRouteErrorSchema>;

export const modelErrorSchema = z.object({
  isError: z.literal(true),
  errorCategory: z.enum([
    "configuration",
    "provider_unavailable",
    "rate_limit",
    "timeout",
    "refusal",
    "schema_validation",
    "unknown",
  ]),
  isRetryable: z.boolean(),
  message: z.string().min(1),
  provider: providerIdSchema.nullable(),
});

export type ModelError = z.infer<typeof modelErrorSchema>;

export type SelectModelResult =
  | {
      ok: true;
      route: ModelRoute;
    }
  | {
      error: ModelRouteError;
      ok: false;
    };

export type SelectModelRoutesResult =
  | {
      ok: true;
      routes: ModelRoute[];
    }
  | {
      error: ModelRouteError;
      ok: false;
    };

export type GenerateObjectResult<TData> =
  | {
      data: TData;
      model: string;
      ok: true;
      provider: string;
      usage: {
        inputTokens: number | null;
        outputTokens: number | null;
      };
    }
  | {
      error: ModelError;
      ok: false;
    };

export const modelRouteModeSchema = z.enum(["fallback", "single"]);

export type ModelRouteMode = z.infer<typeof modelRouteModeSchema>;

export function selectModelFromConfig(
  input: SelectModelInput,
  providers: ProviderConfig[],
): SelectModelResult {
  const routesResult = selectModelRoutesFromConfig(input, providers);

  if (!routesResult.ok) {
    return routesResult;
  }

  return {
    ok: true,
    route: routesResult.routes[0]!,
  };
}

export function selectModelRoutesFromConfig(
  input: SelectModelInput,
  providers: ProviderConfig[],
  mode: ModelRouteMode = "fallback",
): SelectModelRoutesResult {
  const parsedInput = selectModelInputSchema.parse(input);
  const parsedMode = modelRouteModeSchema.parse(mode);
  const parsedProviders = z.array(providerConfigSchema).parse(providers);
  const availableProviders = parsedProviders.filter((provider) => {
    return provider.hasKey;
  });

  const preferredProvider = availableProviders.find((provider) => {
    return provider.id === parsedInput.preferredProvider;
  });
  const orderedProviders = [
    ...(preferredProvider ? [preferredProvider] : []),
    ...availableProviders.filter((provider) => {
      return provider.id !== preferredProvider?.id;
    }),
  ];

  if (orderedProviders.length === 0) {
    return {
      ok: false,
      error: modelRouteErrorSchema.parse({
        isError: true,
        errorCategory: "configuration",
        isRetryable: false,
        message: "No configured model provider is available.",
      }),
    };
  }

  const routeProviders =
    parsedMode === "single" ? orderedProviders.slice(0, 1) : orderedProviders;

  return {
    ok: true,
    routes: routeProviders.map((provider) => {
      return modelRouteSchema.parse({
        provider: provider.id,
        model: provider.model,
        use: parsedInput.use,
      });
    }),
  };
}
