"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

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

type ApiError = {
  error?: string;
  message?: string;
};

type AICostCenterProps = {
  onClose?: () => void;
};

const BRAND_GOLD = "#F3B747";
const FUTURE_CYAN = "#23D5FF";
const AUTO_REFRESH_MS = 300_000;

const PROVIDERS: Array<{
  key: keyof CostSummary["providers"];
  label: string;
  accent: string;
}> = [
  { key: "openrouter", label: "OpenRouter", accent: "#8B5CF6" },
  { key: "elevenlabs", label: "ElevenLabs", accent: BRAND_GOLD },
  { key: "fal", label: "FAL.ai", accent: FUTURE_CYAN },
];

const formatMoney = (value: number | null, currency: string) => {
  if (value === null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
};

const formatUpdatedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

export function AICostCenter({ onClose }: AICostCenterProps) {
  const [data, setData] = useState<CostSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/ai-costs${force ? "?refresh=1" : ""}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as CostSummary | ApiError;
      if (!response.ok) {
        const apiError = payload as ApiError;
        throw new Error(apiError.message || "Não foi possível consultar os custos de IA.");
      }
      setData(payload as CostSummary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar os custos de IA.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const interval = window.setInterval(() => {
      void load(false);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const statusLabel = error ? "Indisponível" : loading ? "Atualizando" : data ? "Disponível" : "Sem dados";

  return (
    <section
      aria-label="Custos de inteligência artificial"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[rgba(7,14,28,0.97)] text-slate-50"
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
            onClick={() => void load(true)}
            disabled={loading}
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !data ? (
          <div className="m-4 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-5 text-amber-200">
            Consultando os plugins de custo no OpenClaw. Isso pode levar alguns minutos.
          </div>
        ) : null}

        {error ? (
          <div className="m-4 rounded-lg border border-red-400/25 bg-red-950/25 p-3 text-xs leading-5 text-red-300">
            {error}
          </div>
        ) : null}

        <div className="px-4 pb-2 pt-4">
          {PROVIDERS.map((provider) => {
            const cost = data?.providers[provider.key] ?? null;
            return (
              <div
                key={provider.key}
                className="mb-2 grid min-h-[61px] grid-cols-[1.35fr_.9fr_.9fr_.9fr] items-center gap-2 rounded-xl border border-white/[0.075] bg-white/[0.028] p-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-[7px] w-[7px] rounded-full"
                      style={{
                        background: provider.accent,
                        boxShadow: `0 0 9px ${provider.accent}`,
                      }}
                    />
                    <strong className="text-xs">{provider.label}</strong>
                  </div>
                </div>
                <Metric label="HOJE" value={formatMoney(cost?.today ?? null, data?.currency ?? "USD")} />
                <Metric label="MÊS" value={formatMoney(cost?.month ?? null, data?.currency ?? "USD")} />
                <Metric label="SALDO" value={formatMoney(cost?.balance ?? null, data?.currency ?? "USD")} />
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2.5 px-4 pb-4 pt-2">
          <TotalCard
            label="TOTAL HOJE"
            value={formatMoney(data?.total_today ?? null, data?.currency ?? "USD")}
            accent={FUTURE_CYAN}
          />
          <TotalCard
            label="TOTAL MÊS"
            value={formatMoney(data?.total_month ?? null, data?.currency ?? "USD")}
            accent={BRAND_GOLD}
          />
        </div>
      </div>

      <div className="flex shrink-0 justify-between gap-3 border-t border-white/[0.07] px-4 py-3 font-mono text-[9px] tracking-[0.06em] text-slate-500">
        <span>OPENCLAW PLUGINS</span>
        <span>
          {data
            ? `ATUALIZADO ${formatUpdatedAt(data.updated_at)}`
            : loading
              ? "CONSULTANDO..."
              : "SEM DADOS"}
        </span>
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
