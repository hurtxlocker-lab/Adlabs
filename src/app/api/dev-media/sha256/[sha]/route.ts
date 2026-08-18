import { NextRequest, NextResponse } from "next/server";
import { getR2Client, getR2BucketName } from "@/storage/r2-client";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

interface RouteParams {
  params: Promise<{
    sha: string;
  }>;
}

function isR2NotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const errorObj = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    errorObj.name === "NoSuchKey" ||
    errorObj.name === "NotFound" ||
    errorObj.$metadata?.httpStatusCode === 404
  );
}

/**
 * DEV-only same-origin proxy for canonical media assets in local development.
 * Allows localhost browser contexts to stream images and video preview loops
 * directly from R2 without being blocked by cross-site Cloudflare Access cookie rules.
 *
 * Invariants:
 * 1. Disabled outside development (returns 404 in production).
 * 2. Accepts strictly 64-character lowercase hex SHA-256 keys mapped to media/sha256/<sha>.
 * 3. Supports GET and HEAD methods only.
 * 4. Supports HTTP Range requests for video seeking and buffering.
 */
export async function GET(request: NextRequest, props: RouteParams) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { sha } = await props.params;
  const normalizedSha = sha ? sha.trim().toLowerCase() : "";

  if (!SHA256_HEX_REGEX.test(normalizedSha)) {
    return new NextResponse("Bad Request: Invalid SHA-256 parameter", {
      status: 400,
    });
  }

  const storageKey = `media/sha256/${normalizedSha}`;
  const rangeHeader = request.headers.get("range");

  const r2Client = getR2Client();
  const bucket = getR2BucketName();

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Range: rangeHeader ?? undefined,
    });

    const res = await r2Client.send(command);

    const headers = new Headers();
    if (res.ContentType) {
      headers.set("Content-Type", res.ContentType);
    }
    if (res.ContentLength !== undefined) {
      headers.set("Content-Length", res.ContentLength.toString());
    }
    if (res.ETag) {
      headers.set("ETag", res.ETag);
    }
    headers.set("Accept-Ranges", "bytes");
    if (res.ContentRange) {
      headers.set("Content-Range", res.ContentRange);
    }
    headers.set("Cache-Control", "private, max-age=3600");

    const status = res.ContentRange ? 206 : 200;

    return new NextResponse(res.Body as unknown as BodyInit, {
      status,
      headers,
    });
  } catch (err: unknown) {
    if (isR2NotFoundError(err)) {
      return new NextResponse("Media asset not found", { status: 404 });
    }

    console.error(`[dev-media-proxy] Failed to serve "${storageKey}":`, err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function HEAD(request: NextRequest, props: RouteParams) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { sha } = await props.params;
  const normalizedSha = sha ? sha.trim().toLowerCase() : "";

  if (!SHA256_HEX_REGEX.test(normalizedSha)) {
    return new NextResponse("Bad Request: Invalid SHA-256 parameter", {
      status: 400,
    });
  }

  const storageKey = `media/sha256/${normalizedSha}`;
  const r2Client = getR2Client();
  const bucket = getR2BucketName();

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    });

    const res = await r2Client.send(command);

    const headers = new Headers();
    if (res.ContentType) {
      headers.set("Content-Type", res.ContentType);
    }
    if (res.ContentLength !== undefined) {
      headers.set("Content-Length", res.ContentLength.toString());
    }
    if (res.ETag) {
      headers.set("ETag", res.ETag);
    }
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=3600");

    return new NextResponse(null, {
      status: 200,
      headers,
    });
  } catch (err: unknown) {
    if (isR2NotFoundError(err)) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(null, { status: 500 });
  }
}
