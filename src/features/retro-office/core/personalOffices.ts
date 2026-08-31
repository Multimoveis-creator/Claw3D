import {
  DOOR_LENGTH,
  DOOR_THICKNESS,
  WALL_THICKNESS,
} from "@/features/retro-office/core/constants";
import { nextUid } from "@/features/retro-office/core/geometry";
import type {
  FacingPoint,
  FurnitureItem,
  FurnitureSeed,
} from "@/features/retro-office/core/types";

export type AgentOfficeMode = "roaming" | "seated";
export type AgentSeatAssignment = FacingPoint & {
  label?: string;
};

export const AGENT_OFFICE_MODE_STORAGE_KEY =
  "claw3d-agent-office-modes-v1";
export const AGENT_OFFICE_MODE_EVENT = "claw3d-agent-office-mode-change";
export const AGENT_SEAT_ASSIGNMENT_STORAGE_KEY =
  "claw3d-agent-seat-assignments-v1";
export const AGENT_SEAT_ASSIGNMENT_EVENT =
  "claw3d-agent-seat-assignment-change";
export const OFFICE_SEAT_LOCATION_EVENT = "claw3d-office-seat-location-click";

const PERSONAL_OFFICE_MARKER_PREFIX = "personal-office:";
// The QA/east wing ends at x=1534. Keeping the private-office wall at x=1600
// leaves a real 66px hallway that an AGENT_RADIUS=20 actor can traverse.
const ROOM_X = 1600;
const ROOM_W = 190;
const ROOM_H = 150;
const ROOM_TOPS = [40, 205, 370, 535] as const;

export type PersonalOfficeSlot = {
  key: "ceo" | "office-1" | "office-2" | "office-3";
  title: string;
  preferredAgentIds: string[];
  seat: FacingPoint;
  executive: boolean;
};

const normalizeAgentId = (value: string) => value.trim().toLowerCase();

const buildRoomFurniture = (params: {
  roomIndex: number;
  executive: boolean;
}): FurnitureSeed[] => {
  const { roomIndex, executive } = params;
  const top = ROOM_TOPS[roomIndex] ?? ROOM_TOPS[ROOM_TOPS.length - 1];
  const bottom = top + ROOM_H;
  const marker = `${PERSONAL_OFFICE_MARKER_PREFIX}${roomIndex}`;
  const doorTop = top + 55;
  const doorBottom = doorTop + DOOR_LENGTH;
  const deskY = top + 82;
  const seatY = top + 62;

  return [
    {
      type: "wall",
      x: ROOM_X,
      y: top,
      w: ROOM_W,
      h: WALL_THICKNESS,
      id: `${marker}:wall-top`,
    },
    {
      type: "wall",
      x: ROOM_X + ROOM_W - WALL_THICKNESS,
      y: top,
      w: WALL_THICKNESS,
      h: ROOM_H,
      id: `${marker}:wall-right`,
    },
    {
      type: "wall",
      x: ROOM_X,
      y: bottom - WALL_THICKNESS,
      w: ROOM_W,
      h: WALL_THICKNESS,
      id: `${marker}:wall-bottom`,
    },
    {
      type: "wall",
      x: ROOM_X,
      y: top,
      w: WALL_THICKNESS,
      h: doorTop - top,
      id: `${marker}:wall-left-top`,
    },
    {
      type: "door",
      x: ROOM_X,
      y: doorTop,
      w: DOOR_LENGTH,
      h: DOOR_THICKNESS,
      facing: 90,
      id: `${marker}:door`,
    },
    {
      type: "wall",
      x: ROOM_X,
      y: doorBottom,
      w: WALL_THICKNESS,
      h: bottom - doorBottom,
      id: `${marker}:wall-left-bottom`,
    },
    {
      type: executive ? "executive_desk" : "table_rect",
      // Keep the desk one navigation cell inside the door so the doorway cell
      // itself stays free. This matters for the executive desk in particular.
      x: 1640,
      y: deskY,
      w: executive ? 130 : 120,
      h: executive ? 65 : 44,
      facing: executive ? 90 : 0,
      id: `${marker}:desk`,
    },
    {
      type: "chair",
      x: 1678,
      y: seatY - 12,
      facing: 180,
      id: `${marker}:chair`,
    },
    {
      type: "computer",
      x: 1672,
      y: deskY - 2,
      id: `${marker}:computer`,
    },
    {
      type: "keyboard",
      x: 1674,
      y: deskY + 12,
      id: `${marker}:keyboard`,
    },
    {
      type: "plant",
      x: 1752,
      y: top + 18,
      id: `${marker}:plant`,
    },
  ];
};

