import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PassThrough } from "node:stream";
import { GCS_ACL_METADATA_KEY, R2_ACL_METADATA_KEY } from "./metadata-keys.js";
import type { StorageObjectLike } from "./types.js";

export function r2EnvSummary(): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!process.env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!process.env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!process.env.R2_BUCKET) missing.push("R2_BUCKET");
  if (missing.length) return { ok: false, missing };
  return { ok: true };
}

export function createR2S3Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export async function headR2Bucket(client: S3Client, bucket: string): Promise<void> {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}

/**
 * Süper admin health: bucket + kimlik bilgisi erişilebilir mi?
 */
export async function probeR2Storage(): Promise<
  { ok: true; latencyMs: number; detail: string } | { ok: false; message: string; latencyMs?: number }
> {
  const env = r2EnvSummary();
  if (!env.ok) {
    return {
      ok: false,
      message: `R2 ortam eksik: ${env.missing.join(", ")}`,
    };
  }
  const bucket = process.env.R2_BUCKET!;
  const t = Date.now();
  try {
    const client = createR2S3Client();
    await headR2Bucket(client, bucket);
    return {
      ok: true,
      latencyMs: Date.now() - t,
      detail: `R2 bucket "${bucket}" erişilebilir (HeadBucket OK)`,
    };
  } catch (e: any) {
    return {
      ok: false,
      latencyMs: Date.now() - t,
      message: e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404
        ? "R2 bucket bulunamadı veya ad yanlış"
        : e?.message ?? "R2 HeadBucket başarısız",
    };
  }
}

export async function presignR2PutUrl(
  client: S3Client,
  bucket: string,
  key: string,
  ttlSec: number,
): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, cmd, { expiresIn: ttlSec });
}

export class R2Object implements StorageObjectLike {
  readonly debugName: string;

  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly key: string,
  ) {
    this.debugName = `${bucket}/${key}`;
  }

  async exists(): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }));
      return true;
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound") return false;
      throw e;
    }
  }

  async getMetadata(): Promise<{
    contentType?: string | null;
    size?: string | number | null;
    metadata?: Record<string, string> | undefined;
  }> {
    const out = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }),
    );
    const meta: Record<string, string> = {};
    if (out.Metadata) {
      for (const [k, v] of Object.entries(out.Metadata)) {
        if (v != null) meta[k] = v;
      }
    }
    return {
      contentType: out.ContentType ?? null,
      size: out.ContentLength ?? null,
      metadata: Object.keys(meta).length ? meta : undefined,
    };
  }

  async setMetadata(params: { metadata: Record<string, string> }): Promise<void> {
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }),
    );
    const merged: Record<string, string> = { ...(head.Metadata ?? {}) };
    for (const [k, v] of Object.entries(params.metadata)) {
      if (k === GCS_ACL_METADATA_KEY) {
        merged[R2_ACL_METADATA_KEY] = v;
      } else {
        merged[k] = v;
      }
    }
    delete merged[GCS_ACL_METADATA_KEY];
    const encodedKey = this.key.split("/").map(encodeURIComponent).join("/");
    const copySource = `${this.bucket}/${encodedKey}`;
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        CopySource: copySource,
        MetadataDirective: "REPLACE",
        Metadata: merged,
        ContentType: head.ContentType || "application/octet-stream",
      }),
    );
  }

  createReadStream(): NodeJS.ReadableStream {
    const pass = new PassThrough();
    const client = this.client;
    const bucket = this.bucket;
    const key = this.key;
    void (async () => {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = out.Body as NodeJS.ReadableStream | undefined;
        if (!body) {
          pass.destroy(new Error("R2 GetObject: boş gövde"));
          return;
        }
        body.pipe(pass);
      } catch (e) {
        pass.destroy(e as Error);
      }
    })();
    return pass;
  }
}
