import type { HomeRailsResult } from "./home-rails.js";

export type DiscoveryHomeCacheResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "malformed" }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "bypass" }>;

export interface DiscoveryHomeCacheStore {
  read(key: string, signal: AbortSignal): Promise<DiscoveryHomeCacheResult<string | null>>;
  write(
    key: string,
    value: string,
    ttlMs: number,
    signal: AbortSignal,
  ): Promise<DiscoveryHomeCacheResult<boolean>>;
  acquireLease(
    key: string,
    ownershipToken: string,
    ttlMs: number,
    signal: AbortSignal,
  ): Promise<DiscoveryHomeCacheResult<boolean>>;
  delete(key: string, signal: AbortSignal): Promise<DiscoveryHomeCacheResult<boolean>>;
  compareAndDelete(
    key: string,
    expected: string,
    signal: AbortSignal,
  ): Promise<DiscoveryHomeCacheResult<boolean>>;
}

export interface DiscoveryHomeSource {
  execute(input: unknown, now: number, signal: AbortSignal): Promise<HomeRailsResult>;
}
