const MINIMUM_DATE_EPOCH_MILLISECONDS = -8_640_000_000_000_000;
const MAXIMUM_DATE_EPOCH_MILLISECONDS = 8_640_000_000_000_000;

export type AsterClockConfigurationIssue = Readonly<{
  option: "epochMilliseconds";
  reason: "invalid";
}>;

export interface AsterClock {
  now(): Date;
}

export class AsterClockConfigurationError extends Error {
  readonly issues: readonly AsterClockConfigurationIssue[];

  constructor() {
    super("Invalid Aster clock configuration.");
    this.name = "AsterClockConfigurationError";
    this.issues = Object.freeze([{ option: "epochMilliseconds", reason: "invalid" }]);
  }
}

function isValidEpochMilliseconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= MINIMUM_DATE_EPOCH_MILLISECONDS &&
    value <= MAXIMUM_DATE_EPOCH_MILLISECONDS
  );
}

export function createAsterSystemClock(): AsterClock {
  return Object.freeze({
    now(): Date {
      return new Date();
    },
  });
}

export function createAsterFixedClock(epochMilliseconds: number): AsterClock {
  if (!isValidEpochMilliseconds(epochMilliseconds)) {
    throw new AsterClockConfigurationError();
  }

  return Object.freeze({
    now(): Date {
      return new Date(epochMilliseconds);
    },
  });
}
