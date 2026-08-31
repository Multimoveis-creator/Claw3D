import {
  getItemBaseSize,
  getItemRotationRadians,
} from "@/features/retro-office/core/geometry";
import {
  clearAgentSeatAssignment,
  OFFICE_SEAT_LOCATION_EVENT,
  readAgentOfficeMode,
  readAgentSeatAssignment,
  resolvePersonalOfficeSlot,
  writeAgentOfficeMode,
  writeAgentSeatAssignment,
  type AgentOfficeMode,
  type AgentSeatAssignment,
} from "@/features/retro-office/core/personalOffices";
import { loadActiveFurniture } from "@/features/retro-office/core/persistence";
import type { RenderAgent } from "@/features/retro-office/core/types";

const PANEL_ID = "claw3d-agent-office-mode-panel";
const PANEL_COLLAPSED_KEY = "claw3d-agent-office-mode-panel-collapsed-v1";
const CHAIR_SNAP_DISTANCE = 55;

let lastSignature = "";
let lastSyncAt = 0;
let cleanupTimerStarted = false;
let seatLocationListenerStarted = false;
let latestAgents: RenderAgent[] = [];
let waitingForSeatLocation = false;
let pendingSeatLocation: { x: number; y: number } | null = null;

const setStyles = (element: HTMLElement, styles: Partial<CSSStyleDeclaration>) => {
  Object.assign(element.style, styles);
};

const createButton = (
  label: string,
  active: boolean,
  onClick: () => void,
): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-pressed", active ? "true" : "false");
  setStyles(button, {
    border: active ? "1px solid rgba(251,191,36,.62)" : "1px solid rgba(146,64,14,.45)",
    background: active ? "rgba(245,158,11,.18)" : "rgba(0,0,0,.24)",
    color: active ? "#fde68a" : "#d6d3d1",
    borderRadius: "7px",
    padding: "5px 8px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "10px",
    lineHeight: "1",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
};

const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(PANEL_COLLAPSED_KEY) !== "0";
  } catch {
    return true;
  }
};

