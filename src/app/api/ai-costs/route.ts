import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProviderKey = "openrouter" | "elevenlabs" | "fal";

type ProviderCost = {
  today: number | null;
  month: number | null;
  balance: number | null;
};

type CostSummary = {
  currency: string;
  updated_at: string;
  providers: Record<ProviderKey, ProviderCost>;
  total_today: number | null;
  total_month: number | null;
  provider_errors?: Partial<Record<ProviderKey, string>>;
};

type ProviderQueryResult = {
  key: ProviderKey;
  currency: string;
  updatedAt: string;
  cost: ProviderCost;
};

type CacheEntry = {
  expiresAt: number;
  data: CostSummary;
};

const PROVIDERS: Array<{ key: ProviderKey; label: string }> = [
  { key: "openrouter", label: "OpenRouter" },
  { key: "elevenlabs", label: "ElevenLabs" },
  { key: "fal", label: "FAL.ai" },
];

const EMPTY_PROVIDER: ProviderCost = {
  today: null,
  month: null,
  balance: null,
};

let cacheEntry: CacheEntry | null = null;
let inFlightRequest: Promise<CostSummary> | null = null;

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
    today: firstNumber(record, [
      "today",
      "daily",
      "today_cost",
      "cost_today",
      "current_day",
      "day",
      "spent_today",
      "usage_today",
    ]),
    month: firstNumber(record, [
      "month",
      "monthly",
      "month_cost",
      "cost_month",
      "current_month",
      "mtd",
      "spent_month",
      "usage_month",
    ]),
    balance: firstNumber(record, [
      "balance",
      "credits",
      "remaining_balance",
      "remaining",
      "credit_balance",
      "remaining_credits",
    ]),
  };
};

const hasAnyCostValue = (cost: ProviderCost) =>
  cost.today !== null || cost.month !== null || cost.balance !== null;

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
    throw new Error("OpenClaw did not return a JSON object.");
  }
  return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1)) as unknown;
};

const buildProviderPrompt = (provider: { key: ProviderKey; label: string }) => {
  const timezone = process.env.CLAW3D_COSTS_TIMEZONE?.trim() || "America/Sao_Paulo";
  return [
    `Consulte SOMENTE os custos de ${provider.label} usando o plugin/ferramenta de custos já instalado neste OpenClaw.`,
    `Considere hoje e o mês atual no fuso ${timezone}.`,
    "Use valores reais retornados pela ferramenta. Não estime e não invente números.",
    "Se o provedor disponibilizar saldo/créditos remanescentes, retorne balance; caso contrário use null.",
    "Responda SOMENTE com JSON válido, sem markdown ou explicações, neste formato:",
    JSON.stringify(
      {
        currency: "USD",
        updated_at: "ISO-8601",
        today: null,
        month: null,
        balance: null,
      },
      null,
      2,
    ),
    "Use números JSON sem símbolo de moeda, ou null.",
  ].join("\n");
};

const extractOpenClawError = (text: string, status: number): string => {
  const fallback = `OpenClaw request failed with HTTP ${status}.`;
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
  const raw = Number(process.env.CLAW3D_COSTS_TIMEOUT_MS ?? "120000");
  if (!Number.isFinite(raw)) return 120_000;
  return Math.max(30_000, Math.min(300_000, raw));
};

const extractAssistantContent = (payload: unknown): string => {
  const root = asRecord(payload);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  return typeof message?.content === "string" ? message.content : "";
};

