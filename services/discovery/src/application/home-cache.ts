import { performance } from "node:perf_hooks";
import { normalizeHomeRailInput, type HomeRailKind } from "../domain/home-rail.js";
import { discoveryIdentifier, discoveryRecord } from "../domain/title-projection.js";
import type {
  HomeGenreRailResult,
  HomeRail,
  HomeRailCode,
  HomeRailEdge,
  HomeRailResult,
  HomeRailsPage,
  HomeRailsResult,
} from "./home-rails.js";
import type { DiscoveryHomeCacheStore, DiscoveryHomeSource } from "./home-cache-ports.js";

export const DISCOVERY_HOME_CACHE_POLICY = Object.freeze({
  freshSeconds: 15,
  freshJitterSeconds: 5,
  maximumStaleSeconds: 60,
  expiryJitterSeconds: 10,
  leaseTtlMs: 2_000,
  leaseWaitMs: 25,
  sharedWorkTimeoutMs: 1_500,
  maximumValueBytes: 16_384,
  maximumCoalescingEntries: 12,
} as const);

const ENVIRONMENTS = new Set(["local", "test", "development", "staging", "production"]);
const MAXIMUM_TIMESTAMP = 253_402_300_799;
type FixedKind = "featured" | "recently_added" | "trending";

export interface DiscoveryHomeCacheObservation {
  readonly outcome:
    | "hit"
    | "stale_hit"
    | "miss"
    | "malformed"
    | "bypass"
    | "source_load"
    | "refresh_failed"
    | "coalesced"
    | "lease_acquired"
    | "lease_contended"
    | "lease_lost";
  readonly durationMs: number;
  readonly payloadBytes?: number;
  readonly waiterBucket?: "one" | "two_to_four" | "five_plus";
}

interface CacheOptions {
  readonly environment: string;
  readonly source: DiscoveryHomeSource;
  readonly cache: DiscoveryHomeCacheStore;
  readonly digest: (value: string) => string;
  readonly token: () => string;
  readonly now: () => number;
  readonly monotonicNow?: () => number;
  readonly record?: (observation: DiscoveryHomeCacheObservation) => void;
}

interface SharedEntry {
  readonly controller: AbortController;
  promise: Promise<HomeRailsResult>;
  attachments: number;
  waiters: number;
  detached: boolean;
  settled: boolean;
}

type CachedPage = Readonly<{
  status: "fresh" | "stale";
  page: HomeRailsPage;
}>;

type CacheRead = CachedPage | Readonly<{ status: "miss" | "cancelled" }>;
type EnvelopeResult =
  CachedPage | Readonly<{ status: "expired" }> | Readonly<{ status: "malformed" }>;

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
  );
}

function digest(input: CacheOptions, value: string): string {
  const result = input.digest(value);
  if (!/^[a-f0-9]{64}$/u.test(result)) {
    throw new Error("Invalid Discovery cache digest.");
  }
  return result;
}

function jitter(input: CacheOptions, value: string, maximum: number): number {
  return Number.parseInt(digest(input, value).slice(0, 8), 16) % (maximum + 1);
}

function cacheKey(environment: string, first: number): string {
  return `aster:${environment}:discovery:home:v1:${String(first)}`;
}

function leaseKey(input: CacheOptions, key: string): string {
  return `aster:${input.environment}:discovery:home-lease:v1:${digest(input, key)}`;
}

