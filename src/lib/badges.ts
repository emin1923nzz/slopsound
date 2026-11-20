export type BadgeId = "founder" | "year_1" | "year_2" | "year_3" | "year_4" | "year_5";

export const BADGE_LABELS: Record<BadgeId, string> = {
  founder: "Kurucu",
  year_1: "1 Yıllık",
  year_2: "2 Yıllık",
  year_3: "3 Yıllık",
  year_4: "4 Yıllık",
  year_5: "5 Yıllık",
};

export function isBadgeId(value: string): value is BadgeId {
  return value in BADGE_LABELS;
}
