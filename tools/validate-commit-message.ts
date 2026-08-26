import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ALLOWED_TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "experiment",
  "feat",
  "fix",
  "perf",
  "refactor",
  "test",
] as const;
const AUTOSQUASH_PREFIXES = ["amend! ", "fixup! ", "squash! "] as const;
const MAX_MESSAGE_BYTES = 16_384;
const MAX_SUBJECT_CHARACTERS = 72;
const SUBJECT_PATTERN = new RegExp(
  `^(?:${ALLOWED_TYPES.join("|")})(?:\\([a-z0-9][a-z0-9-]{0,30}\\))?!?: [\\p{Ll}\\p{Nd}][^\\r\\n]*$`,
  "u",
);

const currentFile = fileURLToPath(import.meta.url);

export function extractCommitSubject(message: string): string | undefined {
  if (message.includes("\0")) {
    return undefined;
  }
  for (const line of message.split(/\r?\n/u)) {
    const value = line.trimEnd();
    if (value.trim().length > 0 && !value.trimStart().startsWith("#")) {
      return value;
    }
  }
  return undefined;
}

function withoutAutosquashPrefix(subject: string): string {
  for (const prefix of AUTOSQUASH_PREFIXES) {
    if (subject.startsWith(prefix)) {
      return subject.slice(prefix.length);
    }
  }
  return subject;
}

export function validateCommitSubject(subject: string): string[] {
  const errors: string[] = [];
  if (subject.trim() !== subject) {
    errors.push("subject must not start or end with whitespace");
  }
  const conventionalSubject = withoutAutosquashPrefix(subject);
  if (conventionalSubject.length > MAX_SUBJECT_CHARACTERS) {
    errors.push(`subject must contain at most ${MAX_SUBJECT_CHARACTERS} characters`);
  }
  if (!SUBJECT_PATTERN.test(conventionalSubject)) {
    errors.push(
      "subject must match <type>(<scope>): <lowercase imperative outcome> using an allowed type",
    );
  }
  return errors;
}

export function validateCommitMessage(message: string): string[] {
  if (Buffer.byteLength(message, "utf8") > MAX_MESSAGE_BYTES) {
    return [`commit message must contain at most ${MAX_MESSAGE_BYTES} bytes`];
  }
  if (message.includes("\0")) {
    return ["commit message must not contain null bytes"];
  }
  const subject = extractCommitSubject(message);
  return subject ? validateCommitSubject(subject) : ["commit message has no subject"];
}

export async function runCommitMessageCheck(messageFile: string | undefined): Promise<number> {
  if (!messageFile) {
    console.error("usage: node tools/validate-commit-message.ts <commit-message-file>");
    return 2;
  }
  try {
    const metadata = await stat(messageFile);
    if (!metadata.isFile() || metadata.size > MAX_MESSAGE_BYTES) {
      console.error(
        `commit message file must be a regular file of at most ${MAX_MESSAGE_BYTES} bytes`,
      );
      return 1;
    }
    const errors = validateCommitMessage(await readFile(messageFile, "utf8"));
    if (errors.length > 0) {
      console.error("Invalid commit message:");
      for (const error of errors) {
        console.error(`- ${error}`);
      }
      return 1;
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`unable to validate commit message: ${message}`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === pathToFileURL(currentFile).href) {
  process.exitCode = await runCommitMessageCheck(process.argv[2]);
}
