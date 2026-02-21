"use client";

import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [balances, setBalances] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);

  function addAddress() {
    const trimmed = input.trim();
    if (!trimmed || addresses.includes(trimmed)) return;
    setAddresses((prev) => [...prev, trimmed]);
    setInput("");
  }

  function removeAddress(addr: string) {
    setAddresses((prev) => prev.filter((a) => a !== addr));
    setBalances((prev) => {
      const next = { ...prev };
      delete next[addr];
      return next;
    });
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
      const data = await res.json();
      setBalances(data);
    } finally {
      setLoading(false);
    }
  }

  const total = Object.values(balances)
    .filter((b): b is number => b !== null)
    .reduce((sum, b) => sum + b, 0);

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
          <div className="space-y-2">
            {addresses.map((addr) => (
              <div
                key={addr}
                className="flex items-center justify-between rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-xs text-zinc-400 font-mono truncate">{addr}</p>
                  <p className="text-sm mt-1">
                    {balances[addr] === undefined ? (
                      <span className="text-zinc-500">—</span>
                    ) : balances[addr] === null ? (
                      <span className="text-red-400">Dirección inválida</span>
                    ) : (
                      <span className="text-green-400 font-semibold">
                        {balances[addr]!.toFixed(6)} SOL
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => removeAddress(addr)}
                  className="text-zinc-500 hover:text-red-400 transition-colors text-sm"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {addresses.length > 0 && (
          <button
            onClick={fetchBalances}
            disabled={loading}
            className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Consultando..." : "Actualizar saldos"}
          </button>
        )}

        {/* Total */}
        {Object.keys(balances).length > 0 && (
          <div className="rounded-lg bg-zinc-800 border border-violet-700 px-6 py-4 text-center">
            <p className="text-sm text-zinc-400 mb-1">Total acumulado</p>
            <p className="text-2xl font-bold text-violet-400">
              {total.toFixed(6)} SOL
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
