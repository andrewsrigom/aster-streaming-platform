import { randomUUID } from "node:crypto";
import {
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
  reveal: (prefix: string, signal: AbortSignal) => Promise<void>;
}>;
export function createPublicationAccess(client: S3Client): PublicationAccess {
  const Bucket = localPublicationStorage.bucket;
  const Key = "control/publication-access.lock";
  return {
    async reveal(prefix, signal) {
      publicationPolicy([prefix]);
      const active = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
      // No expiring lease: an ambiguous policy write must not race a replacement publisher.
      // Recovery fences all publishers/the writer before removing this exact control object.
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key,
          IfNoneMatch: "*",
          ContentType: "application/json",
          Body: JSON.stringify({
            owner: randomUUID(),
            prefix,
            createdAt: new Date().toISOString(),
          }),
        }),
        { abortSignal: active },
      );
      const prefixes = await readPublicationPolicy(client, active);
      if (!prefixes.includes(prefix)) {
        prefixes.push(prefix);
        await client.send(
          new PutBucketPolicyCommand({ Bucket, Policy: publicationPolicy(prefixes) }),
          {
            abortSignal: active,
          },
        );
      }
      if (
        JSON.stringify(await readPublicationPolicy(client, active)) !==
        JSON.stringify(prefixes.sort())
      ) {
        throw new Error("Publication policy readback failed; access lock retained.");
      }
      // Deliberately not in finally: failure/cancellation retains the fail-closed recovery barrier.
      await client.send(new DeleteObjectCommand({ Bucket, Key }), { abortSignal: active });
    },
  };
}

export async function grantPublicationAccess(
  bundle: PublicationBundle,
  storage: Pick<AsterObjectStorageAdapter, "read">,
  access: PublicationAccess,
  currentApproval: () => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
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
    await currentApproval();
    await verifyCandidateObject(storage, bundle.prefix + file.name, file, signal);
  }
  await currentApproval();
  signal.throwIfAborted();
  // One policy update reveals the verified prefix, not individual partially copied objects.
  await access.reveal(bundle.prefix, signal);
  await currentApproval();
}
