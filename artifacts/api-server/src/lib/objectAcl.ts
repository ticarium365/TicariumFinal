import type { StorageObjectLike } from "./storage/types.js";
import { GCS_ACL_METADATA_KEY, R2_ACL_METADATA_KEY } from "./storage/metadata-keys.js";

/** @deprecated GCS ile aynı anahtar adı — import için bırakıldı */
export const ACL_POLICY_METADATA_KEY = GCS_ACL_METADATA_KEY;

export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

function readAclJson(metadata: Record<string, string> | undefined): string | undefined {
  if (!metadata) return undefined;
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    lower[k.toLowerCase()] = v;
  }
  return (
    metadata[GCS_ACL_METADATA_KEY] ??
    metadata[R2_ACL_METADATA_KEY] ??
    lower[GCS_ACL_METADATA_KEY.toLowerCase()] ??
    lower[R2_ACL_METADATA_KEY.toLowerCase()]
  );
}

export async function setObjectAclPolicy(
  objectFile: StorageObjectLike,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  if (!(await objectFile.exists())) {
    throw new Error(`Object not found: ${objectFile.debugName}`);
  }

  await objectFile.setMetadata({
    metadata: {
      [GCS_ACL_METADATA_KEY]: JSON.stringify(aclPolicy),
    },
  });
}

export async function getObjectAclPolicy(
  objectFile: StorageObjectLike,
): Promise<ObjectAclPolicy | null> {
  const meta = await objectFile.getMetadata();
  const aclPolicy = readAclJson(meta.metadata);
  if (!aclPolicy) {
    return null;
  }
  return JSON.parse(aclPolicy) as ObjectAclPolicy;
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: StorageObjectLike;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
