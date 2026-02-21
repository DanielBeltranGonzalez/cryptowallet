"use client";

import { useState, useEffect } from "react";
import type { WalletData } from "./api/balances/route";

const STORAGE_KEY = "solana-addresses";

export default function Home() {
  const [input, setInput] = useState("");
  const [addresses, setAddresses] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [wallets, setWallets] = useState<Record<string, WalletData>>({});
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
  }, [addresses]);

  function addAddress() {
    const trimmed = input.trim();
    if (!trimmed || addresses.includes(trimmed)) return;
    setAddresses((prev) => [...prev, trimmed]);
    setInput("");
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

  async function retryTokens(addr: string) {
    setRetrying((prev) => ({ ...prev, [addr]: true }));
    try {
      const res = await fetch("/api/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: [addr] }),
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
        body: JSON.stringify({ addresses }),
      });
      const data: Record<string, WalletData> = await res.json();
      setWallets(data);
      const newExpanded: Record<string, boolean> = {};
      for (const [addr, wallet] of Object.entries(data)) {
        if (wallet.status === "ok" && wallet.tokens.length > 0) newExpanded[addr] = true;
      }
      setExpanded(newExpanded);
    } finally {
      setLoading(false);
    }
  }

  const totalSol = Object.values(wallets)
    .filter((w): w is Extract<WalletData, { status: "ok" }> => w.status === "ok")
    .reduce((sum, w) => sum + w.sol, 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold text-center text-white">
          Solana Wallet Balance Viewer
        </h1>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAddress()}
            placeholder="Dirección de Solana..."
            className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            onClick={addAddress}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
          >
            Añadir
          </button>
        </div>

        {/* Address list */}
        {addresses.length > 0 && (
          <div className="space-y-3">
            {addresses.map((addr) => {
              const wallet = wallets[addr];
              const isOpen = expanded[addr] ?? false;
              return (
                <div
                  key={addr}
                  className="rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="text-xs text-zinc-400 font-mono truncate">{addr}</p>
                      <div className="flex items-center gap-3 mt-1">
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
                              <button
                                onClick={() => toggleExpanded(addr)}
                                className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                              >
                                {wallet.tokens.length} token{wallet.tokens.length !== 1 ? "s" : ""}
                                {isOpen ? " ▲" : " ▼"}
                              </button>
                            )}
                            {wallet.tokens.length === 0 && !wallet.tokensError && (
                              <span className="text-xs text-zinc-500">Sin tokens</span>
                            )}
                            {wallet.tokensError && (
                              <button
                                onClick={() => retryTokens(addr)}
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
                    </div>
                    <button
                      onClick={() => removeAddress(addr)}
                      className="text-zinc-500 hover:text-red-400 transition-colors text-sm"
                    >
                      Eliminar
                    </button>
                  </div>

                  {/* Token list */}
                  {isOpen && wallet?.status === "ok" && wallet.tokens.length > 0 && (
                    <div className="border-t border-zinc-700 divide-y divide-zinc-700/50">
                      {wallet.tokens.map((token) => (
                        <div
                          key={token.mint}
                          className="flex items-center justify-between px-4 py-2"
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-zinc-200">
                              {token.symbol}
                            </span>
                            <span className="text-xs text-zinc-500 ml-2">{token.name}</span>
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
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        {addresses.length > 0 && (
          <button
            onClick={fetchBalances}
            disabled={loading}
            className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Consultando…" : "Actualizar saldos"}
          </button>
        )}

        {/* Total */}
        {Object.values(wallets).some((w) => w.status === "ok") && (
          <div className="rounded-lg bg-zinc-800 border border-violet-700 px-6 py-4 text-center">
            <p className="text-sm text-zinc-400 mb-1">Total SOL acumulado</p>
            <p className="text-2xl font-bold text-violet-400">
              {totalSol.toFixed(6)} SOL
            </p>
          </div>
        )}

        {addresses.length === 0 && (
          <p className="text-center text-zinc-500 text-sm">
            Añade una dirección de Solana para empezar.
          </p>
        )}
      </div>
    </div>
  );
}
