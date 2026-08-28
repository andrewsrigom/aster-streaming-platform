import {
  CreateBucketCommand,
  GetBucketAclCommand,
  GetBucketCorsCommand,
  GetBucketPolicyCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { localMediaStorage } from "./local-storage.js";
import { catalogRecord } from "../../domain/values.js";

export const localPublicationStorage = Object.freeze({
  ...localMediaStorage,
  bucket: "aster-media-published",
});
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
export function publicationPolicy(prefixes: readonly string[]): string {
  if (
    prefixes.length < 1 ||
    prefixes.length > 100 ||
    new Set(prefixes).size !== prefixes.length ||
    prefixes.some((prefix) => !/^publications\/[a-f0-9]{64}\/$/u.test(prefix))
  ) {
    throw new Error("Invalid publication access prefixes.");
  }
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [...prefixes]
          .sort()
          .map((prefix) => "arn:aws:s3:::" + localPublicationStorage.bucket + "/" + prefix + "*"),
      },
    ],
  });
}
export async function readPublicationPolicy(
  client: S3Client,
  signal: AbortSignal,
): Promise<string[]> {
  let raw: string | undefined;
  try {
    raw = (
      await client.send(new GetBucketPolicyCommand({ Bucket: localPublicationStorage.bucket }), {
        abortSignal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      })
    ).Policy;
  } catch (error) {
    if (absent(error)) {
      return [];
    }
    throw error;
  }
  const rejected = () => new Error("Unexpected publication bucket policy.");
  if (!raw || Buffer.byteLength(raw) > 20000) {
    throw rejected();
  }
  const policy = catalogRecord(JSON.parse(raw) as unknown, ["Version", "Statement"]);
  const statements = policy?.["Statement"];
  const statement =
    Array.isArray(statements) && statements.length === 1
      ? catalogRecord(statements[0], ["Effect", "Principal", "Action", "Resource"])
      : undefined;
  const resources = statement?.["Resource"];
  if (
    policy?.["Version"] !== "2012-10-17" ||
    statement?.["Effect"] !== "Allow" ||
    statement["Principal"] !== "*" ||
    JSON.stringify(statement["Action"]) !== '["s3:GetObject"]' ||
    !Array.isArray(resources)
  ) {
    throw rejected();
  }
  const start = "arn:aws:s3:::" + localPublicationStorage.bucket + "/";
  const prefixes = resources.map((resource: unknown) => {
    if (typeof resource !== "string" || !resource.startsWith(start) || !resource.endsWith("/*")) {
      throw rejected();
    }
    return resource.slice(start.length, -1);
  });
  try {
    publicationPolicy(prefixes);
  } catch {
    throw rejected();
  }
  return prefixes.sort();
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
  await readPublicationPolicy(client, active);
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
