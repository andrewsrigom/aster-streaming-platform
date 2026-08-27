import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import typescript from "typescript";

const APPROVED_WORKSPACE_ROOTS = ["apps", "packages", "services", "workers"] as const;
const APPROVED_WORKSPACE_ROOT_SET = new Set<string>(APPROVED_WORKSPACE_ROOTS);
const SOURCE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const LAYERS = new Set(["application", "domain", "infrastructure", "ports", "transport"]);
const FORBIDDEN_EXTERNAL_EXACT = new Set([
  "drizzle-orm",
  "express",
  "fastify",
  "graphql-yoga",
  "ioredis",
  "kafkajs",
  "knex",
  "next",
  "pg",
  "pino",
  "postgres",
  "prisma",
  "react",
  "redis",
]);
const FORBIDDEN_EXTERNAL_PREFIXES = ["@apollo/", "@opentelemetry/", "@prisma/", "@redis/"];
const MAX_FILES = 10_000;
const MAX_FILE_BYTES = 1_000_000;
const MAX_IMPORTS_PER_FILE = 1_000;
const MAX_DIRECTORY_DEPTH = 16;
const WORKSPACE_OUTPUTS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "test-results",
  "playwright-report",
]);

const currentFile = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = resolve(dirname(currentFile), "..");

export type ArchitectureLayer = "application" | "domain" | "infrastructure" | "ports" | "transport";

export interface ArchitectureViolation {
  file: string;
  layer: ArchitectureLayer;
  rule: "forbidden-external" | "layer-direction" | "package-escape";
  specifier: string;
  detail: string;
}

export interface SourceAnalysisInput {
  filePath: string;
  repositoryRoot: string;
  sourceText: string;
}

function pathSegments(path: string): string[] {
  return path.split(sep).filter(Boolean);
}

function architectureLayer(path: string): ArchitectureLayer | undefined {
  for (const segment of pathSegments(path)) {
    if (LAYERS.has(segment)) {
      return segment as ArchitectureLayer;
    }
  }
  return undefined;
}

function workspacePackageRoot(repositoryRoot: string, filePath: string): string | undefined {
  const [workspaceRoot, packageName] = pathSegments(relative(repositoryRoot, filePath));
  if (!workspaceRoot || !packageName || !APPROVED_WORKSPACE_ROOT_SET.has(workspaceRoot)) {
    return undefined;
  }
  return resolve(repositoryRoot, workspaceRoot, packageName);
}

function escapesRoot(root: string, target: string): boolean {
  const relativeTarget = relative(root, target);
  return (
    relativeTarget === ".." || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)
  );
}

function isForbiddenExternal(specifier: string): boolean {
  const packageName = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : (specifier.split("/")[0] ?? specifier);
  return (
    FORBIDDEN_EXTERNAL_EXACT.has(packageName) ||
    FORBIDDEN_EXTERNAL_PREFIXES.some((prefix) => specifier.startsWith(prefix))
  );
}

