import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProviderCost = {
  today: number | null;
  month: number | null;
  balance: number | null;
};

type CostSummary = {
  currency: string;
  updated_at: string;
  providers: {
    openrouter: ProviderCost;
    elevenlabs: ProviderCost;
    fal: ProviderCost;
  };
  total_today: number | null;
  total_month: number | null;
};

type CacheEntry = {
  expiresAt: number;
  data: CostSummary;
};

let cacheEntry: CacheEntry | null = null;
let inFlightRequest: Promise<CostSummary> | null = null;

const EMPTY_PROVIDER: ProviderCost = {
  today: null,
  month: null,
  balance: null,
};

const toHttpGatewayUrl = (raw: string): string => {
  const value = raw.trim();
  if (!value) return "";
  const parsed = new URL(value);
  if (parsed.protocol === "ws:") parsed.protocol = "http:";
  if (parsed.protocol === "wss:") parsed.protocol = "https:";
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("OpenClaw gateway URL must use http, https, ws, or wss.");
  }
  return parsed.toString().replace(/\/$/, "");
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/[^0-9,.-]/g, "")
    .replace(/,(?=\d{1,2}$)/, ".")
    .replace(/,/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const firstNumber = (record: Record<string, unknown> | null, keys: string[]) => {
  if (!record) return null;
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
};

const normalizeProvider = (value: unknown): ProviderCost => {
  const record = asRecord(value);
  if (!record) return { ...EMPTY_PROVIDER };
  return {
    today: firstNumber(record, ["today", "daily", "today_cost", "cost_today", "current_day", "day"]),
    month: firstNumber(record, ["month", "monthly", "month_cost", "cost_month", "current_month", "mtd"]),
    balance: firstNumber(record, ["balance", "credits", "remaining_balance", "remaining", "credit_balance"]),
  };
};

const sumKnown = (values: Array<number | null>): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
};

const parseAssistantJson = (content: string): unknown => {
  const withoutFence = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("OpenClaw did not return a JSON object for AI costs.");
  }
  return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1)) as unknown;
};

const normalizeSummary = (value: unknown): CostSummary => {
  const root = asRecord(value) ?? {};
  const providers = asRecord(root.providers) ?? root;
  const openrouter = normalizeProvider(providers.openrouter ?? providers.open_router ?? providers["openrouter.ai"]);
  const elevenlabs = normalizeProvider(providers.elevenlabs ?? providers.eleven_labs ?? providers["elevenlabs.io"]);
  const fal = normalizeProvider(providers.fal ?? providers.falai ?? providers.fal_ai ?? providers["fal.ai"]);
  const currency = typeof root.currency === "string" && root.currency.trim() ? root.currency.trim().toUpperCase() : "USD";
  const updatedAt = typeof root.updated_at === "string" && root.updated_at.trim() ? root.updated_at.trim() : new Date().toISOString();

  return {
    currency,
    updated_at: updatedAt,
    providers: { openrouter, elevenlabs, fal },
    total_today: toNumber(root.total_today) ?? sumKnown([openrouter.today, elevenlabs.today, fal.today]),
    total_month: toNumber(root.total_month) ?? sumKnown([openrouter.month, elevenlabs.month, fal.month]),
  };
};

const buildPrompt = () => {
  const timezone = process.env.CLAW3D_COSTS_TIMEZONE?.trim() || "America/Sao_Paulo";
  return [
    "Você está alimentando o painel interno AI Cost Center do Claw3D.",
    "Use os plugins/ferramentas de custos já instalados neste OpenClaw para consultar OpenRouter, ElevenLabs e FAL.ai.",
    `Considere hoje e o mês atual no fuso ${timezone}.`,
    "Consulte valores reais. Não estime custos a partir desta conversa e não invente números.",
    "Quando o provedor disponibilizar saldo/créditos remanescentes, inclua balance; caso contrário use null.",
    "Responda SOMENTE com JSON válido, sem markdown, explicações ou texto adicional, exatamente neste formato:",
    JSON.stringify({
      currency: "USD",
      updated_at: "ISO-8601",
      providers: {
        openrouter: { today: null, month: null, balance: null },
        elevenlabs: { today: null, month: null, balance: null },
        fal: { today: null, month: null, balance: null },
      },
      total_today: null,
      total_month: null,
    }, null, 2),
    "Use números JSON (sem símbolo de moeda) ou null.",
  ].join("\n");
};

