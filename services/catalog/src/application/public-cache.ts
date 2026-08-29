import { normalizeTitleMetadata } from "../domain/metadata.js";
import { projectPublicTitle, type PublicCatalogTitle } from "../domain/public-title.js";
import { normalizePublication, normalizeTitleLifecycle } from "../domain/title.js";
import {
  catalogIdentifier,
  catalogMediaUrl,
  catalogRecord,
  catalogText,
  catalogTimestamp,
  catalogUrl,
  catalogVersion,
} from "../domain/values.js";
import type {
  CatalogCacheObservation,
  CatalogPublicCacheStore,
  CatalogPublicEntityReader,
  CatalogPublicEntitySource,
  CatalogPublicFence,
  CatalogReadScope,
} from "./public-ports.js";
import type { CatalogStoreResult } from "./rights-ports.js";

export const CATALOG_PUBLIC_CACHE_POLICY = Object.freeze({
  positiveTtlMs: 120_000,
  positiveJitterMs: 30_000,
  negativeTtlMs: 5_000,
  negativeJitterMs: 5_000,
  leaseTtlMs: 2_000,
  leaseWaitMs: 25,
  sharedWorkTimeoutMs: 2_000,
  maximumValueBytes: 16_384,
  maximumCoalescingEntries: 128,
} as const);

const ENVIRONMENTS = new Set(["local", "test", "development", "staging", "production"]);

type CacheOptions = Readonly<{
  environment: string;
  source: CatalogPublicEntitySource;
  cache: CatalogPublicCacheStore;
  digest: (value: string) => string;
  token: () => string;
  record?: (observation: CatalogCacheObservation) => void;
}>;

type SharedEntry = {
  readonly work: SharedWork;
  promise: Promise<CatalogStoreResult<PublicCatalogTitle | null>>;
  waiters: number;
};

type SharedFenceEntry = {
  readonly work: SharedWork;
  promise: Promise<CatalogStoreResult<CatalogPublicFence | null>>;
  waiters: number;
};

type SharedWork = {
  readonly controller: AbortController;
  waiters: number;
  settled: boolean;
};

type LoadedProjection = Readonly<{
  titles: readonly PublicCatalogTitle[];
  missing: readonly CatalogPublicFence[];
}>;

function digest(input: CacheOptions, value: string): string {
  const result = input.digest(value);
  if (!/^[a-f0-9]{64}$/u.test(result)) {
    throw new Error("Invalid Catalog cache digest.");
  }
  return result;
}

function jitter(input: CacheOptions, key: string, maximumMs: number): number {
  return Number.parseInt(digest(input, key).slice(0, 8), 16) % (maximumMs + 1);
}

function positiveKey(environment: string, fence: CatalogPublicFence): string {
  return `aster:${environment}:catalog:public-title:v1:${fence.id}:${String(fence.titleVersion)}:${String(fence.rightsRevision)}:${fence.publicationId}`;
}

function negativeKey(environment: string, id: string): string {
  return `aster:${environment}:catalog:public-title-absent:v1:${id}`;
}

function fenceCoalescingIdentity(input: CacheOptions, id: string, scope: CatalogReadScope): string {
  return digest(
    input,
    `${negativeKey(input.environment, id)}:${String(scope.now)}:${scope.policy.commercial ? "commercial" : "noncommercial"}:${scope.policy.allowLocalMedia === true ? "local" : "remote"}`,
  );
}

function leaseKey(input: CacheOptions, key: string): string {
  return `aster:${input.environment}:catalog:public-title-lease:v1:${digest(input, key)}`;
}

function sameFence(left: CatalogPublicFence, right: CatalogPublicFence): boolean {
  return (
    left.id === right.id &&
    left.titleVersion === right.titleVersion &&
    left.rightsRevision === right.rightsRevision &&
    left.publicationId === right.publicationId
  );
}

function validFence(value: CatalogPublicFence): boolean {
  return (
    catalogIdentifier(value.id) &&
    catalogVersion(value.titleVersion) &&
    catalogVersion(value.rightsRevision) &&
    catalogIdentifier(value.publicationId)
  );
}

