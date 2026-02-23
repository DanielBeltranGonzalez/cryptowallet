import { NextRequest, NextResponse } from "next/server";

const MAX_MINTS = 50;
const DEXSCREENER_BATCH = 30;

// ── Price cache ──────────────────────────────────────────────────────────────
type PriceCacheEntry = {
  prices: Record<string, number | null>;
  eurRate: number | null;
  cachedAt: number;
};

const priceCache = new Map<string, PriceCacheEntry>();
const PRICE_CACHE_TTL_MS = 2 * 60 * 1000;

function getCacheKey(mints: string[]): string {
  return [...mints].sort().join(",");
}

function getCached(key: string): PriceCacheEntry | null {
  const entry = priceCache.get(key);
  if (entry && Date.now() - entry.cachedAt < PRICE_CACHE_TTL_MS) return entry;
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── DexScreener price fetch ───────────────────────────────────────────────────
// /tokens/v1/solana/{addresses} returns an array of pairs; for each requested
// mint, the first pair in the response where baseToken.address matches is the
// most liquid one and we use its priceUsd.
async function fetchDexScreenerPrices(mints: string[]): Promise<Record<string, number | null>> {
  const prices: Record<string, number | null> = {};
  for (const mint of mints) prices[mint] = null;

  for (let i = 0; i < mints.length; i += DEXSCREENER_BATCH) {
    const batch = mints.slice(i, i + DEXSCREENER_BATCH);
    try {
      const url = `https://api.dexscreener.com/tokens/v1/solana/${batch.join(",")}`;
      const res = await fetchWithTimeout(url, 8_000);
      if (!res.ok) continue;
      const data = await res.json() as unknown;
      if (!Array.isArray(data)) continue;

      for (const pair of data) {
        if (typeof pair !== "object" || pair === null) continue;
        if ((pair as { chainId?: string }).chainId !== "solana") continue;
        const baseAddr = (pair as { baseToken?: { address?: string } }).baseToken?.address;
        const priceUsdStr = (pair as { priceUsd?: string }).priceUsd;
        if (!baseAddr || typeof priceUsdStr !== "string") continue;
        if (!(baseAddr in prices)) continue;
        if (prices[baseAddr] !== null) continue; // keep first (most liquid) match
        const price = parseFloat(priceUsdStr);
        if (!isNaN(price)) prices[baseAddr] = price;
      }
    } catch {
      // continue with next batch on error
    }
  }
  return prices;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as unknown;

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { mints } = body as Record<string, unknown>;

  if (!Array.isArray(mints)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (mints.length > MAX_MINTS) {
    return NextResponse.json(
      { error: `Too many mints (max ${MAX_MINTS})` },
      { status: 400 }
    );
  }

  if (!mints.every((m) => typeof m === "string" && m.length > 0 && m.length <= 100)) {
    return NextResponse.json({ error: "Invalid mint format" }, { status: 400 });
  }

  const mintList = mints as string[];

  if (mintList.length === 0) {
    return NextResponse.json({ prices: {}, eurRate: null });
  }

  const cacheKey = getCacheKey(mintList);
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ prices: cached.prices, eurRate: cached.eurRate });
  }

  const [dexScreenerResult, frankfurterResult] = await Promise.allSettled([
    fetchDexScreenerPrices(mintList),
    (async (): Promise<number> => {
      const res = await fetchWithTimeout(
        "https://api.frankfurter.app/latest?from=USD&to=EUR",
        8_000
      );
      if (!res.ok) throw new Error(`Frankfurter API error: HTTP ${res.status}`);
      const data = await res.json() as unknown;
      if (typeof data !== "object" || data === null) {
        throw new Error("Unexpected Frankfurter response format");
      }
      const rates = (data as { rates?: { EUR?: number } }).rates;
      if (!rates || typeof rates.EUR !== "number") {
        throw new Error("EUR rate not found in response");
      }
      return rates.EUR;
    })(),
  ]);

  let prices: Record<string, number | null> = {};
  if (dexScreenerResult.status === "fulfilled") {
    prices = dexScreenerResult.value;
  } else {
    console.error("[prices] DexScreener fetch failed:", toErrorMessage(dexScreenerResult.reason));
    for (const mint of mintList) prices[mint] = null;
  }

  let eurRate: number | null = null;
  if (frankfurterResult.status === "fulfilled") {
    eurRate = frankfurterResult.value;
  } else {
    console.error("[prices] Frankfurter fetch failed:", toErrorMessage(frankfurterResult.reason));
  }

  const entry: PriceCacheEntry = { prices, eurRate, cachedAt: Date.now() };
  priceCache.set(cacheKey, entry);

  return NextResponse.json({ prices, eurRate });
}
