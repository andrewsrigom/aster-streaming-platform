export function elapsedSeconds(
  startNanoseconds: bigint,
  endNanoseconds: bigint,
): number | undefined {
  if (startNanoseconds < 0n || endNanoseconds < startNanoseconds) {
    return undefined;
  }
  const duration = Number(endNanoseconds - startNanoseconds) / 1_000_000_000;
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}
