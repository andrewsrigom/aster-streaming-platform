import { randomUUID } from "node:crypto";

const MAXIMUM_DETERMINISTIC_IDENTIFIERS = 1_024;
const MAXIMUM_IDENTIFIER_LENGTH = 128;
const SAFE_IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,127})$/u;

export type AsterIdentifierConfigurationIssue = Readonly<{
  option: "identifiers";
  reason: "invalid";
}>;

export interface AsterIdentifierGenerator {
  generate(): string;
}

export class AsterIdentifierConfigurationError extends Error {
  readonly issues: readonly AsterIdentifierConfigurationIssue[];

  constructor() {
    super("Invalid Aster identifier configuration.");
    this.name = "AsterIdentifierConfigurationError";
    this.issues = Object.freeze([{ option: "identifiers", reason: "invalid" }]);
  }
}

export class AsterIdentifierExhaustedError extends Error {
  constructor() {
    super("The deterministic Aster identifier sequence is exhausted.");
    this.name = "AsterIdentifierExhaustedError";
  }
}

function copyValidIdentifiers(input: unknown): readonly string[] | undefined {
  try {
    if (!Array.isArray(input)) {
      return undefined;
    }

    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
    const length: unknown = lengthDescriptor?.value;
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > MAXIMUM_DETERMINISTIC_IDENTIFIERS
    ) {
      return undefined;
    }

    const identifiers: string[] = [];
    const uniqueIdentifiers = new Set<string>();
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      const identifier: unknown = descriptor?.value;
      if (
        !descriptor ||
        "get" in descriptor ||
        typeof identifier !== "string" ||
        identifier.length > MAXIMUM_IDENTIFIER_LENGTH ||
        !SAFE_IDENTIFIER.test(identifier) ||
        uniqueIdentifiers.has(identifier)
      ) {
        return undefined;
      }
      identifiers.push(identifier);
      uniqueIdentifiers.add(identifier);
    }

    return Object.freeze(identifiers);
  } catch {
    return undefined;
  }
}

export function createAsterUuidGenerator(): AsterIdentifierGenerator {
  return Object.freeze({
    generate(): string {
      return randomUUID();
    },
  });
}

export function createAsterDeterministicIdentifierGenerator(
  identifiers: readonly string[],
): AsterIdentifierGenerator {
  const copiedIdentifiers = copyValidIdentifiers(identifiers);
  if (!copiedIdentifiers) {
    throw new AsterIdentifierConfigurationError();
  }

  let nextIndex = 0;
  return Object.freeze({
    generate(): string {
      const identifier = copiedIdentifiers[nextIndex];
      if (identifier === undefined) {
        throw new AsterIdentifierExhaustedError();
      }
      nextIndex += 1;
      return identifier;
    },
  });
}