export const PERSONAL_OFFICE_SLOTS: PersonalOfficeSlot[] = [
  {
    key: "ceo",
    title: "Executive Office",
    preferredAgentIds: ["main", "jhow"],
    // Keep the target just above the executive desk's grid cell. Visually this
    // still lands on the chair, but it remains reachable by A*.
    seat: { x: 1690, y: ROOM_TOPS[0] + 59, facing: 0 },
    executive: true,
  },
  {
    key: "office-1",
    title: "Private Office 1",
    preferredAgentIds: ["bob"],
    seat: { x: 1690, y: ROOM_TOPS[1] + 62, facing: 0 },
    executive: false,
  },
  {
    key: "office-2",
    title: "Private Office 2",
    preferredAgentIds: ["obama"],
    seat: { x: 1690, y: ROOM_TOPS[2] + 62, facing: 0 },
    executive: false,
  },
  {
    key: "office-3",
    title: "Private Office 3",
    preferredAgentIds: ["video-director", "video_director", "videodirector"],
    seat: { x: 1690, y: ROOM_TOPS[3] + 62, facing: 0 },
    executive: false,
  },
];

export const PERSONAL_OFFICE_FURNITURE: FurnitureSeed[] =
  PERSONAL_OFFICE_SLOTS.flatMap((slot, roomIndex) =>
    buildRoomFurniture({ roomIndex, executive: slot.executive }),
  );

const stableHash = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const resolvePersonalOfficeSlot = (
  agentId: string,
  fallbackIndex = 0,
): PersonalOfficeSlot | null => {
  if (!agentId || agentId.startsWith("remote:") || agentId.startsWith("janitor:")) {
    return null;
  }

  const normalizedId = normalizeAgentId(agentId);
  const preferred = PERSONAL_OFFICE_SLOTS.find((slot) =>
    slot.preferredAgentIds.some(
      (candidate) => normalizeAgentId(candidate) === normalizedId,
    ),
  );
  if (preferred) return preferred;

  const nonExecutiveSlots = PERSONAL_OFFICE_SLOTS.slice(1);
  if (nonExecutiveSlots.length === 0) return PERSONAL_OFFICE_SLOTS[0] ?? null;
  const index =
    (stableHash(normalizedId) + Math.max(0, fallbackIndex)) %
    nonExecutiveSlots.length;
  return nonExecutiveSlots[index] ?? nonExecutiveSlots[0] ?? null;
};

export const resolvePersonalOfficeSeat = (
  agentId: string,
  fallbackIndex = 0,
): FacingPoint | null =>
  resolvePersonalOfficeSlot(agentId, fallbackIndex)?.seat ?? null;

export const ensurePersonalOfficeWing = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  // These rooms are system-owned furniture. Reconcile matching IDs to the
  // current blueprint instead of only adding missing items; otherwise users
  // who already persisted the old x=1550 layout would never receive geometry
  // fixes on redeploy.
  const seedsById = new Map(
    PERSONAL_OFFICE_FURNITURE.flatMap((seed) =>
      seed.id ? ([[seed.id, seed]] as const) : [],
    ),
  );
  const existingIds = new Set<string>();
  const reconciled = items.map((item) => {
    if (!item.id) return item;
    const seed = seedsById.get(item.id);
    if (!seed) return item;
    existingIds.add(item.id);
    return {
      ...item,
      ...seed,
      _uid: item._uid,
    };
  });

  const missing = PERSONAL_OFFICE_FURNITURE.filter(
    (seed) => !seed.id || !existingIds.has(seed.id),
  );
  return [
    ...reconciled,
    ...missing.map((seed) => ({ ...seed, _uid: nextUid() })),
  ];
};

const isAgentOfficeMode = (value: unknown): value is AgentOfficeMode =>
  value === "roaming" || value === "seated";

