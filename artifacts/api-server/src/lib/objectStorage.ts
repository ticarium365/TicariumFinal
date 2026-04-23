import { Storage } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl.js";
import { isR2Storage } from "./storage/driver.js";
import { parseObjectPath, withTrailingSlash } from "./storage/path-utils.js";
import { wrapGcsFile } from "./storage/gcs-file.js";
import { createR2S3Client, presignR2PutUrl, R2Object } from "./storage/r2.js";
import type { StorageObjectLike } from "./storage/types.js";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

let replitStorageSingleton: Storage | null = null;

function getReplitStorage(): Storage {
  if (!replitStorageSingleton) {
    replitStorageSingleton = new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
        type: "external_account",
        credential_source: {
          url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
          format: {
            type: "json",
            subject_token_field_name: "access_token",
          },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });
  }
  return replitStorageSingleton;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );
    if (paths.length === 0) {
      if (isR2Storage() && process.env.R2_BUCKET) {
        return [`/${process.env.R2_BUCKET}/public`];
      }
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Comma-separated paths, e.g. '/<bucket>/public' (same layout as PRIVATE_OBJECT_DIR).",
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = (process.env.PRIVATE_OBJECT_DIR || "").trim();
    if (dir) return dir;
    if (isR2Storage() && process.env.R2_BUCKET) {
      return `/${process.env.R2_BUCKET}/private`;
    }
    throw new Error(
      "PRIVATE_OBJECT_DIR not set. For R2: omit to default to /<R2_BUCKET>/private, or set explicitly e.g. '/my-bucket/private'.",
    );
  }

  async searchPublicObject(filePath: string): Promise<StorageObjectLike | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      if (isR2Storage()) {
        const client = createR2S3Client();
        const obj = new R2Object(client, bucketName, objectName);
        if (await obj.exists()) {
          return obj;
        }
      } else {
        const bucket = getReplitStorage().bucket(bucketName);
        const file = bucket.file(objectName);
        const [exists] = await file.exists();
        if (exists) {
          return wrapGcsFile(file);
        }
      }
    }
    return null;
  }

  async downloadObject(file: StorageObjectLike, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata, aclPolicy] = await Promise.all([
      file.getMetadata(),
      getObjectAclPolicy(file),
    ]);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size != null && metadata.size !== "") {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    if (isR2Storage()) {
      const client = createR2S3Client();
      return presignR2PutUrl(client, bucketName, objectName, 900);
    }

    return signReplitSidecarUrl({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<StorageObjectLike> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);

    if (isR2Storage()) {
      const client = createR2S3Client();
      const obj = new R2Object(client, bucketName, objectName);
      if (!(await obj.exists())) {
        throw new ObjectNotFoundError();
      }
      return obj;
    }

    const bucket = getReplitStorage().bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return wrapGcsFile(objectFile);
  }

  /**
   * İmzalı yükleme URL'sinden iç `/objects/...` yolunu çıkarır.
   * Path-style R2 (`/bucket/key/...`) ve eski GCS URL'leri ile uyumlu.
   */
  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("http://") && !rawPath.startsWith("https://")) {
      return rawPath;
    }

    let url: URL;
    try {
      url = new URL(rawPath);
    } catch {
      return rawPath;
    }

    let pathname = url.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      /* keep pathname */
    }

    const entityDir = withTrailingSlash(this.getPrivateObjectDir());
    if (pathname.startsWith(entityDir)) {
      const entityId = pathname.slice(entityDir.length);
      return `/objects/${entityId}`;
    }

    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageObjectLike;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

async function signReplitSidecarUrl({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit (STORAGE_DRIVER=replit)`,
    );
  }

  const { signed_url: signedURL } = (await response.json()) as { signed_url: string };
  return signedURL;
}
