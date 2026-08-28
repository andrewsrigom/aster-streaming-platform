import { randomUUID } from "node:crypto";
import {
  DeleteBucketPolicyCommand,
  DeleteObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { AsterObjectStorageAdapter } from "@aster/object-storage-s3";
import {
  localPublicationStorage,
  publicationPolicy,
  readPublicationPolicy,
} from "./publication-storage.js";
import { mediaSha256, type PublicationBundle } from "./publication-bundle.js";
import { verifyCandidateObject } from "./retain-candidate.js";

type PublicationAccess = Readonly<{
  reveal: <T>(
    prefix: string,
    signal: AbortSignal,
    confirm: (signal: AbortSignal) => Promise<T>,
  ) => Promise<T>;
}>;
export class PublicationAccessRecoveryError extends Error {
  constructor(cause: unknown) {
    super("Publication access recovery required; access lock retained.", { cause });
    this.name = "PublicationAccessRecoveryError";
  }
}
export function createPublicationAccess(client: S3Client): PublicationAccess {
  const Bucket = localPublicationStorage.bucket;
  const Key = "control/publication-access.lock";
  return {
    async reveal(prefix, signal, confirm) {
      publicationPolicy([prefix]);
      const active = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
      const owner = { owner: randomUUID(), prefix, createdAt: new Date().toISOString() };
      // No expiring lease: an ambiguous policy write must not race a replacement publisher.
      // Recovery fences all publishers/the writer before removing this exact control object.
      active.throwIfAborted();
      try {
        await client.send(
          new PutObjectCommand({
            Bucket,
            Key,
            IfNoneMatch: "*",
            ContentType: "application/json",
            Body: JSON.stringify(owner),
          }),
          { abortSignal: active },
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "PreconditionFailed" &&
          "$metadata" in error &&
          (error.$metadata as { httpStatusCode?: number } | undefined)?.httpStatusCode === 412
        ) {
          throw error;
        }
        // A lost response may have left our barrier durable; retries must not hide recovery.
        throw new PublicationAccessRecoveryError(error);
      }
      let previous: string[];
      try {
        previous = await readPublicationPolicy(client, active);
        // The held non-expiring barrier makes this snapshot exclusive and recoverable after a crash.
        await client.send(
          new PutObjectCommand({
            Bucket,
            Key,
            ContentType: "application/json",
            Body: JSON.stringify({ ...owner, previousPrefixes: previous }),
          }),
          { abortSignal: active },
        );
      } catch (error) {
        throw new PublicationAccessRecoveryError(error);
      }
      const added = !previous.includes(prefix);
      const prefixes = added ? [...previous, prefix].sort() : previous;
      const verify = async (expected: readonly string[], checkSignal: AbortSignal) => {
        if (
          JSON.stringify(await readPublicationPolicy(client, checkSignal)) !==
          JSON.stringify(expected)
        ) {
          throw new Error("Publication policy readback failed.");
        }
      };
      try {
        if (added) {
          await client.send(
            new PutBucketPolicyCommand({ Bucket, Policy: publicationPolicy(prefixes) }),
            { abortSignal: active },
          );
        }
        await verify(prefixes, active);
      } catch (error) {
        // An uncertain write may still be in flight: fence the writer before attempting recovery.
        throw new PublicationAccessRecoveryError(error);
      }
      let result;
      try {
        active.throwIfAborted();
        result = await confirm(active);
      } catch (error) {
        // Compensate only a confirmed grant and only its new prefix, even after caller cancellation.
        const recovery = AbortSignal.timeout(10000);
        try {
          if (added) {
            if (previous.length) {
              await client.send(
                new PutBucketPolicyCommand({ Bucket, Policy: publicationPolicy(previous) }),
                { abortSignal: recovery },
              );
            } else {
              await client.send(new DeleteBucketPolicyCommand({ Bucket }), {
                abortSignal: recovery,
              });
            }
            await verify(previous, recovery);
          }
          await client.send(new DeleteObjectCommand({ Bucket, Key }), { abortSignal: recovery });
        } catch (recoveryError) {
          throw new PublicationAccessRecoveryError(recoveryError);
        }
        throw error;
      }
      // Confirmation includes current-rights SQL registration before another publisher can enter.
      try {
        await client.send(new DeleteObjectCommand({ Bucket, Key }), { abortSignal: active });
      } catch (error) {
        throw new PublicationAccessRecoveryError(error);
      }
      return result;
    },
  };
}

export async function grantPublicationAccess<T>(
  bundle: PublicationBundle,
  storage: Pick<AsterObjectStorageAdapter, "read">,
  access: PublicationAccess,
  currentApproval: (signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
  confirm: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const files = [
    ...bundle.hls.files,
    ...bundle.artwork.files,
    {
      name: "attribution.json",
      bytes: bundle.attribution.length,
      sha256: mediaSha256(bundle.attribution),
    },
  ];
  if (files.length > 2054 || !files.some((file) => file.name === "master.m3u8")) {
    throw new Error("Invalid publication access manifest.");
  }
  for (const file of files) {
    signal.throwIfAborted();
    await currentApproval(signal);
    await verifyCandidateObject(storage, bundle.prefix + file.name, file, signal);
  }
  await currentApproval(signal);
  signal.throwIfAborted();
  // One policy update reveals the verified prefix, not individual partially copied objects.
  return access.reveal(bundle.prefix, signal, async (active) => {
    await currentApproval(active);
    active.throwIfAborted();
    return confirm(active);
  });
}
