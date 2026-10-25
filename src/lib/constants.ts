// Allowed values for string columns in the Prisma schema, plus display labels.

export const DISCIPLINES = {
  EIGHT_BALL: "8-Ball",
  NINE_BALL: "9-Ball",
  TEN_BALL: "10-Ball",
  STRAIGHT_POOL: "14.1 Straight Pool",
  ONE_POCKET: "One Pocket",
  BLACKBALL: "Blackball",
  SNOOKER: "Snooker",
  CAROM: "Carom",
} as const;
export type Discipline = keyof typeof DISCIPLINES;

export const FORMATS = {
  SINGLE_ELIM: "Single elimination",
  DOUBLE_ELIM: "Double elimination",
  ROUND_ROBIN: "Round robin",
  GROUPS_KO: "Groups + knockout",
} as const;
export type Format = keyof typeof FORMATS;

export const TOURNAMENT_STATUS = {
  DRAFT: "Draft",
  REGISTRATION: "Registration open",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
} as const;
export type TournamentStatus = keyof typeof TOURNAMENT_STATUS;

export const MATCH_STATUS = {
  PENDING: "Waiting",
  READY: "Ready",
  LIVE: "Live",
  COMPLETED: "Finished",
  VOID: "—",
} as const;

export const ROLES = {
  OWNER: "Owner",
  ADMIN: "Admin",
  SCORER: "Scorer",
} as const;
export type Role = keyof typeof ROLES;

// Snooker and carom score frames/points differently, but "race to N frames" covers phase 1.
export const frameWord = (discipline: string) => (discipline === "SNOOKER" ? "frames" : "racks");