function safeMonotonic(clock: () => number): number {
  try {
    const value = clock();
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function safeWallNow(clock: () => number, fallback: number): number {
  try {
    const value = clock();
    return integer(value, 0, MAXIMUM_TIMESTAMP) ? value : fallback;
  } catch {
    return fallback;
  }
}

function parseEdge(value: unknown, cachedAt: number): HomeRailEdge | undefined {
  const edge = discoveryRecord(value, ["titleId", "sourceVersion", "indexedAt", "visibleUntil"]);
  if (
    !edge ||
    !discoveryIdentifier(edge["titleId"]) ||
    !integer(edge["sourceVersion"], 1, 2_147_483_647) ||
    !integer(edge["indexedAt"], 0, cachedAt) ||
    !integer(edge["visibleUntil"], cachedAt + 1, MAXIMUM_TIMESTAMP)
  ) {
    return undefined;
  }
  return Object.freeze({
    titleId: edge["titleId"],
    sourceVersion: edge["sourceVersion"],
    indexedAt: edge["indexedAt"],
    visibleUntil: edge["visibleUntil"],
  });
}

function parseRail(
  value: unknown,
  kind: HomeRailKind,
  source: HomeRailKind,
  first: number,
  cachedAt: number,
  genre: string | null,
): HomeRail | undefined {
  const rail = discoveryRecord(value, [
    "key",
    "kind",
    "genre",
    "source",
    "oldestIndexedAt",
    "freshUntil",
    "edges",
  ]);
  const expectedKey = genre === null ? kind.replaceAll("_", "-") : `genre:${genre}`;
  if (
    !rail ||
    rail["key"] !== expectedKey ||
    rail["kind"] !== kind ||
    rail["genre"] !== genre ||
    rail["source"] !== source ||
    !Array.isArray(rail["edges"]) ||
    rail["edges"].length > first
  ) {
    return undefined;
  }
  const edges: HomeRailEdge[] = [];
  const titles = new Set<string>();
  for (const raw of rail["edges"]) {
    const edge = parseEdge(raw, cachedAt);
    if (!edge || titles.has(edge.titleId)) {
      return undefined;
    }
    titles.add(edge.titleId);
    edges.push(edge);
  }
  const oldestIndexedAt =
    edges.length === 0 ? null : Math.min(...edges.map((edge) => edge.indexedAt));
  const freshUntil =
    edges.length === 0 ? null : Math.min(...edges.map((edge) => edge.visibleUntil));
  if (rail["oldestIndexedAt"] !== oldestIndexedAt || rail["freshUntil"] !== freshUntil) {
    return undefined;
  }
  return Object.freeze({
    key: expectedKey,
    kind,
    genre,
    source,
    oldestIndexedAt,
    freshUntil,
    edges: Object.freeze(edges),
  });
}

function parseFixed(
  value: unknown,
  kind: FixedKind,
  first: number,
  cachedAt: number,
): HomeRailResult | undefined {
  const result = discoveryRecord(value, ["code", "rail"]);
  const code = result?.["code"];
  if (!result || !["completed", "empty", "fallback"].includes(String(code))) {
    return undefined;
  }
  if (code === "fallback" && kind === "recently_added") {
    return undefined;
  }
  const source = code === "fallback" ? "recently_added" : kind;
  const rail = parseRail(result["rail"], kind, source, first, cachedAt, null);
  if (
    !rail ||
    ((code === "completed" || code === "fallback") && rail.edges.length === 0) ||
    (code === "empty" && rail.edges.length !== 0)
  ) {
    return undefined;
  }
  return Object.freeze({ code: code as HomeRailCode, rail });
}

function parseGenres(
  value: unknown,
  first: number,
  cachedAt: number,
): HomeGenreRailResult | undefined {
  const result = discoveryRecord(value, ["code", "rails"]);
  if (
    !result ||
    !["completed", "empty"].includes(String(result["code"])) ||
    !Array.isArray(result["rails"]) ||
    result["rails"].length > 3
  ) {
    return undefined;
  }
  const rails: HomeRail[] = [];
  const genres = new Set<string>();
  for (const raw of result["rails"]) {
    const candidate = discoveryRecord(raw, [
      "key",
      "kind",
      "genre",
      "source",
      "oldestIndexedAt",
      "freshUntil",
      "edges",
    ]);
    const genre = candidate?.["genre"];
    if (
      typeof genre !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(genre) ||
      genres.has(genre)
    ) {
      return undefined;
    }
    const rail = parseRail(raw, "genre", "genre", first, cachedAt, genre);
    if (!rail || rail.edges.length === 0) {
      return undefined;
    }
    genres.add(genre);
    rails.push(rail);
  }
  if ((result["code"] === "completed") !== rails.length > 0) {
    return undefined;
  }
  return Object.freeze({
    code: result["code"] as HomeGenreRailResult["code"],
    rails: Object.freeze(rails),
  });
}

function parsePage(value: unknown, first: number, cachedAt: number): HomeRailsPage | undefined {
  const page = discoveryRecord(value, [
    "status",
    "generation",
    "generatedAt",
    "featured",
    "recentlyAdded",
    "trending",
    "genres",
  ]);
  const featured = page ? parseFixed(page["featured"], "featured", first, cachedAt) : undefined;
  const recent = page
    ? parseFixed(page["recentlyAdded"], "recently_added", first, cachedAt)
    : undefined;
  const trending = page ? parseFixed(page["trending"], "trending", first, cachedAt) : undefined;
  const genres = page ? parseGenres(page["genres"], first, cachedAt) : undefined;
  if (
    !page ||
    !discoveryIdentifier(page["generation"]) ||
    page["generatedAt"] !== cachedAt ||
    !featured ||
    !recent ||
    !trending ||
    !genres
  ) {
    return undefined;
  }
  const expectedStatus =
    featured.code === "fallback" || trending.code === "fallback" ? "partial" : "completed";
  if (page["status"] !== expectedStatus) {
    return undefined;
  }
  return Object.freeze({
    status: expectedStatus,
    generation: page["generation"],
    generatedAt: cachedAt,
    featured,
    recentlyAdded: recent,
    trending,
    genres,
  });
}

function edges(page: HomeRailsPage): readonly HomeRailEdge[] {
  return [
    ...(page.featured.rail?.edges ?? []),
    ...(page.recentlyAdded.rail?.edges ?? []),
    ...(page.trending.rail?.edges ?? []),
    ...page.genres.rails.flatMap((rail) => rail.edges),
  ];
}

function parseEnvelope(raw: string, first: number, now: number): EnvelopeResult {
  if (Buffer.byteLength(raw, "utf8") > DISCOVERY_HOME_CACHE_POLICY.maximumValueBytes) {
    return { status: "malformed" };
  }
  try {
    const envelope = discoveryRecord(JSON.parse(raw) as unknown, [
      "schema",
      "first",
      "cachedAt",
      "refreshAfter",
      "staleUntil",
      "page",
    ]);
    if (
      !envelope ||
      envelope["schema"] !== 1 ||
      envelope["first"] !== first ||
      !integer(envelope["cachedAt"], 0, now) ||
      !integer(envelope["refreshAfter"], envelope["cachedAt"] + 1, MAXIMUM_TIMESTAMP) ||
      !integer(envelope["staleUntil"], envelope["refreshAfter"], MAXIMUM_TIMESTAMP) ||
      envelope["refreshAfter"] >
        envelope["cachedAt"] +
          DISCOVERY_HOME_CACHE_POLICY.freshSeconds +
          DISCOVERY_HOME_CACHE_POLICY.freshJitterSeconds ||
      envelope["staleUntil"] >
        envelope["cachedAt"] + DISCOVERY_HOME_CACHE_POLICY.maximumStaleSeconds
    ) {
      return { status: "malformed" };
    }
    const page = parsePage(envelope["page"], first, envelope["cachedAt"]);
    if (!page) {
      return { status: "malformed" };
    }
    const pageEdges = edges(page);
    const earliest =
      pageEdges.length === 0
        ? envelope["staleUntil"]
        : Math.min(...pageEdges.map((edge) => edge.visibleUntil));
    if (envelope["staleUntil"] > earliest) {
      return { status: "malformed" };
    }
    if (now >= envelope["staleUntil"]) {
      return { status: "expired" };
    }
    return Object.freeze({
      status: now < envelope["refreshAfter"] ? "fresh" : "stale",
      page,
    });
  } catch {
    return { status: "malformed" };
  }
}

function cacheablePage(result: HomeRailsResult): HomeRailsPage | undefined {
  if (result.status !== "completed" || result.value.status !== "completed") {
    return undefined;
  }
  const page = result.value.value;
  const fixed = [page.featured, page.recentlyAdded, page.trending];
  return page.status !== "stale" &&
    fixed.every((value) => ["completed", "empty", "fallback"].includes(value.code)) &&
    ["completed", "empty"].includes(page.genres.code)
    ? page
    : undefined;
}

function sourceResultVisibleAt(result: HomeRailsResult, now: number): boolean {
  if (result.status !== "completed" || result.value.status !== "completed") {
    return true;
  }
  const page = result.value.value;
  return page.generatedAt <= now && edges(page).every((edge) => edge.visibleUntil > now);
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

function waitForCaller(
  promise: Promise<HomeRailsResult>,
  signal: AbortSignal,
): Promise<HomeRailsResult> {
  if (signal.aborted) {
    return Promise.resolve({ status: "cancelled" });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: HomeRailsResult): void => {
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
    promise.then(finish, () => {
      finish({ status: "unavailable" });
    });
  });
}

function cachedResult(cached: CachedPage): HomeRailsResult {
  return {
    status: "completed",
    value: {
      status: "completed",
      value:
        cached.status === "fresh"
          ? cached.page
          : Object.freeze({ ...cached.page, status: "stale" as const }),
    },
  };
}

export function createCachedDiscoveryHome(options: Readonly<CacheOptions>) {
  if (!ENVIRONMENTS.has(options.environment)) {
    throw new Error("Invalid Discovery cache environment.");
  }
  const monotonic = options.monotonicNow ?? (() => performance.now());
  const entries = new Map<string, SharedEntry>();
  const work = new Set<Promise<HomeRailsResult>>();
  let closed = false;

  const record = (observation: DiscoveryHomeCacheObservation): void => {
    try {
      options.record?.(Object.freeze(observation));
    } catch {
      // Measurements cannot change a Discovery result.
    }
  };

  const read = async (
    key: string,
    first: number,
    now: number,
    signal: AbortSignal,
  ): Promise<CacheRead> => {
    const startedAt = safeMonotonic(monotonic);
    let result: Awaited<ReturnType<DiscoveryHomeCacheStore["read"]>>;
    try {
      result = await options.cache.read(key, signal);
    } catch {
      record({ outcome: "bypass", durationMs: Math.max(0, safeMonotonic(monotonic) - startedAt) });
      return { status: "miss" };
    }
    const durationMs = Math.max(0, safeMonotonic(monotonic) - startedAt);
    if (result.status === "cancelled") {
      return { status: "cancelled" };
    }
    if (result.status === "bypass") {
      record({ outcome: "bypass", durationMs });
      return { status: "miss" };
    }
    if (result.status === "malformed") {
      record({ outcome: "malformed", durationMs });
      await options.cache.delete(key, signal).catch(() => ({ status: "bypass" as const }));
      return signal.aborted ? { status: "cancelled" } : { status: "miss" };
    }
    if (result.value === null) {
      record({ outcome: "miss", durationMs });
      return { status: "miss" };
    }
    const parsed = parseEnvelope(result.value, first, now);
    if (parsed.status === "malformed" || parsed.status === "expired") {
      const payloadBytes = Buffer.byteLength(result.value, "utf8");
      record({
        outcome: parsed.status === "malformed" ? "malformed" : "miss",
        durationMs,
        ...(payloadBytes <= DISCOVERY_HOME_CACHE_POLICY.maximumValueBytes ? { payloadBytes } : {}),
      });
      await options.cache.delete(key, signal).catch(() => ({ status: "bypass" as const }));
      return signal.aborted ? { status: "cancelled" } : { status: "miss" };
    }
    record({
      outcome: parsed.status === "fresh" ? "hit" : "stale_hit",
      durationMs,
      payloadBytes: Buffer.byteLength(result.value, "utf8"),
    });
    return parsed;
  };

  const write = async (
    key: string,
    first: number,
    page: HomeRailsPage,
    cachedAt: number,
    signal: AbortSignal,
  ): Promise<void> => {
    const pageEdges = edges(page);
    const maximumStaleUntil = cachedAt + DISCOVERY_HOME_CACHE_POLICY.maximumStaleSeconds;
    const staleUntil =
      pageEdges.length === 0
        ? maximumStaleUntil
        : Math.min(maximumStaleUntil, ...pageEdges.map((edge) => edge.visibleUntil));
    if (staleUntil <= cachedAt) {
      return;
    }
    const refreshAfter = Math.min(
      staleUntil,
      cachedAt +
        DISCOVERY_HOME_CACHE_POLICY.freshSeconds +
        jitter(options, `${key}:fresh`, DISCOVERY_HOME_CACHE_POLICY.freshJitterSeconds),
    );
    const value = JSON.stringify({ schema: 1, first, cachedAt, refreshAfter, staleUntil, page });
    const payloadBytes = Buffer.byteLength(value, "utf8");
    if (payloadBytes > DISCOVERY_HOME_CACHE_POLICY.maximumValueBytes) {
      record({ outcome: "bypass", durationMs: 0 });
      return;
    }
    const ttlMs =
      (staleUntil -
        cachedAt +
        jitter(options, `${key}:expiry`, DISCOVERY_HOME_CACHE_POLICY.expiryJitterSeconds)) *
      1_000;
    const result = await options.cache
      .write(key, value, ttlMs, signal)
      .catch(() => ({ status: "bypass" as const }));
    if (result.status !== "completed" || !result.value) {
      record({ outcome: "bypass", durationMs: 0 });
    }
  };

  const source = async (
    first: number,
    now: number,
    signal: AbortSignal,
  ): Promise<HomeRailsResult> => {
    const startedAt = safeMonotonic(monotonic);
    let result: HomeRailsResult;
    try {
      result = await options.source.execute({ first }, now, signal);
    } catch {
      result = { status: signal.aborted ? "cancelled" : "unavailable" };
    }
    record({
      outcome: cacheablePage(result) ? "source_load" : "refresh_failed",
      durationMs: Math.max(0, safeMonotonic(monotonic) - startedAt),
    });
    return result;
  };

  const refresh = async (
    key: string,
    first: number,
    now: number,
    background: boolean,
    signal: AbortSignal,
  ): Promise<HomeRailsResult> => {
    let token: string;
    try {
      token = options.token();
      if (!/^[a-f0-9]{32,64}$/u.test(token)) {
        throw new Error("Invalid token.");
      }
    } catch {
      return source(first, now, signal);
    }
    const lease = leaseKey(options, key);
    const acquired = await options.cache
      .acquireLease(lease, token, DISCOVERY_HOME_CACHE_POLICY.leaseTtlMs, signal)
      .catch(() => ({ status: "bypass" as const }));
    if (acquired.status === "cancelled") {
      return { status: "cancelled" };
    }
    if (acquired.status === "completed" && !acquired.value) {
      record({ outcome: "lease_contended", durationMs: 0 });
      if (background || !(await waitForDelay(DISCOVERY_HOME_CACHE_POLICY.leaseWaitMs, signal))) {
        return { status: signal.aborted ? "cancelled" : "unavailable" };
      }
      const cached = await read(key, first, now, signal);
      if (cached.status === "fresh" || cached.status === "stale") {
        return cachedResult(cached);
      }
      return source(first, now, signal);
    }
    if (acquired.status !== "completed") {
      return source(first, now, signal);
    }
    record({ outcome: "lease_acquired", durationMs: 0 });
    try {
      const result = await source(first, now, signal);
      const page = cacheablePage(result);
      if (page) {
        await write(key, first, page, now, signal);
      }
      return result;
    } finally {
      const released = await options.cache
        .compareAndDelete(lease, token, AbortSignal.timeout(250))
        .catch(() => ({ status: "bypass" as const }));
      if (released.status !== "completed" || !released.value) {
        record({ outcome: "lease_lost", durationMs: 0 });
      }
    }
  };

  const start = (
    key: string,
    first: number,
    now: number,
    detached: boolean,
  ): SharedEntry | undefined => {
    const existing = entries.get(key);
    if (existing) {
      existing.detached ||= detached;
      existing.attachments += 1;
      const count = existing.attachments;
      record({
        outcome: "coalesced",
        durationMs: 0,
        waiterBucket: count === 1 ? "one" : count <= 4 ? "two_to_four" : "five_plus",
      });
      return existing;
    }
    if (closed || entries.size >= DISCOVERY_HOME_CACHE_POLICY.maximumCoalescingEntries) {
      return undefined;
    }
    const controller = new AbortController();
    const entry: SharedEntry = {
      controller,
      promise: Promise.resolve({ status: "unavailable" }),
      attachments: 0,
      waiters: 0,
      detached,
      settled: false,
    };
    const promise = refresh(
      key,
      first,
      now,
      detached,
      AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(DISCOVERY_HOME_CACHE_POLICY.sharedWorkTimeoutMs),
      ]),
    )
      .catch((): HomeRailsResult => ({ status: "unavailable" }))
      .finally(() => {
        entry.settled = true;
        entries.delete(key);
        work.delete(promise);
      });
    entry.promise = promise;
    entries.set(key, entry);
    work.add(promise);
    return entry;
  };

  return Object.freeze({
    async execute(input: unknown, now: number, signal: AbortSignal): Promise<HomeRailsResult> {
      const request = normalizeHomeRailInput(input);
      if (!request || !integer(now, 0, MAXIMUM_TIMESTAMP)) {
        return { status: "completed", value: { status: "invalid_input" } };
      }
      if (signal.aborted || closed) {
        return { status: "cancelled" };
      }
      const key = cacheKey(options.environment, request.first);
      const cached = await read(key, request.first, now, signal);
      if (cached.status === "cancelled") {
        return { status: "cancelled" };
      }
      if (cached.status === "fresh") {
        return cachedResult(cached);
      }
      if (cached.status === "stale") {
        start(key, request.first, safeWallNow(options.now, now), true);
        return cachedResult(cached);
      }
      const entry = start(key, request.first, now, false);
      if (!entry) {
        return source(request.first, now, signal);
      }
      entry.waiters += 1;
      try {
        const result = await waitForCaller(entry.promise, signal);
        return sourceResultVisibleAt(result, now)
          ? result
          : await source(request.first, now, signal);
      } finally {
        entry.waiters -= 1;
        if (entry.waiters === 0 && !entry.detached && !entry.settled) {
          entry.controller.abort();
        }
      }
    },
    async stop(signal: AbortSignal): Promise<void> {
      closed = true;
      for (const entry of entries.values()) {
        entry.controller.abort();
      }
      const settlement = Promise.allSettled([...work]).then(() => undefined);
      if (signal.aborted) {
        throw new Error("Discovery cache shutdown cancelled.");
      }
      await new Promise<void>((resolve, reject) => {
        const finish = (): void => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = (): void => {
          reject(new Error("Discovery cache shutdown cancelled."));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        settlement.then(finish, onAbort);
      });
    },
    forceClose(): void {
      closed = true;
      for (const entry of entries.values()) {
        entry.controller.abort();
      }
    },
  });
}
