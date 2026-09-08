// Keep the Users table colours aligned with the four official MERL roles.
// Unknown or retired roles receive no special styling.
export const ADMIN_USER_ROLE_TONES = Object.freeze({
  system_admin: 'admin',
  docc_me_officer: 'meo',
  project_manager: 'manager',
  viewer: 'viewer',
});

export function userRoleTone(role) {
  return Object.prototype.hasOwnProperty.call(ADMIN_USER_ROLE_TONES, role)
    ? ADMIN_USER_ROLE_TONES[role]
    : null;
}
