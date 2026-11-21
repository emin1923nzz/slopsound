export const FOUNDER_USERNAME = "w3wasem1";
export const OWNER_USERNAME = "emin";
export const OWNER_TAG = "9A6C";

export type BadgeId = "owner" | "founder" | "year_1" | "year_2" | "year_3" | "year_4" | "year_5";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function userBadges(createdAt: Date, username: string, tag?: string): BadgeId[] {
  const badges: BadgeId[] = [];
  if (username.toLowerCase() === OWNER_USERNAME && (!tag || tag.toUpperCase() === OWNER_TAG)) badges.push("owner");
  if (username.toLowerCase() === FOUNDER_USERNAME) badges.push("founder");
  const years = Math.floor((Date.now() - createdAt.getTime()) / YEAR_MS);
  for (let year = 1; year <= Math.min(years, 5); year += 1) {
    badges.push(`year_${year}` as BadgeId);
  }
  return badges;
}
