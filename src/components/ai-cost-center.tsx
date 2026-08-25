"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { createStudioSettingsCoordinator } from "@/lib/studio/coordinator";
import { useRuntimeConnection } from "@/lib/runtime/useRuntimeConnection";

type ProviderKey = "openrouter" | "elevenlabs" | "fal";

type UsageWindow = {
  label: string;
  usedPercent: number;
  resetAt?: number;
};

type ProviderBilling =
  | { type: "balance"; label?: string; amount: number; unit: string }
  | {
      type: "spend";
      label?: string;
      amount: number;
      unit: string;
      period?: string;
      resetAt?: number;
    }
  | {
      type: "budget";
      label?: string;
      used: number;
      limit: number;
      unit: string;
      period?: string;
      resetAt?: number;
    };

type ProviderCostDaily = {
  date: string;
  amount: number;
};

type ProviderCostHistory = {
  unit: string;
  periodDays: number;
  daily: ProviderCostDaily[];
};

type ProviderUsageSnapshot = {
  provider: string;
  displayName: string;
  windows?: UsageWindow[];
  billing?: ProviderBilling[];
  costHistory?: ProviderCostHistory;
  summary?: string;
  plan?: string;
  error?: string;
};

type UsageSummary = {
  updatedAt: number;
  providers: ProviderUsageSnapshot[];
};

type MetricValue = {
  text: string;
  usd?: number;
};

type AICostCenterProps = {
  onClose?: () => void;
};

const BRAND_GOLD = "#F3B747";
const FUTURE_CYAN = "#23D5FF";
const AUTO_REFRESH_MS = 60_000;

const PROVIDERS: Array<{
  key: ProviderKey;
  label: string;
  accent: string;
}> = [
  { key: "openrouter", label: "OpenRouter", accent: "#8B5CF6" },
  { key: "elevenlabs", label: "ElevenLabs", accent: BRAND_GOLD },
  { key: "fal", label: "FAL.ai", accent: FUTURE_CYAN },
];

const formatNumber = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);

const formatUnitAmount = (amount: number, unit: string): string => {
  const normalizedUnit = unit.trim().toUpperCase();
  if (["USD", "BRL", "EUR", "GBP"].includes(normalizedUnit)) {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: normalizedUnit,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // fall through
    }
  }
  return `${formatNumber(amount)} ${unit || ""}`.trim();
};

const formatUpdatedAt = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
};

const localDateKey = (date = new Date()) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const isUsd = (unit: string | undefined) => (unit ?? "").trim().toUpperCase() === "USD";
const isCreditUnit = (unit: string | undefined) => /credit|cr[eé]dito/i.test(unit ?? "");

