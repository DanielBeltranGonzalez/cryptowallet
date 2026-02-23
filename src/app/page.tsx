"use client";

import { useState, useEffect } from "react";
import type { WalletData } from "./api/balances/route";

const STORAGE_KEY = "solana-addresses";
const SOL_MINT = "So11111111111111111111111111111111111111112";

type PriceData = { prices: Record<string, number | null>; eurRate: number | null };

function formatPriceLine(amount: number, priceUsd: number | null | undefined, eurRate: number | null): string | null {
  if (priceUsd == null) return null;
  const usdValue = amount * priceUsd;
  const usdStr = "$" + usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (eurRate == null) return usdStr;
  const eurValue = usdValue * eurRate;
  const eurStr = "€" + eurValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${usdStr} | ${eurStr}`;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [wallets, setWallets] = useState<Record<string, WalletData>>({});
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showInput, setShowInput] = useState(false);
  const [priceData, setPriceData] = useState<PriceData | null>(null);

  // Load persisted addresses after hydration (avoids SSR mismatch)
  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (
        Array.isArray(parsed) &&
        parsed.every((v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 100)
      ) {
        if (parsed.length > 0) setAddresses(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
  }, [addresses]);

  function addAddress() {
    const trimmed = input.trim();
    if (!trimmed || trimmed.length > 100 || addresses.includes(trimmed)) return;
    setAddresses((prev) => [...prev, trimmed]);
    setInput("");
    setShowInput(false);
  }

  function removeAddress(addr: string) {
    setAddresses((prev) => prev.filter((a) => a !== addr));
    setWallets((prev) => {
      const next = { ...prev };
      delete next[addr];
      return next;
    });
  }

  function toggleExpanded(addr: string) {
    setExpanded((prev) => ({ ...prev, [addr]: !prev[addr] }));
  }

  async function fetchPrices(data: Record<string, WalletData>) {
    const mints = new Set<string>();
    mints.add(SOL_MINT);
    for (const wallet of Object.values(data)) {
      if (wallet.status !== "ok") continue;
      for (const token of wallet.tokens) {
        if (token.stakingDetails) {
          mints.add(token.stakingDetails.stakedMint);
        } else if (token.whirlpoolDetails) {
          mints.add(token.whirlpoolDetails.tokenAMint);
          mints.add(token.whirlpoolDetails.tokenBMint);
        } else if (!token.isPositionNft) {
          mints.add(token.mint);
        }
      }
    }
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mints: [...mints] }),
      });
      if (!res.ok) return;
      const json = await res.json() as PriceData;
      setPriceData(json);
    } catch { /* ignore */ }
  }

  async function retryTokens(addr: string) {
    setRetrying((prev) => ({ ...prev, [addr]: true }));
    try {
      const res = await fetch("/api/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: [addr], force: true }),
      });
      const data: Record<string, WalletData> = await res.json();
      setWallets((prev) => ({ ...prev, ...data }));
      if (data[addr]?.status === "ok" && data[addr].tokens.length > 0) {
        setExpanded((prev) => ({ ...prev, [addr]: true }));
      }
    } finally {
      setRetrying((prev) => ({ ...prev, [addr]: false }));
    }
  }

  async function fetchBalances() {
    if (addresses.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses, force: true }),
      });
      const data: Record<string, WalletData> = await res.json();
      setWallets(data);
      fetchPrices(data); // fire-and-forget
    } finally {
      setLoading(false);
    }
  }

  const okWallets = Object.values(wallets).filter(
    (w): w is Extract<WalletData, { status: "ok" }> => w.status === "ok"
  );

  const totalSol = okWallets.reduce((sum, w) => sum + w.sol, 0);

  const totalTokens = (() => {
    type Entry = { mint: string; symbol: string; name: string; uiAmount: number; decimals: number; lpAmount: number; stakedAmount: number };
    const map = new Map<string, Entry>();

    const add = (mint: string, symbol: string, name: string, amount: number, decimals: number, fromLp: boolean, fromStaking: boolean = false) => {
      const existing = map.get(mint);
      if (existing) {
        existing.uiAmount += amount;
        if (fromLp) existing.lpAmount += amount;
        if (fromStaking) existing.stakedAmount += amount;
      } else {
        map.set(mint, { mint, symbol, name, uiAmount: amount, decimals, lpAmount: fromLp ? amount : 0, stakedAmount: fromStaking ? amount : 0 });
      }
    };

    for (const w of okWallets) {
      for (const t of w.tokens) {
        if (t.stakingDetails) {
          const sd = t.stakingDetails;
          add(sd.stakedMint, sd.stakedSymbol, sd.stakedSymbol, sd.stakedAmount, sd.stakedDecimals, false, true);
        } else if (t.whirlpoolDetails) {
          const wd = t.whirlpoolDetails;
          add(wd.tokenAMint, wd.tokenASymbol, wd.tokenAName, wd.tokenAAmount, wd.tokenADecimals, true);
          add(wd.tokenBMint, wd.tokenBSymbol, wd.tokenBName, wd.tokenBAmount, wd.tokenBDecimals, true);
        } else if (!t.isPositionNft) {
          add(t.mint, t.symbol, t.name, t.uiAmount, t.decimals, false);
        }
      }
    }
    return [...map.values()].sort((a, b) => {
      const aUnknown = a.name === "Token desconocido" ? 1 : 0;
      const bUnknown = b.name === "Token desconocido" ? 1 : 0;
      if (aUnknown !== bUnknown) return aUnknown - bUnknown;
      return a.symbol.localeCompare(b.symbol);
    });
  })();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="w-full max-w-6xl mx-auto space-y-6">
        {/* Two-column layout */}
        <div className="flex flex-col gap-6 w-fit mx-auto">
          {/* Header */}
          <h1 className="text-3xl font-bold text-white text-center">
            Solana Wallets Balance Viewer
          </h1>

          <div className="flex gap-6 items-start">
          {/* Left: Direcciones — tarjetas colapsadas + botón añadir */}
          <div className="shrink-0 space-y-2">
            {[...addresses].sort((a, b) => a.localeCompare(b)).map((addr) => {
              const wallet = wallets[addr];
              const isOpen = expanded[addr] ?? false;
              return (
                <div
                  key={addr}
                  className="rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden"
                >
                  {/* Cabecera clicable para colapsar/expandir */}
                  <div className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-700/40 transition-colors">
                    {/* Dirección como enlace a Solscan */}
                    <a
                      href={`https://solscan.io/account/${addr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 mr-3 group"
                    >
                      <p className="text-xs text-zinc-400 font-mono truncate group-hover:text-zinc-200 transition-colors">{addr}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {wallet === undefined && (
                          <span className="text-xs text-zinc-600">Sin consultar</span>
                        )}
                        {wallet?.status === "invalid" && (
                          <span className="text-xs text-red-400">Dirección inválida</span>
                        )}
                        {wallet?.status === "error" && (
                          <span className="text-xs text-yellow-400">Error de red</span>
                        )}
                        {wallet?.status === "ok" && (
                          <>
                            <span className="text-xs text-green-400">{wallet.sol.toFixed(4)} SOL</span>
                            {wallet.tokensError && (
                              <span className="text-xs text-yellow-400">· Error tokens</span>
                            )}
                            {!wallet.tokensError && wallet.tokens.length > 0 && (
                              <span className="text-xs text-zinc-500">· {wallet.tokens.length} tokens</span>
                            )}
                          </>
                        )}
                      </div>
                    </a>

                    {/* Botón de toggle (solo chevron) */}
                    <button
                      onClick={() => toggleExpanded(addr)}
                      className="text-zinc-500 text-xs flex-shrink-0 hover:text-zinc-300 p-1 transition-colors"
                      aria-label={isOpen ? "Colapsar" : "Expandir"}
                    >
                      {isOpen ? "▲" : "▼"}
                    </button>
                  </div>

                  {/* Contenido expandido */}
                  {isOpen && (
                    <div className="border-t border-zinc-700">
                      {/* Balance + acciones */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          {wallet === undefined ? (
                            <span className="text-zinc-500 text-sm">—</span>
                          ) : wallet.status === "invalid" ? (
                            <span className="text-red-400 text-sm">Dirección inválida</span>
                          ) : wallet.status === "error" ? (
                            <span className="text-yellow-400 text-sm" title={wallet.message}>
                              Error de red — intenta de nuevo
                            </span>
                          ) : (
                            <>
                              <span className="text-green-400 font-semibold text-sm">
                                {wallet.sol.toFixed(6)} SOL
                              </span>
                              {wallet.tokens.length > 0 && (
                                <span className="text-xs text-violet-400">
                                  {wallet.tokens.length} token{wallet.tokens.length !== 1 ? "s" : ""}
                                </span>
                              )}
                              {wallet.tokens.length === 0 && !wallet.tokensError && (
                                <span className="text-xs text-zinc-500">Sin tokens</span>
                              )}
                              {wallet.tokensError && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); retryTokens(addr); }}
                                  disabled={retrying[addr]}
                                  className="text-xs text-yellow-400 hover:text-yellow-300 disabled:opacity-50 transition-colors"
                                  title={wallet.tokensError}
                                >
                                  {retrying[addr] ? "Reintentando…" : "Error tokens — reintentar"}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeAddress(addr); }}
                          className="text-zinc-500 hover:text-red-400 transition-colors text-sm"
                        >
                          Eliminar
                        </button>
                      </div>

                      {/* Lista de tokens */}
                      {wallet?.status === "ok" && wallet.tokens.length > 0 && (
                        <div className="border-t border-zinc-700 divide-y divide-zinc-700/50">
                          {[...wallet.tokens].sort((a, b) => a.symbol.localeCompare(b.symbol)).map((token) =>
                            token.whirlpoolDetails ? (
                              <div key={token.mint} className="flex flex-col px-4 py-2">
                                <div className="flex items-center justify-between mb-1">
                                  <div>
                                    <span className="text-sm font-medium text-blue-400">Orca Position</span>
                                    {token.name !== "Token desconocido" && (
                                      <span className="text-xs text-zinc-500 ml-2">{token.name.slice(0, 50)}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-0.5 pl-2 border-l border-zinc-700">
                                  {[
                                    { symbol: token.whirlpoolDetails.tokenASymbol, amount: token.whirlpoolDetails.tokenAAmount },
                                    { symbol: token.whirlpoolDetails.tokenBSymbol, amount: token.whirlpoolDetails.tokenBAmount },
                                  ].map((t) => (
                                    <div key={t.symbol} className="flex items-center justify-between">
                                      <span className="text-xs text-zinc-400">{t.symbol.slice(0, 20)}</span>
                                      <span className="text-xs text-zinc-300 font-mono">
                                        {t.amount.toLocaleString("es-ES", { maximumFractionDigits: 6 })}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div
                                key={token.mint}
                                className="flex items-center justify-between px-4 py-2"
                              >
                                <div className="min-w-0">
                                  <span className="text-sm font-medium text-zinc-200">{token.symbol.slice(0, 20)}</span>
                                  <span className="text-xs text-zinc-500 ml-2">{token.name.slice(0, 50)}</span>
                                  {token.stakingDetails && (
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-xs text-violet-400">
                                        {token.stakingDetails.stakedAmount.toLocaleString("es-ES", { maximumFractionDigits: 6 })} {token.stakingDetails.stakedSymbol} staked
                                      </span>
                                      {token.stakingDetails.unlockAt && (
                                        <span className="text-xs text-zinc-500">
                                          · unlock {new Date(token.stakingDetails.unlockAt * 1000).toLocaleDateString("es-ES")}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <span className="text-sm text-zinc-300 font-mono ml-4 shrink-0">
                                  {token.uiAmount.toLocaleString("es-ES", {
                                    maximumFractionDigits: token.decimals > 6 ? 6 : token.decimals,
                                  })}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Input (visible only when showInput) */}
            {showInput && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addAddress();
                    if (e.key === "Escape") { setShowInput(false); setInput(""); }
                  }}
                  placeholder="Dirección de Solana..."
                  maxLength={100}
                  autoFocus
                  className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  onClick={addAddress}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
                >
                  Confirmar
                </button>
              </div>
            )}

            {/* Botón añadir dirección */}
            <button
              onClick={() => { setShowInput((v) => !v); setInput(""); }}
              className="w-full rounded-lg border border-dashed border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-400 hover:border-violet-500 hover:text-violet-400 transition-colors"
            >
              {showInput ? "Cancelar" : "+ Añadir dirección"}
            </button>
          </div>

          {/* Right: Total + Actualizar */}
          <div className="w-80 shrink-0 space-y-4">
            {/* Total acumulado */}
            {okWallets.length > 0 && (
              <div className="rounded-lg bg-zinc-800 border border-violet-700 overflow-hidden">
                <div className="px-6 py-4 text-center border-b border-violet-700/50">
                  <p className="text-sm text-zinc-400 mb-1">Total acumulado</p>
                  <p className="text-2xl font-bold text-violet-400">
                    {totalSol.toFixed(6)} SOL
                  </p>
                  {(() => {
                    if (!priceData) return null;
                    let totalUsd = 0;
                    const solPrice = priceData.prices[SOL_MINT];
                    if (solPrice != null) totalUsd += totalSol * solPrice;
                    for (const token of totalTokens) {
                      const price = priceData.prices[token.mint];
                      if (price != null) totalUsd += token.uiAmount * price;
                    }
                    if (totalUsd === 0) return null;
                    const usdStr = "$" + totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const eurStr = priceData.eurRate != null
                      ? " | €" + (totalUsd * priceData.eurRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : "";
                    return <p className="text-lg font-semibold text-amber-400 mt-2">{usdStr}{eurStr}</p>;
                  })()}
                </div>
                {totalTokens.length > 0 && (
                  <div className="divide-y divide-zinc-700/50">
                    {totalTokens.map((token) => (
                      <div key={token.mint} className="flex items-center justify-between px-6 py-2">
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-zinc-200">{token.symbol.slice(0, 20)}</span>
                          <span className="text-xs text-zinc-500 ml-2">{token.name.slice(0, 50)}</span>
                          {(token.lpAmount > 0 || token.stakedAmount > 0) && (() => {
                            const liquid = token.uiAmount - token.lpAmount - token.stakedAmount;
                            const fmt = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: token.decimals > 6 ? 6 : token.decimals });
                            return (
                              <>
                                {liquid > 0 && (
                                  <div className="text-xs text-green-400/80 mt-0.5">{fmt(liquid)} líquido</div>
                                )}
                                {token.lpAmount > 0 && (
                                  <div className="text-xs text-blue-400/80 mt-0.5">{fmt(token.lpAmount)} en LP</div>
                                )}
                                {token.stakedAmount > 0 && (
                                  <div className="text-xs text-violet-400/80 mt-0.5">{fmt(token.stakedAmount)} en staking</div>
                                )}
                              </>
                            );
                          })()}
                          {(() => {
                            const priceLine = formatPriceLine(token.uiAmount, priceData?.prices[token.mint], priceData?.eurRate ?? null);
                            return priceLine ? <div className="text-xs text-amber-400/80 mt-0.5">{priceLine}</div> : null;
                          })()}
                        </div>
                        <span className="text-sm text-zinc-300 font-mono ml-4 shrink-0">
                          {token.uiAmount.toLocaleString("es-ES", {
                            maximumFractionDigits: token.decimals > 6 ? 6 : token.decimals,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {priceData?.eurRate != null && (
                  <div className="px-6 py-2 text-right border-t border-zinc-700/50">
                    <span className="text-xs text-zinc-600">1 USD = €{priceData.eurRate.toFixed(4)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Actualizar */}
            {addresses.length > 0 && (
              <button
                onClick={fetchBalances}
                disabled={loading}
                className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Consultando…" : "Actualizar saldos"}
              </button>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