const fetchProviderCost = async (
  provider: { key: ProviderKey; label: string },
  config: {
    gatewayUrl: string;
    token: string;
    agentId: string;
    agentModel: string;
    backendModelOverride: string;
    timeoutMs: number;
  },
): Promise<ProviderQueryResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(`${config.gatewayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-openclaw-agent-id": config.agentId,
          ...(config.backendModelOverride
            ? { "x-openclaw-model": config.backendModelOverride }
            : {}),
        },
        body: JSON.stringify({
          model: config.agentModel,
          // Intentionally omit `user`: every provider query gets a fresh stateless
          // session. A stable user/session can leave later refreshes queued behind
          // an older timed-out tool run.
          messages: [{ role: "user", content: buildProviderPrompt(provider) }],
          stream: false,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `${provider.label} timed out after ${Math.round(config.timeoutMs / 1000)} seconds.`,
        );
      }
      throw error;
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${provider.label}: ${extractOpenClawError(text, response.status)}`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`${provider.label}: OpenClaw returned invalid JSON.`);
    }

    const content = extractAssistantContent(payload);
    if (!content.trim()) {
      throw new Error(`${provider.label}: OpenClaw returned an empty response.`);
    }

    const parsed = parseAssistantJson(content);
    const root = asRecord(parsed) ?? {};
    const nestedProviders = asRecord(root.providers);
    const nestedProvider = nestedProviders?.[provider.key] ?? root[provider.key];
    const cost = normalizeProvider(nestedProvider ?? root);
    if (!hasAnyCostValue(cost)) {
      throw new Error(`${provider.label}: no numeric cost data was returned by the plugin.`);
    }

    return {
      key: provider.key,
      currency:
        typeof root.currency === "string" && root.currency.trim()
          ? root.currency.trim().toUpperCase()
          : "USD",
      updatedAt:
        typeof root.updated_at === "string" && root.updated_at.trim()
          ? root.updated_at.trim()
          : new Date().toISOString(),
      cost,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchCostSummary = async (): Promise<CostSummary> => {
  const gatewayRaw =
    process.env.CLAW3D_COSTS_OPENCLAW_URL?.trim() ||
    process.env.CLAW3D_GATEWAY_URL?.trim() ||
    "";
  const token =
    process.env.CLAW3D_GATEWAY_TOKEN?.trim() ||
    process.env.OPENCLAW_GATEWAY_TOKEN?.trim() ||
    "";
  const backendModelOverride = process.env.CLAW3D_COSTS_MODEL?.trim() || "";
  const agentId = process.env.CLAW3D_COSTS_AGENT_ID?.trim() || "main";
  const agentModel = agentId === "default" ? "openclaw/default" : `openclaw/${agentId}`;

  if (!gatewayRaw || !token) {
    throw new Error("AI Cost Center needs CLAW3D_GATEWAY_URL and CLAW3D_GATEWAY_TOKEN.");
  }

  const gatewayUrl = toHttpGatewayUrl(gatewayRaw);
  const timeoutMs = getTimeoutMs();
  const results = await Promise.allSettled(
    PROVIDERS.map((provider) =>
      fetchProviderCost(provider, {
        gatewayUrl,
        token,
        agentId,
        agentModel,
        backendModelOverride,
        timeoutMs,
      }),
    ),
  );

  const providers: Record<ProviderKey, ProviderCost> = {
    openrouter: { ...EMPTY_PROVIDER },
    elevenlabs: { ...EMPTY_PROVIDER },
    fal: { ...EMPTY_PROVIDER },
  };
  const providerErrors: Partial<Record<ProviderKey, string>> = {};
  let currency = "USD";
  let successCount = 0;
  let latestUpdatedAt = new Date().toISOString();

  results.forEach((result, index) => {
    const provider = PROVIDERS[index];
    if (result.status === "fulfilled") {
      providers[result.value.key] = result.value.cost;
      currency = result.value.currency || currency;
      latestUpdatedAt = result.value.updatedAt || latestUpdatedAt;
      successCount += 1;
      return;
    }
    providerErrors[provider.key] =
      result.reason instanceof Error ? result.reason.message : `${provider.label}: query failed.`;
  });

  if (successCount === 0) {
    throw new Error(
      `No provider cost query succeeded. ${Object.values(providerErrors).join(" | ")}`,
    );
  }

  const summary: CostSummary = {
    currency,
    updated_at: latestUpdatedAt,
    providers,
    total_today: sumKnown([
      providers.openrouter.today,
      providers.elevenlabs.today,
      providers.fal.today,
    ]),
    total_month: sumKnown([
      providers.openrouter.month,
      providers.elevenlabs.month,
      providers.fal.month,
    ]),
  };

  if (Object.keys(providerErrors).length > 0) {
    summary.provider_errors = providerErrors;
  }

  return summary;
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
    return NextResponse.json(cacheEntry.data, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const data = await getCostSummary();
    const cacheSecondsRaw = Number(process.env.CLAW3D_COSTS_CACHE_SECONDS ?? "300");
    const cacheSeconds = Number.isFinite(cacheSecondsRaw)
      ? Math.max(30, Math.min(1800, cacheSecondsRaw))
      : 300;
    cacheEntry = {
      data,
      expiresAt: Date.now() + cacheSeconds * 1_000,
    };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI costs.";
    console.error("[ai-costs]", message);
    return NextResponse.json(
      { error: "ai_costs_unavailable", message },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
