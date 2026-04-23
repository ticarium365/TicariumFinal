/** `/bucketName/object/key...` → bucket + key (Replit/GCS ve R2 path-style ile uyumlu) */
export function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  let p = path;
  if (!p.startsWith("/")) {
    p = `/${p}`;
  }
  const pathParts = p.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1]!;
  const objectName = pathParts.slice(2).join("/");
  return { bucketName, objectName };
}

export function withTrailingSlash(dir: string): string {
  return dir.endsWith("/") ? dir : `${dir}/`;
}