function attribution(value: unknown): PublicCatalogTitle["attribution"] | undefined {
  const input = catalogRecord(value, [
    "workTitle",
    "creator",
    "copyrightHolder",
    "sourceUrl",
    "licenseName",
    "licenseVersion",
    "licenseUrl",
    "attributionText",
    "modificationNotice",
  ]);
  if (
    !input ||
    !catalogText(input["workTitle"], 1_024) ||
    !catalogText(input["creator"], 1_024) ||
    !catalogText(input["copyrightHolder"], 1_024) ||
    !catalogUrl(input["sourceUrl"]) ||
    !catalogText(input["licenseName"], 1_024) ||
    !catalogText(input["licenseVersion"], 32) ||
    !catalogUrl(input["licenseUrl"]) ||
    !catalogText(input["attributionText"], 1_024) ||
    !catalogText(input["modificationNotice"], 1_024)
  ) {
    return undefined;
  }
  return Object.freeze({
    workTitle: input["workTitle"],
    creator: input["creator"],
    copyrightHolder: input["copyrightHolder"],
    sourceUrl: input["sourceUrl"],
    licenseName: input["licenseName"],
    licenseVersion: input["licenseVersion"],
    licenseUrl: input["licenseUrl"],
    attributionText: input["attributionText"],
    modificationNotice: input["modificationNotice"],
  });
}

function cachedTitle(value: unknown, expectedId: string): PublicCatalogTitle | undefined {
  const input = catalogRecord(value, [
    "id",
    "defaultLocale",
    "localizations",
    "releaseYear",
    "runtimeSeconds",
    "languages",
    "accessibility",
    "editorialLabels",
    "genres",
    "credits",
    "artwork",
    "attribution",
  ]);
  if (!input || input["id"] !== expectedId || !catalogIdentifier(input["id"])) {
    return undefined;
  }
  const metadata = normalizeTitleMetadata({
    defaultLocale: input["defaultLocale"],
    localizations: input["localizations"],
    releaseYear: input["releaseYear"],
    runtimeSeconds: input["runtimeSeconds"],
    languages: input["languages"],
    accessibility: input["accessibility"],
    editorialLabels: input["editorialLabels"],
    genres: input["genres"],
    credits: input["credits"],
    artwork: null,
  });
  const credit = attribution(input["attribution"]);
  if (!metadata || !credit) {
    return undefined;
  }
  let artwork: PublicCatalogTitle["artwork"] = null;
  if (input["artwork"] !== null) {
    const item = catalogRecord(input["artwork"], ["url", "altText", "attribution"]);
    const artworkCredit = attribution(item?.["attribution"]);
    if (
      !item ||
      !catalogMediaUrl(item["url"], "artwork") ||
      !catalogText(item["altText"], 256) ||
      !artworkCredit
    ) {
      return undefined;
    }
    artwork = Object.freeze({
      url: item["url"],
      altText: item["altText"],
      attribution: artworkCredit,
    });
  }
  return Object.freeze({ ...metadata, id: input["id"], artwork, attribution: credit });
}

function parseEnvelope(
  value: string,
  expected: CatalogPublicFence,
  now: number,
): PublicCatalogTitle | undefined {
  if (Buffer.byteLength(value, "utf8") > CATALOG_PUBLIC_CACHE_POLICY.maximumValueBytes) {
    return undefined;
  }
  try {
    const input = catalogRecord(JSON.parse(value) as unknown, [
      "schema",
      "kind",
      "fence",
      "cachedAt",
      "title",
    ]);
    const rawFence = catalogRecord(input?.["fence"], [
      "id",
      "titleVersion",
      "rightsRevision",
      "publicationId",
    ]);
    if (
      !input ||
      input["schema"] !== 1 ||
      input["kind"] !== "present" ||
      !rawFence ||
      !catalogIdentifier(rawFence["id"]) ||
      !catalogVersion(rawFence["titleVersion"]) ||
      !catalogVersion(rawFence["rightsRevision"]) ||
      !catalogIdentifier(rawFence["publicationId"]) ||
      !catalogTimestamp(input["cachedAt"]) ||
      input["cachedAt"] > now ||
      now - input["cachedAt"] > 180
    ) {
      return undefined;
    }
    const found = Object.freeze({
      id: rawFence["id"],
      titleVersion: rawFence["titleVersion"],
      rightsRevision: rawFence["rightsRevision"],
      publicationId: rawFence["publicationId"],
    });
    return sameFence(found, expected) ? cachedTitle(input["title"], expected.id) : undefined;
  } catch {
    return undefined;
  }
}

