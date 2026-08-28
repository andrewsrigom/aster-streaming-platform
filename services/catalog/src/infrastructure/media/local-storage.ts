import {
  CreateBucketCommand,
  GetBucketAclCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const localMediaStorage = Object.freeze({
  endpoint: "http://storage:9000",
  region: "us-east-1",
  bucket: "aster-media-originals",
  accessKeyId: "aster-test-access",
  secretAccessKey: "aster-test-only",
});
export async function prepareLocalMediaStorage(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const client = new S3Client({
    endpoint: localMediaStorage.endpoint,
    region: localMediaStorage.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: localMediaStorage.accessKeyId,
      secretAccessKey: localMediaStorage.secretAccessKey,
    },
    maxAttempts: 1,
  });
  const active = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket: localMediaStorage.bucket }), {
        abortSignal: active,
      });
    } catch (error) {
      if (!(
        error instanceof Error &&
        "$metadata" in error &&
        (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
      )) {
        throw error;
      }
      await client.send(new CreateBucketCommand({ Bucket: localMediaStorage.bucket }), {
        abortSignal: active,
      });
    }
    const acl = await client.send(new GetBucketAclCommand({ Bucket: localMediaStorage.bucket }), {
      abortSignal: active,
    });
    if (
      !acl.Owner?.ID ||
      !acl.Grants?.length ||
      acl.Grants.length > 8 ||
      acl.Grants.some(
        (grant) => grant.Grantee?.Type !== "CanonicalUser" || grant.Grantee.ID !== acl.Owner?.ID,
      )
    ) {
      throw new Error("Local originals bucket is not owner-private.");
    }
  } finally {
    client.destroy();
  }
}
