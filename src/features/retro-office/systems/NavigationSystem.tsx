import {
  AGENT_RADIUS,
  BUMP_FREEZE_MS,
  SEPARATION_STRENGTH,
  WALK_SPEED,
} from "@/features/retro-office/core/constants";
import {
  isRemoteOfficeAgentId,
  REMOTE_ROAM_POINTS,
} from "@/features/retro-office/core/district";
import {
  astar,
  buildNavGrid,
  ROAM_POINTS,
  type NavGrid,
} from "@/features/retro-office/core/navigation";
import {
  readAgentOfficeMode,
  resolveAgentSeat,
} from "@/features/retro-office/core/personalOffices";
import { loadActiveFurniture } from "@/features/retro-office/core/persistence";
import type { RenderAgent } from "@/features/retro-office/core/types";
import { syncAgentOfficeModePanel } from "@/features/retro-office/systems/AgentOfficeModePanel";

type ApplyAgentCollisionBumpsArgs = {
  agents: RenderAgent[];
  now: number;
};

type SeatRouteState = {
  signature: string;
  finalPoint: { x: number; y: number };
  waypoints: { x: number; y: number }[];
  plannedWithGrid: boolean;
};

const SEAT_ARRIVAL_DISTANCE = 8;
const SEAT_WALK_STEP = Math.max(0.65, WALK_SPEED * 2.1);
const seatRoutesByAgentId = new Map<string, SeatRouteState>();
let cachedNavGrid: { grid: NavGrid; expiresAt: number } | null = null;

const getActiveNavGrid = (now: number): NavGrid | null => {
  if (cachedNavGrid && cachedNavGrid.expiresAt > now) {
    return cachedNavGrid.grid;
  }
  const furniture = loadActiveFurniture();
  if (!furniture || furniture.length === 0) {
    cachedNavGrid = null;
    return null;
  }
  const grid = buildNavGrid(furniture);
  cachedNavGrid = { grid, expiresAt: now + 750 };
  return grid;
};

const hasExplicitOfficeInteraction = (agent: RenderAgent) =>
  agent.interactionTarget !== undefined ||
  agent.pingPongUntil !== undefined ||
  agent.state === "working_out" ||
  agent.state === "dancing" ||
  agent.state === "away";

const getOrCreateSeatRoute = (
  agent: RenderAgent,
  seat: { x: number; y: number; facing: number },
  now: number,
): SeatRouteState => {
  const signature = `${seat.x.toFixed(2)}:${seat.y.toFixed(2)}:${seat.facing.toFixed(4)}`;
  const existing = seatRoutesByAgentId.get(agent.id);
  const grid = getActiveNavGrid(now);
  if (
    existing?.signature === signature &&
    (existing.plannedWithGrid || !grid)
  ) {
    return existing;
  }

  const planned = grid
    ? astar(agent.x, agent.y, seat.x, seat.y, grid)
    : [{ x: seat.x, y: seat.y }];
  const plannedWithGrid = Boolean(grid && planned.length > 0);
  const fallback = { x: seat.x, y: seat.y };
  const finalPoint =
    planned[planned.length - 1] ??
    (grid ? { x: agent.x, y: agent.y } : fallback);
  const route: SeatRouteState = {
    signature,
    finalPoint,
    waypoints:
      planned.length > 0 ? [...planned] : grid ? [] : [fallback],
    plannedWithGrid,
  };
  seatRoutesByAgentId.set(agent.id, route);
  return route;
};

const applyPersonalOfficeModes = (
  agents: RenderAgent[],
  now: number,
): RenderAgent[] =>
  agents.map((agent, index) => {
    if ("role" in agent && agent.role === "janitor") return agent;
    if (isRemoteOfficeAgentId(agent.id)) return agent;
    if (readAgentOfficeMode(agent.id) !== "seated") {
      seatRoutesByAgentId.delete(agent.id);
      return agent;
    }

    // Explicit office interactions temporarily win over a manual seat. As soon
    // as the interaction ends the route to the assigned seat resumes.
    if (hasExplicitOfficeInteraction(agent)) return agent;

    const seat = resolveAgentSeat(agent.id, index);
    if (!seat) return agent;
    const route = getOrCreateSeatRoute(agent, seat, now);
    const finalDistance = Math.hypot(
      route.finalPoint.x - agent.x,
      route.finalPoint.y - agent.y,
    );

    if (finalDistance <= SEAT_ARRIVAL_DISTANCE) {
      route.waypoints = [];
      return {
        ...agent,
        x: route.finalPoint.x,
        y: route.finalPoint.y,
        targetX: route.finalPoint.x,
        targetY: route.finalPoint.y,
        path: [],
        facing: seat.facing,
        state: "sitting",
        bumpedUntil: undefined,
        bumpTalkUntil: undefined,
        collisionCooldownUntil: undefined,
      };
    }

    while (route.waypoints.length > 1) {
      const waypoint = route.waypoints[0];
      if (!waypoint) break;
      if (Math.hypot(waypoint.x - agent.x, waypoint.y - agent.y) > SEAT_WALK_STEP * 1.5) {
        break;
      }
      route.waypoints.shift();
    }

    const waypoint = route.waypoints[0] ?? route.finalPoint;
    const dx = waypoint.x - agent.x;
    const dy = waypoint.y - agent.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.min(SEAT_WALK_STEP, distance || SEAT_WALK_STEP);
    const nextX = distance > 0 ? agent.x + (dx / distance) * step : agent.x;
    const nextY = distance > 0 ? agent.y + (dy / distance) * step : agent.y;

    if (distance <= SEAT_WALK_STEP && route.waypoints.length > 0) {
      route.waypoints.shift();
    }

    return {
      ...agent,
      x: nextX,
      y: nextY,
      targetX: route.finalPoint.x,
      targetY: route.finalPoint.y,
      path: [...route.waypoints],
      facing: distance > 0 ? Math.atan2(dx, dy) : seat.facing,
      state: "walking",
      bumpedUntil: undefined,
      bumpTalkUntil: undefined,
      collisionCooldownUntil: undefined,
    };
  });

