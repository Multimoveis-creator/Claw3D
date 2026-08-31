import { describe, expect, it } from "vitest";
import { getItemBounds } from "@/features/retro-office/core/geometry";
import {
  astar,
  buildNavGrid,
  getDeskLocations,
} from "@/features/retro-office/core/navigation";
import {
  clearAgentSeatAssignment,
  ensurePersonalOfficeWing,
  getDefaultAgentOfficeMode,
  PERSONAL_OFFICE_SLOTS,
  readAgentSeatAssignment,
  resolvePersonalOfficeSlot,
  writeAgentSeatAssignment,
} from "@/features/retro-office/core/personalOffices";
import type { FurnitureItem } from "@/features/retro-office/core/types";

describe("personal offices", () => {
  it("gives main the executive office and keeps it seated by default", () => {
    expect(resolvePersonalOfficeSlot("main")?.key).toBe("ceo");
    expect(resolvePersonalOfficeSlot("main")?.executive).toBe(true);
    expect(getDefaultAgentOfficeMode("main")).toBe("seated");
    expect(getDefaultAgentOfficeMode("bob")).toBe("roaming");
  });

  it("maps the known local agents to distinct private offices", () => {
    const keys = ["main", "bob", "Obama", "video-director"].map(
      (agentId) => resolvePersonalOfficeSlot(agentId)?.key,
    );
    expect(new Set(keys).size).toBe(4);
    expect(keys).toEqual(["ceo", "office-1", "office-2", "office-3"]);
  });

  it("adds the personal office wing idempotently", () => {
    const once = ensurePersonalOfficeWing([]);
    const twice = ensurePersonalOfficeWing(once);
    expect(once.length).toBeGreaterThan(PERSONAL_OFFICE_SLOTS.length);
    expect(twice).toHaveLength(once.length);
    expect(
      once.some((item) => item.type === "executive_desk"),
    ).toBe(true);
  });

  it("stores and clears a custom seat assignment", () => {
    const agentId = "seat-test-agent";
    clearAgentSeatAssignment(agentId);
    writeAgentSeatAssignment(agentId, {
      x: 420,
      y: 315,
      facing: Math.PI,
      label: "Selected chair",
    });

    expect(readAgentSeatAssignment(agentId)).toEqual({
      x: 420,
      y: 315,
      facing: Math.PI,
      label: "Selected chair",
    });

    clearAgentSeatAssignment(agentId);
    expect(readAgentSeatAssignment(agentId)).toBeNull();
  });
});

describe("retro office navigation", () => {
  it("does not finish a path at a raw point inside blocking furniture", () => {
    const desk: FurnitureItem = {
      _uid: "desk-test",
      type: "desk_cubicle",
      x: 300,
      y: 300,
      w: 100,
      h: 55,
    };
    const grid = buildNavGrid([desk]);
    const requestedTarget = { x: 340, y: 325 };
    const path = astar(200, 325, requestedTarget.x, requestedTarget.y, grid);

    expect(path.length).toBeGreaterThan(0);
    const endpoint = path[path.length - 1];
    expect(endpoint).not.toEqual(requestedTarget);

    const bounds = getItemBounds(desk);
    const endpointInsideDesk =
      endpoint.x >= bounds.x &&
      endpoint.x <= bounds.x + bounds.w &&
      endpoint.y >= bounds.y &&
      endpoint.y <= bounds.y + bounds.h;
    expect(endpointInsideDesk).toBe(false);
  });

  it("keeps desk workstation targets outside the desk body", () => {
    const desk: FurnitureItem = {
      _uid: "desk-workstation-test",
      type: "desk_cubicle",
      x: 300,
      y: 300,
      w: 100,
      h: 55,
    };

    const [workstation] = getDeskLocations([desk]);
    expect(workstation).toEqual({ x: 340, y: 276 });
    expect(workstation.y).toBeLessThan(desk.y);
  });

  it("treats the area immediately beside a desk as clearance, not walkable desk space", () => {
    const desk: FurnitureItem = {
      _uid: "desk-clearance-test",
      type: "desk_cubicle",
      x: 300,
      y: 300,
      w: 100,
      h: 55,
    };
    const grid = buildNavGrid([desk]);
    const requestedTarget = { x: 340, y: 290 };
    const path = astar(200, 290, requestedTarget.x, requestedTarget.y, grid);

    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).not.toEqual(requestedTarget);
  });
});
