"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, WalletCards, X } from "lucide-react";

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

const BRAND_NAVY = "#172238";
const BRAND_GOLD = "#F3B747";
const FUTURE_CYAN = "#23D5FF";
const PANEL_BG = "rgba(7, 14, 28, 0.96)";

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

export function AICostCenter() {
  const [open, setOpen] = useState(false);
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
    }, 90_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const pillValue = useMemo(() => {
    if (data) return formatMoney(data.total_month, data.currency);
    if (loading) return "ATUALIZANDO";
    if (error) return "INDISPONÍVEL";
    return "—";
  }, [data, error, loading]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Abrir painel de custos de inteligência artificial"
        title="AI Cost Center"
        style={{
          position: "fixed",
          top: 74,
          right: 18,
          zIndex: 90,
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 40,
          padding: "8px 13px",
          borderRadius: 12,
          border: `1px solid ${error ? "rgba(239,68,68,.55)" : "rgba(35,213,255,.38)"}`,
          background: "linear-gradient(135deg, rgba(23,34,56,.97), rgba(7,14,28,.97))",
          color: "#F8FAFC",
          boxShadow: "0 12px 34px rgba(0,0,0,.36), inset 0 0 18px rgba(35,213,255,.05)",
          cursor: "pointer",
          fontFamily: "var(--font-mono), monospace",
        }}
      >
        <WalletCards size={16} color={BRAND_GOLD} />
        <span
          style={{
            color: FUTURE_CYAN,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".13em",
          }}
        >
          AI COST
        </span>
        <span
          style={{
            width: 1,
            height: 18,
            background: "rgba(255,255,255,.14)",
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 700 }}>{pillValue}</span>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 99,
            background: error ? "#EF4444" : loading ? BRAND_GOLD : "#22C55E",
            boxShadow: `0 0 10px ${error ? "#EF4444" : loading ? BRAND_GOLD : "#22C55E"}`,
          }}
        />
      </button>

      {open ? (
        <section
          aria-label="Custos de inteligência artificial"
          style={{
            position: "fixed",
            top: 124,
            right: 18,
            zIndex: 95,
            width: "min(390px, calc(100vw - 36px))",
            overflow: "hidden",
            borderRadius: 16,
            border: "1px solid rgba(35,213,255,.28)",
            background: PANEL_BG,
            color: "#F8FAFC",
            boxShadow: "0 24px 80px rgba(0,0,0,.52), inset 0 0 45px rgba(35,213,255,.035)",
            backdropFilter: "blur(16px)",
            fontFamily: "var(--font-sans), sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "15px 16px 13px",
              borderBottom: "1px solid rgba(255,255,255,.08)",
              background: "linear-gradient(90deg, rgba(243,183,71,.08), rgba(35,213,255,.06))",
            }}
          >
            <div>
              <div
                style={{
                  color: BRAND_GOLD,
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: ".15em",
                  marginBottom: 4,
                }}
              >
                MULTIMÓVEIS · AI OPS
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Custos IA</div>
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={loading}
                aria-label="Atualizar custos"
                style={{
                  width: 34,
                  height: 34,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 9,
                  border: "1px solid rgba(35,213,255,.24)",
                  background: "rgba(35,213,255,.06)",
                  color: FUTURE_CYAN,
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                <RefreshCw size={15} style={{ opacity: loading ? 0.55 : 1 }} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar painel de custos"
                style={{
                  width: 34,
                  height: 34,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 9,
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "rgba(255,255,255,.04)",
                  color: "#CBD5E1",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {error ? (
            <div
              style={{
                margin: 14,
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(239,68,68,.28)",
                background: "rgba(127,29,29,.18)",
                color: "#FCA5A5",
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {error}
            </div>
          ) : null}

          <div style={{ padding: "14px 14px 6px" }}>
            {PROVIDERS.map((provider) => {
              const cost = data?.providers[provider.key] ?? null;
              return (
                <div
                  key={provider.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.35fr .9fr .9fr .9fr",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 61,
                    padding: "10px 10px",
                    marginBottom: 8,
                    borderRadius: 11,
                    border: "1px solid rgba(255,255,255,.075)",
                    background: "rgba(255,255,255,.028)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 99,
                          background: provider.accent,
                          boxShadow: `0 0 9px ${provider.accent}`,
                        }}
                      />
                      <strong style={{ fontSize: 12 }}>{provider.label}</strong>
                    </div>
                  </div>
                  <Metric label="HOJE" value={formatMoney(cost?.today ?? null, data?.currency ?? "USD")} />
                  <Metric label="MÊS" value={formatMoney(cost?.month ?? null, data?.currency ?? "USD")} />
                  <Metric label="SALDO" value={formatMoney(cost?.balance ?? null, data?.currency ?? "USD")} />
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              padding: "7px 14px 14px",
            }}
          >
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

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 15px 12px",
              borderTop: "1px solid rgba(255,255,255,.07)",
              color: "#64748B",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 9,
              letterSpacing: ".06em",
            }}
          >
            <span>OPENCLAW PLUGINS</span>
            <span>{data ? `ATUALIZADO ${formatUpdatedAt(data.updated_at)}` : loading ? "CONSULTANDO..." : "SEM DADOS"}</span>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right", minWidth: 0 }}>
      <div
        style={{
          color: "#64748B",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 8,
          letterSpacing: ".08em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        title={value}
        style={{
          color: "#E2E8F0",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 10,
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TotalCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        padding: "12px 13px",
        borderRadius: 11,
        border: `1px solid ${accent}33`,
        background: `${accent}0D`,
      }}
    >
      <div
        style={{
          color: accent,
          fontFamily: "var(--font-mono), monospace",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: ".11em",
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#F8FAFC",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        {value}
      </div>
    </div>
  );
}