const writeCollapsed = (collapsed: boolean) => {
  try {
    window.localStorage.setItem(PANEL_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
};

const resolveSeatTarget = (
  point: { x: number; y: number },
  agent: RenderAgent,
): AgentSeatAssignment => {
  const furniture = loadActiveFurniture() ?? [];
  const chairs = furniture.filter((item) => item.type === "chair");
  let nearestChair: (typeof chairs)[number] | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const chair of chairs) {
    const { width, height } = getItemBaseSize(chair);
    const centerX = chair.x + width / 2;
    const centerY = chair.y + height / 2;
    const distance = Math.hypot(point.x - centerX, point.y - centerY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestChair = chair;
    }
  }

  if (nearestChair && nearestDistance <= CHAIR_SNAP_DISTANCE) {
    const { width, height } = getItemBaseSize(nearestChair);
    return {
      x: nearestChair.x + width / 2,
      y: nearestChair.y + height / 2,
      facing: getItemRotationRadians(nearestChair),
      label: "Selected chair",
    };
  }

  return {
    x: point.x,
    y: point.y,
    facing: agent.facing,
    label: "Selected spot",
  };
};

const finishSeatAssignment = (agentId: string) => {
  if (!pendingSeatLocation) return;
  const agent = latestAgents.find((candidate) => candidate.id === agentId);
  if (!agent) return;
  const assignment = resolveSeatTarget(pendingSeatLocation, agent);
  writeAgentSeatAssignment(agentId, assignment);
  writeAgentOfficeMode(agentId, "seated");
  pendingSeatLocation = null;
  waitingForSeatLocation = false;
  lastSignature = "";
};

const startSeatLocationListener = () => {
  if (seatLocationListenerStarted || typeof window === "undefined") return;
  seatLocationListenerStarted = true;
  window.addEventListener(OFFICE_SEAT_LOCATION_EVENT, (event) => {
    if (!waitingForSeatLocation) return;
    const detail = (event as CustomEvent<{ x?: unknown; y?: unknown }>).detail;
    if (
      typeof detail?.x !== "number" ||
      !Number.isFinite(detail.x) ||
      typeof detail?.y !== "number" ||
      !Number.isFinite(detail.y)
    ) {
      return;
    }
    pendingSeatLocation = { x: detail.x, y: detail.y };
    waitingForSeatLocation = false;
    writeCollapsed(false);
    lastSignature = "";
  });
};

const renderSeatPicker = (body: HTMLDivElement, agents: RenderAgent[]) => {
  const picker = document.createElement("div");
  setStyles(picker, {
    border: "1px solid rgba(251,191,36,.36)",
    background: "rgba(120,53,15,.16)",
    borderRadius: "10px",
    padding: "9px",
  });

  const title = document.createElement("div");
  title.textContent = waitingForSeatLocation
    ? "Click a chair or a spot in the office"
    : "Choose which agent sits here";
  setStyles(title, {
    color: "#fde68a",
    fontSize: "11px",
    fontWeight: "700",
  });
  picker.appendChild(title);

  const hint = document.createElement("div");
  hint.textContent = waitingForSeatLocation
    ? "The closest chair will be selected automatically."
    : "The agent will walk to this location and sit down.";
  setStyles(hint, {
    color: "#a8a29e",
    fontSize: "9px",
    marginTop: "3px",
  });
  picker.appendChild(hint);

  if (pendingSeatLocation) {
    const agentButtons = document.createElement("div");
    setStyles(agentButtons, {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      marginTop: "8px",
    });
    for (const agent of agents) {
      agentButtons.appendChild(
        createButton(agent.name || agent.id, false, () => finishSeatAssignment(agent.id)),
      );
    }
    picker.appendChild(agentButtons);
  }

  const cancel = createButton("Cancel", false, () => {
    waitingForSeatLocation = false;
    pendingSeatLocation = null;
    lastSignature = "";
  });
  cancel.style.marginTop = "8px";
  picker.appendChild(cancel);
  body.appendChild(picker);
};

const renderPanel = (agents: RenderAgent[]) => {
  let root = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = PANEL_ID;
    document.body.appendChild(root);
  }

  root.replaceChildren();
  setStyles(root, {
    position: "fixed",
    left: "50%",
    right: "auto",
    bottom: "16px",
    transform: "translateX(-50%)",
    zIndex: "25",
    width: "min(360px, calc(100vw - 32px))",
    color: "#f5f5f4",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    pointerEvents: "auto",
  });

  const shell = document.createElement("div");
  setStyles(shell, {
    border: "1px solid rgba(146,64,14,.42)",
    background: "rgba(18,14,8,.95)",
    borderRadius: "14px",
    boxShadow: "0 18px 44px rgba(0,0,0,.36)",
    backdropFilter: "blur(10px)",
    overflow: "hidden",
  });
  root.appendChild(shell);

  const collapsed = readCollapsed();
  const header = document.createElement("button");
  header.type = "button";
  header.setAttribute("aria-expanded", collapsed ? "false" : "true");
  setStyles(header, {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    border: "0",
    background: "transparent",
    color: "#fde68a",
    padding: "10px 12px",
    cursor: "pointer",
    textAlign: "left",
  });

  const title = document.createElement("span");
  title.textContent = "Office modes";
  setStyles(title, {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: ".14em",
  });
  header.appendChild(title);

  const summary = document.createElement("span");
  const seatedCount = agents.filter(
    (agent) => readAgentOfficeMode(agent.id) === "seated",
  ).length;
  summary.textContent = collapsed
    ? `${seatedCount} seated · ${agents.length - seatedCount} walking`
    : "−";
  setStyles(summary, {
    color: "#a8a29e",
    fontSize: "10px",
    whiteSpace: "nowrap",
  });
  header.appendChild(summary);
  header.addEventListener("click", () => {
    writeCollapsed(!collapsed);
    lastSignature = "";
  });
  shell.appendChild(header);

  if (collapsed) return;

  const body = document.createElement("div");
  setStyles(body, {
    display: "grid",
    gap: "7px",
    borderTop: "1px solid rgba(146,64,14,.26)",
    padding: "9px",
    maxHeight: "min(480px, calc(100vh - 120px))",
    overflowY: "auto",
  });
  shell.appendChild(body);

  const assignSeatButton = createButton(
    waitingForSeatLocation || pendingSeatLocation !== null
      ? "Picking seat…"
      : "Assign seat",
    waitingForSeatLocation || pendingSeatLocation !== null,
    () => {
      waitingForSeatLocation = true;
      pendingSeatLocation = null;
      lastSignature = "";
    },
  );
  assignSeatButton.style.justifySelf = "start";
  body.appendChild(assignSeatButton);

  if (waitingForSeatLocation || pendingSeatLocation) {
    renderSeatPicker(body, agents);
  }

  for (let index = 0; index < agents.length; index += 1) {
    const agent = agents[index];
    const mode = readAgentOfficeMode(agent.id);
    const slot = resolvePersonalOfficeSlot(agent.id, index);
    const customSeat = readAgentSeatAssignment(agent.id);
    const row = document.createElement("div");
    setStyles(row, {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      alignItems: "center",
      gap: "9px",
      border: "1px solid rgba(120,53,15,.24)",
      background: "rgba(0,0,0,.16)",
      borderRadius: "10px",
      padding: "8px 9px",
    });

    const identity = document.createElement("div");
    identity.style.minWidth = "0";
    const name = document.createElement("div");
    name.textContent = agent.name || agent.id;
    setStyles(name, {
      color: "#f5f5f4",
      fontSize: "12px",
      fontWeight: "600",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    identity.appendChild(name);

    const office = document.createElement("div");
    office.textContent = customSeat?.label ?? slot?.title ?? "Shared office";
    setStyles(office, {
      color: agent.id.toLowerCase() === "main" ? "#fbbf24" : "#a8a29e",
      fontSize: "9px",
      marginTop: "2px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    identity.appendChild(office);
    row.appendChild(identity);

    const controls = document.createElement("div");
    setStyles(controls, {
      display: "flex",
      gap: "5px",
      flexWrap: "wrap",
      justifyContent: "flex-end",
    });
    if (customSeat) {
      controls.appendChild(
        createButton("Home", false, () => {
          clearAgentSeatAssignment(agent.id);
          writeAgentOfficeMode(agent.id, "seated");
          lastSignature = "";
        }),
      );
    }
    controls.appendChild(
      createButton("Sit", mode === "seated", () => {
        writeAgentOfficeMode(agent.id, "seated");
        lastSignature = "";
      }),
    );
    controls.appendChild(
      createButton("Walk", mode === "roaming", () => {
        writeAgentOfficeMode(agent.id, "roaming");
        lastSignature = "";
      }),
    );
    row.appendChild(controls);
    body.appendChild(row);
  }
};

const buildSignature = (agents: RenderAgent[]): string =>
  [
    waitingForSeatLocation ? "waiting" : "idle",
    pendingSeatLocation
      ? `${Math.round(pendingSeatLocation.x)}:${Math.round(pendingSeatLocation.y)}`
      : "none",
    ...agents.map((agent) => {
      const seat = readAgentSeatAssignment(agent.id);
      return `${agent.id}:${agent.name}:${readAgentOfficeMode(agent.id)}:${seat?.x ?? ""}:${seat?.y ?? ""}`;
    }),
  ].join("|");

const startCleanupTimer = () => {
  if (cleanupTimerStarted || typeof window === "undefined") return;
  cleanupTimerStarted = true;
  window.setInterval(() => {
    if (Date.now() - lastSyncAt < 2_500) return;
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
    lastSignature = "";
  }, 2_000);
};

export const syncAgentOfficeModePanel = (agents: RenderAgent[]): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  lastSyncAt = Date.now();
  latestAgents = agents.filter(
    (agent) =>
      !("role" in agent && agent.role === "janitor") &&
      !agent.id.startsWith("remote:"),
  );
  startCleanupTimer();
  startSeatLocationListener();

  if (latestAgents.length === 0) {
    document.getElementById(PANEL_ID)?.remove();
    lastSignature = "";
    return;
  }

  const signature = buildSignature(latestAgents);
  if (signature === lastSignature && document.getElementById(PANEL_ID)) return;
  lastSignature = signature;
  renderPanel(latestAgents);
};

export const setAgentOfficeMode = (
  agentId: string,
  mode: AgentOfficeMode,
): void => {
  writeAgentOfficeMode(agentId, mode);
  lastSignature = "";
};
