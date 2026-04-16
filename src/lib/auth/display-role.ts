/** Human-readable label for shop_members.role (and related). */
export function formatShopMemberRole(role: string | null | undefined): string {
  if (!role) {
    return "Member";
  }
  if (role === "owner") {
    return "Owner";
  }
  if (role === "staff") {
    return "Staff";
  }
  // Legacy profiles.role value; shop operators are "Staff" in the UI.
  if (role === "admin") {
    return "Staff";
  }
  if (role === "superadmin") {
    return "Super admin";
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}