const isAgentSeatAssignment = (value: unknown): value is AgentSeatAssignment => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AgentSeatAssignment>;
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    typeof candidate.facing === "number" &&
    Number.isFinite(candidate.facing)
  );
};

let inMemoryModes: Record<string, AgentOfficeMode> | null = null;
let inMemorySeatAssignments: Record<string, AgentSeatAssignment> | null = null;

const loadModes = (): Record<string, AgentOfficeMode> => {
  if (inMemoryModes) return inMemoryModes;
  if (typeof window === "undefined") {
    inMemoryModes = {};
    return inMemoryModes;
  }
  try {
    const raw = window.localStorage.getItem(AGENT_OFFICE_MODE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    inMemoryModes = Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, AgentOfficeMode] =>
        isAgentOfficeMode(entry[1]),
      ),
    );
  } catch {
    inMemoryModes = {};
  }
  return inMemoryModes;
};

const loadSeatAssignments = (): Record<string, AgentSeatAssignment> => {
  if (inMemorySeatAssignments) return inMemorySeatAssignments;
  if (typeof window === "undefined") {
    inMemorySeatAssignments = {};
    return inMemorySeatAssignments;
  }
  try {
    const raw = window.localStorage.getItem(AGENT_SEAT_ASSIGNMENT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    inMemorySeatAssignments = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, AgentSeatAssignment] =>
          isAgentSeatAssignment(entry[1]),
      ),
    );
  } catch {
    inMemorySeatAssignments = {};
  }
  return inMemorySeatAssignments;
};

export const getDefaultAgentOfficeMode = (agentId: string): AgentOfficeMode =>
  normalizeAgentId(agentId) === "main" ? "seated" : "roaming";

export const readAgentOfficeMode = (agentId: string): AgentOfficeMode =>
  loadModes()[agentId] ?? getDefaultAgentOfficeMode(agentId);

export const readAgentSeatAssignment = (
  agentId: string,
): AgentSeatAssignment | null => loadSeatAssignments()[agentId] ?? null;

export const resolveAgentSeat = (
  agentId: string,
  fallbackIndex = 0,
): AgentSeatAssignment | FacingPoint | null =>
  readAgentSeatAssignment(agentId) ?? resolvePersonalOfficeSeat(agentId, fallbackIndex);

export const writeAgentOfficeMode = (
  agentId: string,
  mode: AgentOfficeMode,
): void => {
  const next = { ...loadModes(), [agentId]: mode };
  inMemoryModes = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGENT_OFFICE_MODE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage can be unavailable in hardened/private browser contexts. */
  }
  window.dispatchEvent(
    new CustomEvent(AGENT_OFFICE_MODE_EVENT, {
      detail: { agentId, mode },
    }),
  );
};

export const writeAgentSeatAssignment = (
  agentId: string,
  assignment: AgentSeatAssignment,
): void => {
  const next = { ...loadSeatAssignments(), [agentId]: assignment };
  inMemorySeatAssignments = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AGENT_SEAT_ASSIGNMENT_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    /* ignore hardened/private browser storage failures */
  }
  window.dispatchEvent(
    new CustomEvent(AGENT_SEAT_ASSIGNMENT_EVENT, {
      detail: { agentId, assignment },
    }),
  );
};

export const clearAgentSeatAssignment = (agentId: string): void => {
  const next = { ...loadSeatAssignments() };
  delete next[agentId];
  inMemorySeatAssignments = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AGENT_SEAT_ASSIGNMENT_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    /* ignore hardened/private browser storage failures */
  }
  window.dispatchEvent(
    new CustomEvent(AGENT_SEAT_ASSIGNMENT_EVENT, {
      detail: { agentId, assignment: null },
    }),
  );
};

export const subscribeAgentOfficeMode = (
  agentId: string,
  listener: (mode: AgentOfficeMode) => void,
): (() => void) => {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ agentId?: string; mode?: unknown }>).detail;
    if (detail?.agentId !== agentId || !isAgentOfficeMode(detail.mode)) return;
    listener(detail.mode);
  };
  window.addEventListener(AGENT_OFFICE_MODE_EVENT, handler);
  return () => window.removeEventListener(AGENT_OFFICE_MODE_EVENT, handler);
};
