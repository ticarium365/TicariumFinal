import type { File } from "@google-cloud/storage";
import type { StorageObjectLike } from "./types.js";

export function wrapGcsFile(file: File): StorageObjectLike {
  return {
    debugName: file.name,
    async exists() {
      const [ok] = await file.exists();
      return ok;
    },
    async getMetadata() {
      const [meta] = await file.getMetadata();
      return {
        contentType: meta.contentType ?? null,
        size: meta.size ?? null,
        metadata: meta.metadata as Record<string, string> | undefined,
      };
    },
    async setMetadata(params: { metadata: Record<string, string> }) {
      await file.setMetadata({ metadata: params.metadata });
    },
    createReadStream() {
      return file.createReadStream();
    },
  };
}
