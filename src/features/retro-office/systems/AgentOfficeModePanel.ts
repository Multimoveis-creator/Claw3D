import {
  readAgentOfficeMode,
  resolvePersonalOfficeSlot,
  writeAgentOfficeMode,
  type AgentOfficeMode,
} from "@/features/retro-office/core/personalOffices";
import type { RenderAgent } from "@/features/retro-office/core/types";

const PANEL_ID = "claw3d-agent-office-mode-panel";
const PANEL_COLLAPSED_KEY = "claw3d-agent-office-mode-panel-collapsed-v1";

let lastSignature = "";
let lastSyncAt = 0;
let cleanupTimerStarted = false;

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
    right: "16px",
    bottom: "16px",
    zIndex: "70",
    width: "min(330px, calc(100vw - 32px))",
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
  });
  shell.appendChild(body);

  for (let index = 0; index < agents.length; index += 1) {
    const agent = agents[index];
    const mode = readAgentOfficeMode(agent.id);
    const slot = resolvePersonalOfficeSlot(agent.id, index);
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
    office.textContent = slot?.title ?? "Shared office";
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
    });
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
  agents
    .map(
      (agent) =>
        `${agent.id}:${agent.name}:${readAgentOfficeMode(agent.id)}`,
    )
    .join("|");

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
  startCleanupTimer();

  const visibleAgents = agents.filter(
    (agent) =>
      !("role" in agent && agent.role === "janitor") &&
      !agent.id.startsWith("remote:"),
  );
  if (visibleAgents.length === 0) {
    document.getElementById(PANEL_ID)?.remove();
    lastSignature = "";
    return;
  }

  const signature = buildSignature(visibleAgents);
  if (signature === lastSignature && document.getElementById(PANEL_ID)) return;
  lastSignature = signature;
  renderPanel(visibleAgents);
};

export const setAgentOfficeMode = (
  agentId: string,
  mode: AgentOfficeMode,
): void => {
  writeAgentOfficeMode(agentId, mode);
  lastSignature = "";
};