function collectModuleSpecifiers(sourceText: string, filePath: string): string[] {
  const scriptKind = filePath.endsWith("x") ? typescript.ScriptKind.TSX : typescript.ScriptKind.TS;
  const sourceFile = typescript.createSourceFile(
    filePath,
    sourceText,
    typescript.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const diagnostics = (
    sourceFile as typescript.SourceFile & {
      parseDiagnostics: readonly typescript.Diagnostic[];
    }
  ).parseDiagnostics;
  if (diagnostics.length > 0) {
    const first = diagnostics[0];
    const message = first
      ? typescript.flattenDiagnosticMessageText(first.messageText, " ")
      : "unknown syntax error";
    throw new SyntaxError(`${filePath}: ${message}`);
  }

  const specifiers = new Set<string>();
  const addStringLiteral = (node: typescript.Node | undefined): void => {
    if (node && typescript.isStringLiteralLike(node)) {
      specifiers.add(node.text);
    }
  };
  const visit = (node: typescript.Node): void => {
    if (typescript.isImportDeclaration(node) || typescript.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (
      typescript.isCallExpression(node) &&
      node.arguments.length === 1 &&
      (node.expression.kind === typescript.SyntaxKind.ImportKeyword ||
        (typescript.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      addStringLiteral(node.arguments[0]);
    } else if (typescript.isImportTypeNode(node) && typescript.isLiteralTypeNode(node.argument)) {
      addStringLiteral(node.argument.literal);
    }
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (specifiers.size > MAX_IMPORTS_PER_FILE) {
    throw new Error(`${filePath}: import count exceeds ${MAX_IMPORTS_PER_FILE}`);
  }
  return [...specifiers].sort();
}

export function analyzeSource({
  filePath,
  repositoryRoot,
  sourceText,
}: SourceAnalysisInput): ArchitectureViolation[] {
  const layer = architectureLayer(filePath);
  const packageRoot = workspacePackageRoot(repositoryRoot, filePath);
  if (!layer || !packageRoot) {
    return [];
  }

  const violations: ArchitectureViolation[] = [];
  for (const specifier of collectModuleSpecifiers(sourceText, filePath)) {
    const isRelative =
      specifier === "." ||
      specifier === ".." ||
      specifier.startsWith("./") ||
      specifier.startsWith("../");
    if (!isRelative) {
      if (["application", "domain", "ports"].includes(layer) && isForbiddenExternal(specifier)) {
        violations.push({
          file: relative(repositoryRoot, filePath),
          layer,
          rule: "forbidden-external",
          specifier,
          detail: `${layer} cannot import infrastructure or framework package ${specifier}`,
        });
      }
      continue;
    }

    const target = resolve(dirname(filePath), specifier);
    if (escapesRoot(packageRoot, target)) {
      violations.push({
        file: relative(repositoryRoot, filePath),
        layer,
        rule: "package-escape",
        specifier,
        detail: "relative imports must remain inside the workspace package",
      });
      continue;
    }

    const targetLayer = architectureLayer(target);
    const forbiddenTarget =
      (layer === "domain" && targetLayer && targetLayer !== "domain") ||
      ((layer === "application" || layer === "ports") &&
        (targetLayer === "infrastructure" || targetLayer === "transport"));
    if (forbiddenTarget) {
      violations.push({
        file: relative(repositoryRoot, filePath),
        layer,
        rule: "layer-direction",
        specifier,
        detail: `${layer} cannot depend on ${targetLayer}`,
      });
    }
  }
  return violations;
}

async function collectSourceFiles(repositoryRoot: string): Promise<string[]> {
  const files: string[] = [];

  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_DIRECTORY_DEPTH) {
      throw new Error(`source directory depth exceeds ${MAX_DIRECTORY_DEPTH}: ${directory}`);
    }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth === 1 && WORKSPACE_OUTPUTS.has(entry.name)) {
          continue;
        }
        await walk(path, depth + 1);
      } else if (
        entry.isFile() &&
        SOURCE_EXTENSIONS.has(extname(entry.name)) &&
        !entry.name.endsWith(".d.ts")
      ) {
        files.push(path);
        if (files.length > MAX_FILES) {
          throw new Error(`source file count exceeds ${MAX_FILES}`);
        }
      }
    }
  };

  for (const workspaceRoot of APPROVED_WORKSPACE_ROOTS) {
    const rootPath = resolve(repositoryRoot, workspaceRoot);
    let packageEntries;
    try {
      packageEntries = await readdir(rootPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }
    for (const entry of packageEntries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        await walk(resolve(rootPath, entry.name), 1);
      }
    }
  }
  return files.sort();
}

export async function scanRepository(
  repositoryRoot = defaultRepositoryRoot,
): Promise<ArchitectureViolation[]> {
  const violations: ArchitectureViolation[] = [];
  for (const filePath of await collectSourceFiles(repositoryRoot)) {
    const metadata = await stat(filePath);
    if (metadata.size > MAX_FILE_BYTES) {
      throw new Error(`${relative(repositoryRoot, filePath)} exceeds ${MAX_FILE_BYTES} bytes`);
    }
    violations.push(
      ...analyzeSource({
        filePath,
        repositoryRoot,
        sourceText: await readFile(filePath, "utf8"),
      }),
    );
  }
  return violations.sort((left, right) =>
    `${left.file}:${left.specifier}:${left.rule}`.localeCompare(
      `${right.file}:${right.specifier}:${right.rule}`,
    ),
  );
}

export async function runArchitectureCheck(
  repositoryRoot = defaultRepositoryRoot,
): Promise<number> {
  try {
    const violations = await scanRepository(repositoryRoot);
    if (violations.length > 0) {
      console.error(
        JSON.stringify({ check: "architecture", status: "error", violations }, null, 2),
      );
      return 1;
    }
    console.log(JSON.stringify({ check: "architecture", status: "ok", violations: 0 }));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ check: "architecture", status: "error", errors: [message] }, null, 2),
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const requestedRoot = process.argv[2];
  process.exitCode = requestedRoot
    ? await runArchitectureCheck(resolve(requestedRoot))
    : await runArchitectureCheck();
}