export function applyAgentCollisionBumps({
  agents,
  now,
}: ApplyAgentCollisionBumpsArgs): RenderAgent[] {
  const moved = applyPersonalOfficeModes(agents, now);
  syncAgentOfficeModePanel(moved);
  const collisionCellSize = AGENT_RADIUS * 4;
  const collisionBuckets = new Map<string, number[]>();
  for (let index = 0; index < moved.length; index += 1) {
    const agent = moved[index];
    if ("role" in agent && agent.role === "janitor") continue;
    const bucketKey = `${Math.floor(agent.x / collisionCellSize)}:${Math.floor(
      agent.y / collisionCellSize,
    )}`;
    const bucket = collisionBuckets.get(bucketKey);
    if (bucket) bucket.push(index);
    else collisionBuckets.set(bucketKey, [index]);
  }

  for (let i = 0; i < moved.length; i += 1) {
    const mi = moved[i];
    if ("role" in mi && mi.role === "janitor") continue;
    const seatControlled =
      !isRemoteOfficeAgentId(mi.id) &&
      readAgentOfficeMode(mi.id) === "seated" &&
      !hasExplicitOfficeInteraction(mi);
    if (seatControlled) continue;
    if (
      moved[i].state === "sitting" ||
      moved[i].state === "working_out" ||
      moved[i].state === "dancing"
    )
      continue;
    if (moved[i].pingPongUntil !== undefined && moved[i].state !== "walking")
      continue;
    if (moved[i].bumpedUntil !== undefined) continue;
    if ((moved[i].collisionCooldownUntil ?? 0) > now) continue;
    let sx = 0,
      sy = 0,
      fx = 0,
      fy = 0;
    const bucketX = Math.floor(mi.x / collisionCellSize);
    const bucketY = Math.floor(mi.y / collisionCellSize);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const bucket = collisionBuckets.get(
          `${bucketX + offsetX}:${bucketY + offsetY}`,
        );
        if (!bucket) continue;
        for (const j of bucket) {
          if (i === j) continue;
          const mj = moved[j];
          if ("role" in mj && mj.role === "janitor") continue;
          let ddx = moved[i].x - moved[j].x;
          let ddy = moved[i].y - moved[j].y;
          const d = Math.hypot(ddx, ddy);
          const minDist = AGENT_RADIUS * 2;
          if (d < minDist) {
            if (d === 0) {
              ddx = Math.random() - 0.5;
              ddy = Math.random() - 0.5;
            }
            const effD = Math.max(d, 0.01);
            const effNorm = Math.hypot(ddx, ddy) || 1;
            const push = (1 - effD / minDist) * SEPARATION_STRENGTH;
            sx += (ddx / effNorm) * push;
            sy += (ddy / effNorm) * push;
            fx += (-ddx / effNorm) * push;
            fy += (-ddy / effNorm) * push;
          }
        }
      }
    }
    if (sx === 0 && sy === 0) continue;
    const pushMag = Math.hypot(sx, sy);
    const norm = pushMag || 1;
    let bestDot = -Infinity;
    const roamCandidates = isRemoteOfficeAgentId(moved[i].id)
      ? REMOTE_ROAM_POINTS
      : ROAM_POINTS;
    let escapeTarget = roamCandidates[0];
    for (const rp of roamCandidates) {
      const rdx = rp.x - moved[i].x,
        rdy = rp.y - moved[i].y;
      const rdist = Math.hypot(rdx, rdy) || 1;
      const dot = (rdx / rdist) * (sx / norm) + (rdy / rdist) * (sy / norm);
      if (dot > bestDot) {
        bestDot = dot;
        escapeTarget = rp;
      }
    }
    moved[i] = {
      ...moved[i],
      facing: Math.atan2(fx || sx, fy || sy),
      state: "standing",
      path: [],
      targetX: escapeTarget.x,
      targetY: escapeTarget.y,
      bumpedUntil: now + BUMP_FREEZE_MS,
      bumpTalkUntil: now + BUMP_FREEZE_MS,
    };
  }

  return moved;
}