function validNegativeEnvelope(value: string, now: number): boolean {
  if (Buffer.byteLength(value, "utf8") > CATALOG_PUBLIC_CACHE_POLICY.maximumValueBytes) {
    return false;
  }
  try {
    const input = catalogRecord(JSON.parse(value) as unknown, ["schema", "kind", "cachedAt"]);
    const cachedAt = input?.["cachedAt"];
    const maximumAgeSeconds = Math.ceil(
      (CATALOG_PUBLIC_CACHE_POLICY.negativeTtlMs + CATALOG_PUBLIC_CACHE_POLICY.negativeJitterMs) /
        1_000,
    );
    return (
      input?.["schema"] === 1 &&
      input["kind"] === "absent" &&
      catalogTimestamp(cachedAt) &&
      cachedAt <= now &&
      now - cachedAt <= maximumAgeSeconds
    );
  } catch {
    return false;
  }
}

function fenceForCandidate(
  candidate: Parameters<typeof projectPublicTitle>[0],
): CatalogPublicFence | undefined {
  const title = normalizeTitleLifecycle(candidate.title);
  const publication = normalizePublication(candidate.publication, 253_402_300_799);
  if (
    !title ||
    !publication ||
    title.rightsRevision === null ||
    title.publicationId !== publication.id
  ) {
    return undefined;
  }
  return Object.freeze({
    id: title.id,
    titleVersion: title.version,
    rightsRevision: title.rightsRevision,
    publicationId: publication.id,
  });
}

function waitForDelay(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const finish = (completed: boolean): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(completed);
    };
    const onAbort = (): void => {
      finish(false);
    };
    const timer = setTimeout(() => {
      finish(true);
    }, ms);
    timer.unref();
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForCaller<T>(
  promise: Promise<CatalogStoreResult<T>>,
  signal: AbortSignal,
): Promise<CatalogStoreResult<T>> {
  if (signal.aborted) {
    return Promise.resolve({ status: "cancelled" });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CatalogStoreResult<T>): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => {
      finish({ status: "cancelled" });
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (result) => {
        finish(result);
      },
      () => {
        finish({ status: "unavailable" });
      },
    );
  });
}

