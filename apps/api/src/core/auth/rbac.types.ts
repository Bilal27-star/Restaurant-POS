/**
 * RBAC contracts. Implementations live in the auth module (policy + role resolver).
 */
export type PermissionCode = string;

export type RoleBinding = {
  roleId: string;
  permissionCodes: PermissionCode[];
};

export interface TenantAuthorizationContext {
  tenantId: string;
  userId: string;
  roles: RoleBinding[];
}

export interface AuthorizationService {
  assertPermission(ctx: TenantAuthorizationContext, permission: PermissionCode): Promise<void>;
}
