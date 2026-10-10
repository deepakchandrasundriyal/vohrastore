/** Shared session state (current admin + sidebar badge counts). */
export const session = {
  user: null,
  badges: null,
  onBadges: () => {},
  refreshBadges: async () => {},
  get isAdmin() { return this.user?.role === 'admin'; },
};
