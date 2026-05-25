export type HarnessSourceRunState = {
  completedSourceKeys: readonly string[];
  failedRunCountsBySourceKey?: Readonly<Record<string, number>>;
  runningSourceKeys: readonly string[];
};

export type HarnessSourcePartitionOptions = {
  maxFailedRuns?: number;
};

export function partitionSourcesByHarnessState<TSource extends { sourceKey: string }>(
  sources: readonly TSource[],
  state: HarnessSourceRunState,
  options: HarnessSourcePartitionOptions = {},
) {
  const completedSourceKeys = new Set(state.completedSourceKeys);
  const runningSourceKeys = new Set(state.runningSourceKeys);
  const maxFailedRuns = options.maxFailedRuns ?? Number.POSITIVE_INFINITY;
  const failedRunCount = (source: TSource) =>
    state.failedRunCountsBySourceKey?.[source.sourceKey] ?? 0;

  return {
    completedSources: sources.filter((source) =>
      completedSourceKeys.has(source.sourceKey),
    ),
    exhaustedSources: sources.filter(
      (source) =>
        !completedSourceKeys.has(source.sourceKey) &&
        !runningSourceKeys.has(source.sourceKey) &&
        failedRunCount(source) >= maxFailedRuns,
    ),
    runningSources: sources.filter((source) =>
      runningSourceKeys.has(source.sourceKey),
    ),
    sourcesToShape: sources.filter(
      (source) =>
        !completedSourceKeys.has(source.sourceKey) &&
        !runningSourceKeys.has(source.sourceKey) &&
        failedRunCount(source) < maxFailedRuns,
    ),
  };
}

export function maxAutoHarnessFailedRuns() {
  const configuredRetries = Number.parseInt(
    process.env.HARNESS_AUTO_MAX_RETRIES ?? "",
    10,
  );
  const maxRetries =
    Number.isFinite(configuredRetries) && configuredRetries >= 0
      ? configuredRetries
      : 2;

  return maxRetries + 1;
}
