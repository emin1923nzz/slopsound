export const FOUNDER_USERNAME = "w3wasem1";

export type BadgeId = "founder" | "year_1" | "year_2" | "year_3" | "year_4" | "year_5";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function userBadges(createdAt: Date, username: string): BadgeId[] {
  const badges: BadgeId[] = [];
  if (username.toLowerCase() === FOUNDER_USERNAME) badges.push("founder");
  const years = Math.floor((Date.now() - createdAt.getTime()) / YEAR_MS);
  for (let year = 1; year <= Math.min(years, 5); year += 1) {
    badges.push(`year_${year}` as BadgeId);
  }
  return badges;
}
