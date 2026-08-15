import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env/server";
import { MissingR2ConfigError } from "./errors";

let cachedR2Client: S3Client | null = null;

/**
 * Validates and retrieves required Cloudflare R2 configuration from the environment.
 */
export function getValidatedR2Config() {
  const accountId = env.R2_ACCOUNT_ID;
  if (!accountId || accountId.trim() === "") {
    throw new MissingR2ConfigError("R2_ACCOUNT_ID");
  }

  const accessKeyId = env.R2_ACCESS_KEY_ID;
  if (!accessKeyId || accessKeyId.trim() === "") {
    throw new MissingR2ConfigError("R2_ACCESS_KEY_ID");
  }

  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!secretAccessKey || secretAccessKey.trim() === "") {
    throw new MissingR2ConfigError("R2_SECRET_ACCESS_KEY");
  }

  const bucketName = env.R2_BUCKET_NAME;
  if (!bucketName || bucketName.trim() === "") {
    throw new MissingR2ConfigError("R2_BUCKET_NAME");
  }

  return {
    accountId: accountId.trim(),
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    bucketName: bucketName.trim(),
  };
}

/**
 * Returns a cached, lazily initialized S3Client configured for Cloudflare R2.
 */
export function getR2Client(): S3Client {
  if (cachedR2Client) {
    return cachedR2Client;
  }

  const config = getValidatedR2Config();

  cachedR2Client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedR2Client;
}

/**
 * Returns the configured R2 bucket name.
 */
export function getR2BucketName(): string {
  const config = getValidatedR2Config();
  return config.bucketName;
}