const extractOpenClawError = (text: string, status: number): string => {
  const fallback = `OpenClaw costs request failed with HTTP ${status}.`;
  if (!text.trim()) return fallback;
  try {
    const payload = JSON.parse(text) as unknown;
    const root = asRecord(payload);
    const error = asRecord(root?.error);
    const message =
      (typeof error?.message === "string" && error.message.trim()) ||
      (typeof root?.message === "string" && root.message.trim()) ||
      "";
    return message ? `${fallback} ${message}` : fallback;
  } catch {
    const compact = text.replace(/\s+/g, " ").trim().slice(0, 240);
    return compact ? `${fallback} ${compact}` : fallback;
  }
};

const getTimeoutMs = () => {
  const raw = Number(process.env.CLAW3D_COSTS_TIMEOUT_MS ?? "180000");
  if (!Number.isFinite(raw)) return 180_000;
  return Math.max(30_000, Math.min(300_000, raw));
};

const fetchCostSummary = async (): Promise<CostSummary> => {
  const gatewayRaw = process.env.CLAW3D_COSTS_OPENCLAW_URL?.trim() || process.env.CLAW3D_GATEWAY_URL?.trim() || "";
  const token = process.env.CLAW3D_GATEWAY_TOKEN?.trim() || process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || "";
  const backendModelOverride = process.env.CLAW3D_COSTS_MODEL?.trim() || "";
  const agentId = process.env.CLAW3D_COSTS_AGENT_ID?.trim() || "main";
  const agentModel = agentId === "default" ? "openclaw/default" : `openclaw/${agentId}`;

  if (!gatewayRaw || !token) {
    throw new Error("AI Cost Center needs CLAW3D_GATEWAY_URL and CLAW3D_GATEWAY_TOKEN.");
  }

  const gatewayUrl = toHttpGatewayUrl(gatewayRaw);
  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-openclaw-agent-id": agentId,
          ...(backendModelOverride ? { "x-openclaw-model": backendModelOverride } : {}),
        },
        body: JSON.stringify({
          model: agentModel,
          user: "claw3d:ai-cost-center",
          messages: [{ role: "user", content: buildPrompt() }],
          stream: false,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`OpenClaw cost query timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw error;
    }

    const text = await response.text();
    if (!response.ok) throw new Error(extractOpenClawError(text, response.status));

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error("OpenClaw returned an invalid chat-completions response.");
    }

    const root = asRecord(payload);
    const choices = Array.isArray(root?.choices) ? root.choices : [];
    const firstChoice = asRecord(choices[0]);
    const message = asRecord(firstChoice?.message);
    const content = typeof message?.content === "string" ? message.content : "";
    if (!content.trim()) throw new Error("OpenClaw returned an empty AI costs response.");

    return normalizeSummary(parseAssistantJson(content));
  } finally {
    clearTimeout(timeout);
  }
};

const getCostSummary = async (): Promise<CostSummary> => {
  if (inFlightRequest) return inFlightRequest;
  inFlightRequest = fetchCostSummary().finally(() => {
    inFlightRequest = null;
  });
  return inFlightRequest;
};

export async function GET(request: Request) {
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  const now = Date.now();
  if (!forceRefresh && cacheEntry && cacheEntry.expiresAt > now) {
    return NextResponse.json(cacheEntry.data, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const data = await getCostSummary();
    const cacheSecondsRaw = Number(process.env.CLAW3D_COSTS_CACHE_SECONDS ?? "300");
    const cacheSeconds = Number.isFinite(cacheSecondsRaw) ? Math.max(30, Math.min(900, cacheSecondsRaw)) : 300;
    cacheEntry = { data, expiresAt: Date.now() + cacheSeconds * 1_000 };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI costs.";
    console.error("[ai-costs]", message);
    return NextResponse.json(
      { error: "ai_costs_unavailable", message },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