const summaryAmount = (
  summary: string | undefined,
  period: "today" | "month",
): number | null => {
  const value = summary ?? "";
  if (!value) return null;
  const periodPattern =
    period === "today" ? "(?:today|hoje)" : "(?:this\\s+month|m[eê]s|month)";
  const before = new RegExp(
    `(?:USD\\s*|US\\$\\s*|\\$\\s*)?([0-9]+(?:[.,][0-9]+)?)\\s*${periodPattern}`,
    "i",
  );
  const after = new RegExp(
    `${periodPattern}[^0-9]{0,20}(?:USD\\s*|US\\$\\s*|\\$\\s*)?([0-9]+(?:[.,][0-9]+)?)`,
    "i",
  );
  const match = value.match(before) ?? value.match(after);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const providerMatches = (key: ProviderKey, snapshot: ProviderUsageSnapshot) => {
  const haystack = `${snapshot.provider} ${snapshot.displayName}`.toLowerCase();
  if (key === "openrouter") return haystack.includes("openrouter");
  if (key === "elevenlabs") return haystack.includes("eleven");
  return /(^|[^a-z])fal(?:\.ai|-ai|[^a-z]|$)/i.test(haystack);
};

const resolveProviderSnapshot = (summary: UsageSummary | null, key: ProviderKey) =>
  summary?.providers?.find((provider) => providerMatches(key, provider)) ?? null;

const monthlySpend = (snapshot: ProviderUsageSnapshot): ProviderBilling | null => {
  const billing = snapshot.billing ?? [];
  const explicit = billing.find(
    (entry) =>
      entry.type === "spend" &&
      (/month|mensal|m[eê]s/i.test(entry.period ?? "") ||
        /month|mensal|m[eê]s/i.test(entry.label ?? "")),
  );
  return explicit ?? null;
};

const budgetEntry = (snapshot: ProviderUsageSnapshot) =>
  (snapshot.billing ?? []).find((entry) => entry.type === "budget") ?? null;

const balanceEntry = (snapshot: ProviderUsageSnapshot) =>
  (snapshot.billing ?? []).find((entry) => entry.type === "balance") ?? null;

const resolveToday = (snapshot: ProviderUsageSnapshot): MetricValue => {
  const summaryUsd = summaryAmount(snapshot.summary, "today");
  if (summaryUsd !== null) return { text: formatUnitAmount(summaryUsd, "USD"), usd: summaryUsd };

  const history = snapshot.costHistory;
  if (history?.daily?.length) {
    const row = history.daily.find((item) => item.date === localDateKey());
    if (row) {
      return {
        text: formatUnitAmount(row.amount, history.unit),
        ...(isUsd(history.unit) ? { usd: row.amount } : {}),
      };
    }
  }
  return { text: "—" };
};

const resolveMonth = (snapshot: ProviderUsageSnapshot): MetricValue => {
  const explicitSpend = monthlySpend(snapshot);
  if (explicitSpend?.type === "spend") {
    return {
      text: formatUnitAmount(explicitSpend.amount, explicitSpend.unit),
      ...(isUsd(explicitSpend.unit) ? { usd: explicitSpend.amount } : {}),
    };
  }

  const summaryUsd = summaryAmount(snapshot.summary, "month");
  if (summaryUsd !== null) return { text: formatUnitAmount(summaryUsd, "USD"), usd: summaryUsd };

  const budget = budgetEntry(snapshot);
  if (budget?.type === "budget") {
    if (isCreditUnit(budget.unit)) {
      return { text: `${formatNumber(budget.used)} / ${formatNumber(budget.limit)}` };
    }
    return {
      text: `${formatUnitAmount(budget.used, budget.unit)} / ${formatUnitAmount(budget.limit, budget.unit)}`,
    };
  }

  const history = snapshot.costHistory;
  if (history?.daily?.length) {
    const monthPrefix = localDateKey().slice(0, 7);
    const amount = history.daily
      .filter((row) => row.date.startsWith(monthPrefix))
      .reduce((sum, row) => sum + row.amount, 0);
    if (amount > 0) {
      return {
        text: formatUnitAmount(amount, history.unit),
        ...(isUsd(history.unit) ? { usd: amount } : {}),
      };
    }
  }
  return { text: "—" };
};

const resolveBalance = (snapshot: ProviderUsageSnapshot): MetricValue => {
  const balance = balanceEntry(snapshot);
  if (balance?.type === "balance") {
    return {
      text: formatUnitAmount(balance.amount, balance.unit),
      ...(isUsd(balance.unit) ? { usd: balance.amount } : {}),
    };
  }
  const budget = budgetEntry(snapshot);
  if (budget?.type === "budget") {
    const remaining = Math.max(0, budget.limit - budget.used);
    if (isCreditUnit(budget.unit)) {
      return { text: `${formatNumber(remaining)} restantes` };
    }
    return { text: formatUnitAmount(remaining, budget.unit) };
  }
  const quota = snapshot.windows?.[0];
  if (quota && Number.isFinite(quota.usedPercent)) {
    return { text: `${formatNumber(Math.max(0, 100 - quota.usedPercent))}% restante` };
  }
  return { text: "—" };
};

export function AICostCenter({ onClose }: AICostCenterProps) {
  const settingsCoordinator = useMemo(() => createStudioSettingsCoordinator(), []);
  const {
    client,
    status,
    error: gatewayError,
  } = useRuntimeConnection(settingsCoordinator);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (status !== "connected") return;
    setLoading(true);
    try {
      const summary = await client.call<UsageSummary>("usage.status", undefined);
      setData(summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar usage.status.");
    } finally {
      setLoading(false);
    }
  }, [client, status]);

  useEffect(() => {
    if (status !== "connected") return;
    void load();
    const interval = window.setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load, status]);

  useEffect(() => {
    if (!gatewayError) return;
    setError(gatewayError);
  }, [gatewayError]);

  const cards = useMemo(
    () =>
      PROVIDERS.map((provider) => {
        const snapshot = resolveProviderSnapshot(data, provider.key);
        return {
          ...provider,
          snapshot,
          today: snapshot ? resolveToday(snapshot) : { text: "—" },
          month: snapshot ? resolveMonth(snapshot) : { text: "—" },
          balance: snapshot ? resolveBalance(snapshot) : { text: "—" },
        };
      }),
    [data],
  );

  const totalToday = cards.reduce((sum, card) => sum + (card.today.usd ?? 0), 0);
  const totalMonth = cards.reduce((sum, card) => sum + (card.month.usd ?? 0), 0);
  const hasAnyUsdToday = cards.some((card) => card.today.usd !== undefined);
  const hasAnyUsdMonth = cards.some((card) => card.month.usd !== undefined);
  const statusLabel = error
    ? "Indisponível"
    : status !== "connected"
      ? "Conectando"
      : loading
        ? "Atualizando"
        : data
          ? "Disponível"
          : "Sem dados";

  return (
    <section
      aria-label="Custos de inteligência artificial"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[rgba(7,14,28,0.97)] text-slate-50"
      onWheelCapture={(event) => event.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-gradient-to-r from-[#111b2b] to-[#070e1c] px-4 py-4">
        <div>
          <div className="mb-1 font-mono text-[10px] font-bold tracking-[0.15em] text-[#F3B747]">
            MULTIMÓVEIS · AI OPS
          </div>
          <div className="text-lg font-bold">Custos IA</div>
          <div className="mt-1 font-mono text-[9px] uppercase text-slate-500">
            {statusLabel}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || status !== "connected"}
            aria-label="Atualizar custos"
            className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/5 text-cyan-300 transition hover:border-cyan-300/50 hover:text-cyan-100 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw size={15} />
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar painel de custos"
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {status !== "connected" && !error ? (
          <div className="m-4 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs leading-5 text-cyan-100">
            Conectando ao gateway para ler os mesmos dados de uso exibidos pelo OpenClaw.
          </div>
        ) : null}

        {loading && !data ? (
          <div className="m-4 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-5 text-amber-200">
            Lendo usage.status diretamente do OpenClaw…
          </div>
        ) : null}

        {error ? (
          <div className="m-4 rounded-lg border border-red-400/25 bg-red-950/25 p-3 text-xs leading-5 text-red-300">
            {error}
          </div>
        ) : null}

        <div className="px-4 pb-2 pt-4">
          {cards.map((card) => {
            const providerError = card.snapshot?.error ?? null;
            return (
              <div
                key={card.key}
                className="mb-2 rounded-xl border border-white/[0.075] bg-white/[0.028] p-2.5"
              >
                <div className="grid min-h-[42px] grid-cols-[1.35fr_.9fr_.9fr_.9fr] items-center gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-[7px] w-[7px] rounded-full"
                        style={{
                          background: providerError ? "#EF4444" : card.accent,
                          boxShadow: `0 0 9px ${providerError ? "#EF4444" : card.accent}`,
                        }}
                      />
                      <strong className="text-xs">{card.label}</strong>
                    </div>
                    {card.snapshot?.plan ? (
                      <div className="mt-1 truncate font-mono text-[8px] text-slate-500">
                        {card.snapshot.plan}
                      </div>
                    ) : null}
                  </div>
                  <Metric label="HOJE" value={card.today.text} />
                  <Metric label="MÊS" value={card.month.text} />
                  <Metric label="SALDO" value={card.balance.text} />
                </div>
                {card.snapshot?.summary ? (
                  <div className="mt-2 border-t border-white/[0.06] pt-2 font-mono text-[9px] leading-4 text-slate-400">
                    {card.snapshot.summary}
                  </div>
                ) : null}
                {providerError ? (
                  <div className="mt-2 border-t border-red-400/10 pt-2 font-mono text-[9px] leading-4 text-red-300/80">
                    {providerError}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2.5 px-4 pb-4 pt-2">
          <TotalCard
            label="TOTAL HOJE"
            value={hasAnyUsdToday ? formatUnitAmount(totalToday, "USD") : "—"}
            accent={FUTURE_CYAN}
          />
          <TotalCard
            label="TOTAL MÊS"
            value={hasAnyUsdMonth ? formatUnitAmount(totalMonth, "USD") : "—"}
            accent={BRAND_GOLD}
          />
        </div>
      </div>

      <div className="flex shrink-0 justify-between gap-3 border-t border-white/[0.07] px-4 py-3 font-mono text-[9px] tracking-[0.06em] text-slate-500">
        <span>OPENCLAW · USAGE.STATUS</span>
        <span>{data ? `ATUALIZADO ${formatUpdatedAt(data.updatedAt)}` : loading ? "CONSULTANDO..." : "SEM DADOS"}</span>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-right">
      <div className="mb-1 font-mono text-[8px] tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div
        title={value}
        className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] font-semibold text-slate-200"
      >
        {value}
      </div>
    </div>
  );
}

function TotalCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        border: `1px solid ${accent}33`,
        background: `${accent}0D`,
      }}
    >
      <div
        className="mb-1 font-mono text-[9px] font-bold tracking-[0.11em]"
        style={{ color: accent }}
      >
        {label}
      </div>
      <div className="font-mono text-lg font-bold text-slate-50">{value}</div>
    </div>
  );
}