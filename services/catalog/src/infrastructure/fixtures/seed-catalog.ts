import type { createCatalogCommands } from "../../application/commands.js";
import type {
  CatalogCommandRequest,
  CatalogWorkflowUnitOfWork,
} from "../../application/operator-ports.js";
import type { ValidatedPublicationReference } from "../../domain/title.js";
import type { StoredCatalogTitle } from "../../application/rights-ports.js";
import { generatedSeed, type GeneratedSeedMode } from "./generated-seed.js";

export async function seedGeneratedCatalog(input: {
  report: unknown;
  mode?: GeneratedSeedMode;
  commands: ReturnType<typeof createCatalogCommands>;
  transactions: CatalogWorkflowUnitOfWork;
  request: CatalogCommandRequest;
  attest: (publication: ValidatedPublicationReference, signal: AbortSignal) => Promise<void>;
  now: () => number;
}): Promise<Readonly<{ titleId: string; state: "PUBLISHED"; changed: boolean }>> {
  const seed = generatedSeed(input.report, input.mode);
  const { checksum, metadata, rights } = seed;
  const attest = () =>
    input.attest(
      {
        id: seed.publicationId,
        titleId: seed.titleId,
        rightsRevision: 2,
        sourceChecksum: checksum,
        manifestUrl: seed.manifest,
        validationReportId: seed.reportId,
        validatedAt: input.now(),
      },
      input.request.signal,
    );
  const authorized = await input.commands.inspect({ titleId: seed.titleId }, input.request);
  if (authorized.status !== "completed" && authorized.status !== "not_found") {
    throw new Error("UI seed authorization was rejected.");
  }
  const inspect = () =>
    input.transactions.run<StoredCatalogTitle | undefined>(async (tx) => {
      const title = await tx.lockTitle(seed.titleId);
      if (!title) {
        return { status: "completed", value: undefined };
      }
      const currentMetadata = await tx.findMetadata(title.id);
      const revision = await tx.findRights(title.id, null);
      const publication =
        title.version >= 4 ? await tx.findPublication(seed.publicationId) : undefined;
      if (
        JSON.stringify(currentMetadata) !== JSON.stringify(metadata) ||
        !revision ||
        revision.actorId !== seed.actorId ||
        Object.entries(rights).some(
          ([key, value]) =>
            JSON.stringify(revision.record[key as keyof typeof revision.record]) !==
            JSON.stringify(value),
        ) ||
        ![2, 3, 4, 5].includes(title.version) ||
        title.state !==
          ({ 2: "DRAFT", 3: "RIGHTS_REVIEWED", 4: "MEDIA_READY", 5: "PUBLISHED" } as const)[
            title.version as 2 | 3 | 4 | 5
          ] ||
        revision.record.revision !== (title.version === 2 ? 1 : 2) ||
        revision.record.status !== (title.version === 2 ? "DRAFT" : "APPROVED") ||
        (title.version >= 4 &&
          (title.publicationId !== seed.publicationId ||
            !publication ||
            publication.titleId !== title.id ||
            publication.sourceChecksum !== checksum ||
            publication.rightsRevision !== 2 ||
            publication.manifestUrl !== seed.manifest ||
            publication.validationReportId !== seed.reportId))
      ) {
        return { status: "conflict" };
      }
      return { status: "completed", value: title };
    }, input.request.signal);

  let current = await inspect();
  if (current.status !== "completed") {
    throw new Error("UI seed refused existing or unavailable Catalog state.");
  }
  if (current.value?.state === "PUBLISHED") {
    if (seed.mode === "playable") {
      await attest();
    }
    return { titleId: seed.titleId, state: "PUBLISHED", changed: false };
  }
  const commandInput = (version: number) => ({
    titleId: seed.titleId,
    expectedVersion: version,
    mutationId: `${seed.mutationPrefix}${version}`,
  });
  if (!current.value) {
    const result = await input.commands.execute(
      "create",
      {
        ...commandInput(0),
        metadata,
        rights,
      },
      input.request,
    );
    if (result.status !== "completed") {
      throw new Error("UI seed creation was not completed.");
    }
  }
  current = await inspect();
  if (current.status !== "completed" || !current.value) {
    throw new Error("UI seed cannot resume this Catalog state.");
  }
  let version = current.value.version;
  if (seed.mode === "playable" && version === 4) {
    await attest();
  }
  if (version === 2) {
    const reviewed = await input.commands.execute(
      "review",
      {
        ...commandInput(2),
        decision: "approve",
        reason: "Source-owned synthetic technical fixture under ADR-0016; not film approval.",
      },
      input.request,
    );
    if (reviewed.status !== "completed") {
      throw new Error("UI seed rights review was not completed.");
    }
    version = reviewed.value.version;
  }
  if (version === 3) {
    await attest();
    const ready = await input.commands.execute(
      "media-ready",
      {
        ...commandInput(3),
        publicationId: seed.publicationId,
      },
      input.request,
    );
    if (ready.status !== "completed") {
      throw new Error("UI seed technical validation was not accepted.");
    }
    version = ready.value.version;
  }
  if (version === 4) {
    const published = await input.commands.execute("publish", commandInput(4), input.request);
    if (published.status !== "completed") {
      throw new Error("UI seed publication was not completed.");
    }
  }
  const completed = await inspect();
  if (completed.status !== "completed" || completed.value?.state !== "PUBLISHED") {
    throw new Error("UI seed publication could not be confirmed.");
  }
  return { titleId: seed.titleId, state: "PUBLISHED", changed: true };
}