export function createCachedCatalogPublicEntities(input: CacheOptions): CatalogPublicEntityReader {
  if (!ENVIRONMENTS.has(input.environment)) {
    throw new Error("Invalid Catalog cache environment.");
  }
  const makeToken = input.token;
  const entries = new Map<string, SharedEntry>();
  const fenceEntries = new Map<string, SharedFenceEntry>();

  const record = (observation: CatalogCacheObservation): void => {
    try {
      input.record?.(observation);
    } catch {
      // Measurements cannot change Catalog correctness.
    }
  };

  const timed = async <T>(
    outcome: CatalogCacheObservation["outcome"],
    work: () => Promise<T>,
    details: Omit<CatalogCacheObservation, "outcome" | "durationMs"> = {},
  ): Promise<T> => {
    const started = performance.now();
    try {
      return await work();
    } finally {
      record({ ...details, outcome, durationMs: Math.max(0, performance.now() - started) });
    }
  };

  const deleteMalformed = async (key: string, signal: AbortSignal): Promise<void> => {
    await input.cache.delete(key, signal);
  };

  const readNegative = async (
    id: string,
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<Readonly<{ status: "hit" | "miss" | "cancelled" }>> => {
    const started = performance.now();
    const key = negativeKey(input.environment, id);
    const cached = await input.cache.read(key, signal);
    const durationMs = Math.max(0, performance.now() - started);
    if (cached.status === "cancelled") {
      return { status: "cancelled" };
    }
    if (cached.status === "malformed") {
      record({ outcome: "malformed", durationMs });
      await deleteMalformed(key, signal);
    } else if (cached.status === "bypass") {
      record({ outcome: "bypass", durationMs });
    } else if (cached.value !== null && validNegativeEnvelope(cached.value, scope.now)) {
      record({ outcome: "negative_hit", durationMs });
      return { status: "hit" };
    } else if (cached.value !== null) {
      const payloadBytes = Buffer.byteLength(cached.value);
      record({
        outcome: "malformed",
        durationMs,
        ...(payloadBytes <= CATALOG_PUBLIC_CACHE_POLICY.maximumValueBytes ? { payloadBytes } : {}),
      });
      await deleteMalformed(key, signal);
    }
    return { status: signal.aborted ? "cancelled" : "miss" };
  };

  const readPositive = async (
    fence: CatalogPublicFence,
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<
    | Readonly<{ status: "hit"; title: PublicCatalogTitle }>
    | Readonly<{ status: "miss" | "cancelled" }>
  > => {
    const started = performance.now();
    const duration = (): number => Math.max(0, performance.now() - started);
    const key = positiveKey(input.environment, fence);
    const result = await input.cache.read(key, signal);
    if (result.status === "cancelled") {
      return { status: "cancelled" };
    }
    if (result.status === "malformed") {
      record({ outcome: "malformed", durationMs: duration() });
      await deleteMalformed(key, signal);
      return { status: signal.aborted ? "cancelled" : "miss" };
    }
    if (result.status === "bypass") {
      record({ outcome: "bypass", durationMs: duration() });
      return { status: "miss" };
    }
    if (result.value === null) {
      record({ outcome: "miss", durationMs: duration() });
      return { status: "miss" };
    }
    const title = parseEnvelope(result.value, fence, scope.now);
    if (!title) {
      const payloadBytes = Buffer.byteLength(result.value);
      record({
        outcome: "malformed",
        durationMs: duration(),
        ...(payloadBytes <= CATALOG_PUBLIC_CACHE_POLICY.maximumValueBytes ? { payloadBytes } : {}),
      });
      await deleteMalformed(key, signal);
      return { status: signal.aborted ? "cancelled" : "miss" };
    }
    record({
      outcome: "hit",
      durationMs: duration(),
      payloadBytes: Buffer.byteLength(result.value),
    });
    return { status: "hit", title };
  };

  const writePositive = async (
    fence: CatalogPublicFence,
    title: PublicCatalogTitle,
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<void> => {
    const key = positiveKey(input.environment, fence);
    const value = JSON.stringify({ schema: 1, kind: "present", fence, cachedAt: scope.now, title });
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes > CATALOG_PUBLIC_CACHE_POLICY.maximumValueBytes) {
      // Payload metrics describe values admitted to the bounded cache. The bypass
      // outcome retains the rejected write without submitting an invalid sample.
      record({ outcome: "bypass", durationMs: 0 });
      return;
    }
    const result = await input.cache.write(
      key,
      value,
      CATALOG_PUBLIC_CACHE_POLICY.positiveTtlMs +
        jitter(input, key, CATALOG_PUBLIC_CACHE_POLICY.positiveJitterMs),
      "replace",
      signal,
    );
    if (result.status === "bypass") {
      record({ outcome: "bypass", durationMs: 0 });
    }
  };

  const writeNegative = async (
    id: string,
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<void> => {
    const key = negativeKey(input.environment, id);
    const result = await input.cache.write(
      key,
      JSON.stringify({ schema: 1, kind: "absent", cachedAt: scope.now }),
      CATALOG_PUBLIC_CACHE_POLICY.negativeTtlMs +
        jitter(input, key, CATALOG_PUBLIC_CACHE_POLICY.negativeJitterMs),
      "replace",
      signal,
    );
    if (result.status === "bypass") {
      record({ outcome: "bypass", durationMs: 0 });
    }
  };

  const refreshFences = async (
    ids: readonly string[],
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<readonly CatalogPublicFence[]>> => {
    const leases = await Promise.all(
      ids.map(async (id) => {
        const started = performance.now();
        const key = negativeKey(input.environment, id);
        const token = makeToken();
        if (!catalogIdentifier(token)) {
          return Object.freeze({ id, key, token: "", acquired: false, bypass: true });
        }
        const acquired = await input.cache.write(
          leaseKey(input, key),
          token,
          CATALOG_PUBLIC_CACHE_POLICY.leaseTtlMs,
          "if_absent",
          signal,
        );
        if (acquired.status !== "completed") {
          record({ outcome: "bypass", durationMs: Math.max(0, performance.now() - started) });
          return Object.freeze({ id, key, token, acquired: false, bypass: true });
        }
        record({
          outcome: acquired.value ? "lease_acquired" : "lease_contended",
          durationMs: Math.max(0, performance.now() - started),
        });
        return Object.freeze({ id, key, token, acquired: acquired.value, bypass: false });
      }),
    );
    const resolvedAbsent = new Set<string>();
    try {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      const contended = leases.filter((lease) => !lease.acquired && !lease.bypass);
      if (contended.length > 0) {
        if (!(await waitForDelay(CATALOG_PUBLIC_CACHE_POLICY.leaseWaitMs, signal))) {
          return { status: "cancelled" };
        }
        for (const lease of contended) {
          const cached = await readNegative(lease.id, scope, signal);
          if (cached.status === "cancelled") {
            return { status: "cancelled" };
          }
          if (cached.status === "hit") {
            resolvedAbsent.add(lease.id);
          }
        }
      }
      const pending = ids.filter((id) => !resolvedAbsent.has(id));
      if (pending.length === 0) {
        return { status: "completed", value: [] };
      }
      const fences = await input.source.findFences(pending, scope, signal);
      if (fences.status !== "completed") {
        return fences;
      }
      if (fences.value.length > pending.length) {
        return { status: "unavailable" };
      }
      const fenceById = new Map<string, CatalogPublicFence>();
      for (const fence of fences.value) {
        if (!validFence(fence) || !pending.includes(fence.id) || fenceById.has(fence.id)) {
          return { status: "unavailable" };
        }
        fenceById.set(fence.id, fence);
      }
      const absent = pending.filter((id) => !fenceById.has(id));
      for (let index = 0; index < absent.length; index += 1) {
        record({ outcome: "miss", durationMs: 0 });
      }
      await Promise.all(absent.map((id) => writeNegative(id, scope, signal)));
      return { status: "completed", value: Object.freeze([...fenceById.values()]) };
    } finally {
      await Promise.all(
        leases
          .filter((lease) => lease.acquired)
          .map(async (lease) => {
            const released = await input.cache.compareAndDelete(
              leaseKey(input, lease.key),
              lease.token,
              AbortSignal.timeout(250),
            );
            if (released.status !== "completed" || !released.value) {
              record({ outcome: "lease_lost", durationMs: 0 });
            }
          }),
      );
    }
  };

  const coalesceFences = async (
    ids: readonly string[],
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<readonly CatalogPublicFence[]>> => {
    const createdWork: SharedWork = {
      controller: new AbortController(),
      waiters: 0,
      settled: false,
    };
    const selected: SharedFenceEntry[] = [];
    const created: Array<{ identity: string; id: string; entry: SharedFenceEntry }> = [];
    const overflow: string[] = [];
    for (const id of ids) {
      const identity = fenceCoalescingIdentity(input, id, scope);
      const existing = fenceEntries.get(identity);
      if (existing) {
        const attachedCallers = existing.waiters;
        record({
          outcome: "coalesced",
          durationMs: 0,
          waiterBucket:
            attachedCallers === 1 ? "one" : attachedCallers <= 4 ? "two_to_four" : "five_plus",
        });
        selected.push(existing);
        continue;
      }
      if (
        entries.size + fenceEntries.size >=
        CATALOG_PUBLIC_CACHE_POLICY.maximumCoalescingEntries
      ) {
        overflow.push(id);
        continue;
      }
      const entry: SharedFenceEntry = {
        work: createdWork,
        waiters: 0,
        promise: Promise.resolve({ status: "unavailable" }),
      };
      fenceEntries.set(identity, entry);
      created.push({ identity, id, entry });
      selected.push(entry);
    }
    if (created.length > 0) {
      const workSignal = AbortSignal.any([
        createdWork.controller.signal,
        AbortSignal.timeout(CATALOG_PUBLIC_CACHE_POLICY.sharedWorkTimeoutMs),
      ]);
      const batch = refreshFences(
        created.map((value) => value.id),
        scope,
        workSignal,
      );
      for (const item of created) {
        item.entry.promise = batch
          .then((result): CatalogStoreResult<CatalogPublicFence | null> =>
            result.status === "completed"
              ? {
                  status: "completed",
                  value: result.value.find((fence) => fence.id === item.id) ?? null,
                }
              : result,
          )
          .finally(() => {
            fenceEntries.delete(item.identity);
          });
      }
      void batch.then(
        () => {
          createdWork.settled = true;
        },
        () => {
          createdWork.settled = true;
        },
      );
    }
    for (const entry of selected) {
      entry.waiters += 1;
      entry.work.waiters += 1;
    }
    try {
      const [shared, direct] = await Promise.all([
        Promise.all(selected.map((entry) => waitForCaller(entry.promise, signal))),
        overflow.length > 0
          ? refreshFences(overflow, scope, signal)
          : Promise.resolve({ status: "completed", value: [] } as const),
      ]);
      const fences: CatalogPublicFence[] = [];
      for (const result of shared) {
        if (result.status !== "completed") {
          return result;
        }
        if (result.value) {
          fences.push(result.value);
        }
      }
      if (direct.status !== "completed") {
        return direct;
      }
      fences.push(...direct.value);
      return { status: "completed", value: Object.freeze(fences) };
    } finally {
      for (const entry of selected) {
        entry.waiters -= 1;
        entry.work.waiters -= 1;
        if (entry.work.waiters === 0 && !entry.work.settled) {
          entry.work.controller.abort();
        }
      }
    }
  };

  const loadExact = async (
    fences: readonly CatalogPublicFence[],
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<LoadedProjection>> => {
    const loaded = await input.source.findManyAtFences(fences, scope, signal);
    if (loaded.status !== "completed") {
      return loaded;
    }
    if (loaded.value.length > fences.length) {
      return { status: "unavailable" };
    }
    const expected = new Map(fences.map((value) => [value.id, value]));
    const titles: PublicCatalogTitle[] = [];
    const found = new Set<string>();
    for (const candidate of loaded.value) {
      const candidateFence = fenceForCandidate(candidate);
      const expectedFence = candidateFence ? expected.get(candidateFence.id) : undefined;
      const title = projectPublicTitle(candidate, scope.now, scope.policy);
      if (
        !candidateFence ||
        !expectedFence ||
        !sameFence(candidateFence, expectedFence) ||
        !title ||
        found.has(title.id)
      ) {
        return { status: "unavailable" };
      }
      found.add(title.id);
      titles.push(title);
    }
    return {
      status: "completed",
      value: Object.freeze({
        titles: Object.freeze(titles),
        missing: Object.freeze(fences.filter((value) => !found.has(value.id))),
      }),
    };
  };

  const refresh = async (
    fences: readonly CatalogPublicFence[],
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<readonly PublicCatalogTitle[]>> => {
    const leases = await Promise.all(
      fences.map(async (fence) => {
        const started = performance.now();
        const key = positiveKey(input.environment, fence);
        const token = makeToken();
        if (!catalogIdentifier(token)) {
          return Object.freeze({ fence, key, token: "", acquired: false, bypass: true });
        }
        const acquired = await input.cache.write(
          leaseKey(input, key),
          token,
          CATALOG_PUBLIC_CACHE_POLICY.leaseTtlMs,
          "if_absent",
          signal,
        );
        if (acquired.status !== "completed") {
          record({ outcome: "bypass", durationMs: Math.max(0, performance.now() - started) });
          return Object.freeze({ fence, key, token, acquired: false, bypass: true });
        }
        record({
          outcome: acquired.value ? "lease_acquired" : "lease_contended",
          durationMs: Math.max(0, performance.now() - started),
        });
        return Object.freeze({ fence, key, token, acquired: acquired.value, bypass: false });
      }),
    );
    const titles = new Map<string, PublicCatalogTitle>();
    try {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      const contended = leases.filter((lease) => !lease.acquired && !lease.bypass);
      if (contended.length > 0) {
        if (!(await waitForDelay(CATALOG_PUBLIC_CACHE_POLICY.leaseWaitMs, signal))) {
          return { status: "cancelled" };
        }
        const cached = await Promise.all(
          contended.map(async (lease) => ({
            lease,
            hit: await readPositive(lease.fence, scope, signal),
          })),
        );
        for (const { hit } of cached) {
          if (hit.status === "cancelled") {
            return { status: "cancelled" };
          }
          if (hit.status === "hit") {
            titles.set(hit.title.id, hit.title);
          }
        }
      }

      const pending = fences.filter((fence) => !titles.has(fence.id));
      if (pending.length > 0) {
        const first = await timed("source_load", () => loadExact(pending, scope, signal));
        if (first.status !== "completed") {
          return first;
        }
        for (const title of first.value.titles) {
          titles.set(title.id, title);
        }
        await Promise.all(
          pending.map(async (fence) => {
            const title = first.value.titles.find((value) => value.id === fence.id);
            if (title) {
              await writePositive(fence, title, scope, signal);
            }
          }),
        );
        if (first.value.missing.length > 0) {
          record({ outcome: "fence_changed", durationMs: 0 });
          const ids = first.value.missing.map((value) => value.id);
          const current = await input.source.findFences(ids, scope, signal);
          if (current.status !== "completed") {
            return current;
          }
          if (
            current.value.length > ids.length ||
            current.value.some((value) => !ids.includes(value.id) || !validFence(value)) ||
            new Set(current.value.map((value) => value.id)).size !== current.value.length
          ) {
            return { status: "unavailable" };
          }
          const currentById = new Map(current.value.map((value) => [value.id, value]));
          const absent = ids.filter((id) => !currentById.has(id));
          await Promise.all(absent.map((id) => writeNegative(id, scope, signal)));
          if (current.value.length > 0) {
            const second = await timed("source_load", () =>
              loadExact(current.value, scope, signal),
            );
            if (second.status !== "completed") {
              return second;
            }
            for (const title of second.value.titles) {
              titles.set(title.id, title);
              const fence = currentById.get(title.id);
              if (fence) {
                await writePositive(fence, title, scope, signal);
              }
            }
          }
        }
      }
      return { status: "completed", value: Object.freeze([...titles.values()]) };
    } finally {
      await Promise.all(
        leases
          .filter((lease) => lease.acquired)
          .map(async (lease) => {
            const released = await input.cache.compareAndDelete(
              leaseKey(input, lease.key),
              lease.token,
              AbortSignal.timeout(250),
            );
            if (released.status !== "completed" || !released.value) {
              record({ outcome: "lease_lost", durationMs: 0 });
            }
          }),
      );
    }
  };

  const coalesce = async (
    fences: readonly CatalogPublicFence[],
    scope: CatalogReadScope,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<readonly PublicCatalogTitle[]>> => {
    const createdWork: SharedWork = {
      controller: new AbortController(),
      waiters: 0,
      settled: false,
    };
    const selected: SharedEntry[] = [];
    const created: Array<{
      identity: string;
      fence: CatalogPublicFence;
      entry: SharedEntry;
    }> = [];
    const overflow: CatalogPublicFence[] = [];
    for (const fence of fences) {
      const identity = digest(input, positiveKey(input.environment, fence));
      const existing = entries.get(identity);
      if (existing) {
        const attachedCallers = existing.waiters;
        record({
          outcome: "coalesced",
          durationMs: 0,
          waiterBucket:
            attachedCallers === 1 ? "one" : attachedCallers <= 4 ? "two_to_four" : "five_plus",
        });
        selected.push(existing);
        continue;
      }
      if (
        entries.size + fenceEntries.size >=
        CATALOG_PUBLIC_CACHE_POLICY.maximumCoalescingEntries
      ) {
        overflow.push(fence);
        continue;
      }
      const entry: SharedEntry = {
        work: createdWork,
        waiters: 0,
        promise: Promise.resolve({ status: "unavailable" }),
      };
      entries.set(identity, entry);
      created.push({ identity, fence, entry });
      selected.push(entry);
    }
    if (created.length > 0) {
      const workSignal = AbortSignal.any([
        createdWork.controller.signal,
        AbortSignal.timeout(CATALOG_PUBLIC_CACHE_POLICY.sharedWorkTimeoutMs),
      ]);
      const batch = refresh(
        created.map((value) => value.fence),
        scope,
        workSignal,
      );
      for (const item of created) {
        item.entry.promise = batch
          .then((result): CatalogStoreResult<PublicCatalogTitle | null> =>
            result.status === "completed"
              ? {
                  status: "completed",
                  value: result.value.find((title) => title.id === item.fence.id) ?? null,
                }
              : result,
          )
          .finally(() => {
            entries.delete(item.identity);
          });
      }
      void batch.then(
        () => {
          createdWork.settled = true;
        },
        () => {
          createdWork.settled = true;
        },
      );
    }
    for (const entry of selected) {
      entry.waiters += 1;
      entry.work.waiters += 1;
    }
    try {
      const [shared, direct] = await Promise.all([
        Promise.all(selected.map((entry) => waitForCaller(entry.promise, signal))),
        overflow.length > 0
          ? refresh(overflow, scope, signal)
          : Promise.resolve({ status: "completed", value: [] } as const),
      ]);
      const titles: PublicCatalogTitle[] = [];
      for (const result of shared) {
        if (result.status !== "completed") {
          return result;
        }
        if (result.value) {
          titles.push(result.value);
        }
      }
      if (direct.status !== "completed") {
        return direct;
      }
      titles.push(...direct.value);
      return { status: "completed", value: Object.freeze(titles) };
    } finally {
      for (const entry of selected) {
        entry.waiters -= 1;
        entry.work.waiters -= 1;
        if (entry.work.waiters === 0 && !entry.work.settled) {
          entry.work.controller.abort();
        }
      }
    }
  };

  const reader: CatalogPublicEntityReader = {
    async findMany(ids, scope, signal) {
      if (
        ids.length === 0 ||
        ids.length > 20 ||
        new Set(ids).size !== ids.length ||
        !ids.every(catalogIdentifier) ||
        !catalogTimestamp(scope.now)
      ) {
        return { status: "invalid_input" };
      }
      if (signal.aborted) {
        return { status: "cancelled" };
      }

      const negativeReads = await Promise.all(
        ids.map(async (id) => ({ id, cached: await readNegative(id, scope, signal) })),
      );
      const negativeHits = new Set<string>();
      for (const { id, cached } of negativeReads) {
        if (cached.status === "cancelled") {
          return { status: "cancelled" };
        }
        if (cached.status === "hit") {
          negativeHits.add(id);
        }
      }
      const unresolved = ids.filter((id) => !negativeHits.has(id));
      if (unresolved.length === 0) {
        return { status: "completed", value: [] };
      }

      const fences = await coalesceFences(unresolved, scope, signal);
      if (fences.status !== "completed") {
        return fences;
      }

      const cachedFences = await Promise.all(
        fences.value.map(async (fence) => ({
          fence,
          cached: await readPositive(fence, scope, signal),
        })),
      );
      const titles = new Map<string, PublicCatalogTitle>();
      const misses: CatalogPublicFence[] = [];
      for (const { fence, cached } of cachedFences) {
        if (cached.status === "cancelled") {
          return { status: "cancelled" };
        }
        if (cached.status === "hit") {
          titles.set(cached.title.id, cached.title);
        } else {
          misses.push(fence);
        }
      }
      if (misses.length > 0) {
        const refreshed = await coalesce(misses, scope, signal);
        if (refreshed.status !== "completed") {
          return refreshed;
        }
        for (const title of refreshed.value) {
          titles.set(title.id, title);
        }
      }
      return { status: "completed", value: Object.freeze([...titles.values()]) };
    },
  };
  return Object.freeze(reader);
}
