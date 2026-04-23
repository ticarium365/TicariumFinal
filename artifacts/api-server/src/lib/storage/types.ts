/**
 * Taşınabilir object handle — GCS File veya R2 (S3 API) üzerinden aynı yüzey.
 * Route'lar ve ACL bu arayüze bağlı kalır.
 */
export interface StorageObjectLike {
  readonly debugName: string;
  exists(): Promise<boolean>;
  getMetadata(): Promise<{
    contentType?: string | null;
    size?: string | number | null;
    metadata?: Record<string, string> | undefined;
  }>;
  setMetadata(params: { metadata: Record<string, string> }): Promise<void>;
  createReadStream(): NodeJS.ReadableStream;
}
