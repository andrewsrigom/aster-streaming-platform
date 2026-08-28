import {
  CreateBucketCommand,
  GetBucketAclCommand,
  GetBucketCorsCommand,
  GetBucketPolicyCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { localMediaStorage } from "./local-storage.js";

export const localPublicationStorage = Object.freeze({
  ...localMediaStorage,
  bucket: "aster-media-published",
});
const publicPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: "*",
      Action: ["s3:GetObject"],
      Resource: ["arn:aws:s3:::aster-media-published/publications/*"],
    },
  ],
};
const cors = [
  {
    AllowedOrigins: ["http://127.0.0.1:3000"],
    AllowedMethods: ["GET", "HEAD"],
    AllowedHeaders: ["range", "if-none-match"],
    ExposeHeaders: ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
    MaxAgeSeconds: 300,
  },
];
function absent(error: unknown): boolean {
  return (
    error instanceof Error &&
    "$metadata" in error &&
    (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
  );
}
function samePolicy(value: string | undefined): boolean {
  if (!value || value.length > 8192) {
    return false;
  }
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return false;
  }
  // Do not replace an unexpected policy on retained storage.
  return JSON.stringify(parsed) === JSON.stringify(publicPolicy);
}
export async function preparePublicationStorage(
  client: S3Client,
  signal: AbortSignal,
): Promise<void> {
  const active = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  const Bucket = localPublicationStorage.bucket;
  try {
    await client.send(new HeadBucketCommand({ Bucket }), { abortSignal: active });
  } catch (error) {
    if (!absent(error)) {
      throw error;
    }
    await client.send(new CreateBucketCommand({ Bucket }), { abortSignal: active });
  }
  const acl = await client.send(new GetBucketAclCommand({ Bucket }), { abortSignal: active });
  if (
    !acl.Owner?.ID ||
    !acl.Grants?.length ||
    acl.Grants.length > 8 ||
    acl.Grants.some(
      (grant) => grant.Grantee?.Type !== "CanonicalUser" || grant.Grantee.ID !== acl.Owner?.ID,
    )
  ) {
    throw new Error("Unexpected publication bucket ACL.");
  }
  let policy;
  try {
    policy = await client.send(new GetBucketPolicyCommand({ Bucket }), { abortSignal: active });
  } catch (error) {
    if (!absent(error)) {
      throw error;
    }
    await client.send(
      new PutBucketPolicyCommand({ Bucket, Policy: JSON.stringify(publicPolicy) }),
      { abortSignal: active },
    );
    policy = await client.send(new GetBucketPolicyCommand({ Bucket }), { abortSignal: active });
  }
  if (!samePolicy(policy.Policy)) {
    throw new Error("Unexpected publication bucket policy.");
  }
  let configuration;
  try {
    configuration = await client.send(new GetBucketCorsCommand({ Bucket }), {
      abortSignal: active,
    });
  } catch (error) {
    if (!absent(error)) {
      throw error;
    }
    await client.send(
      new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: cors } }),
      { abortSignal: active },
    );
    configuration = await client.send(new GetBucketCorsCommand({ Bucket }), {
      abortSignal: active,
    });
  }
  const rules = configuration.CORSRules?.map((rule) => ({
    AllowedOrigins: rule.AllowedOrigins,
    AllowedMethods: rule.AllowedMethods,
    AllowedHeaders: rule.AllowedHeaders,
    ExposeHeaders: rule.ExposeHeaders,
    MaxAgeSeconds: rule.MaxAgeSeconds,
  }));
  if (JSON.stringify(rules) !== JSON.stringify(cors)) {
    throw new Error("Unexpected publication CORS policy.");
  }
}

export function publicationStorageClient(
  endpoint: string = localPublicationStorage.endpoint,
): S3Client {
  return new S3Client({
    endpoint,
    region: localPublicationStorage.region,
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: localPublicationStorage.accessKeyId,
      secretAccessKey: localPublicationStorage.secretAccessKey,
    },
  });
}
