export type TelemetryMetadata = Record<string, string | number | boolean | null>;

const MAX_ATTRIBUTE_LENGTH = 200;

export function toTelemetryMetadata(
  metadata: TelemetryMetadata
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter((entry): entry is [string, string | number | boolean] => {
        return entry[1] !== null;
      })
      .map(([key, value]) => [key, String(value).slice(0, MAX_ATTRIBUTE_LENGTH)])
  );
}
