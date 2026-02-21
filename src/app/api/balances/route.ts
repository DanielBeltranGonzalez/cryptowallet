import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export type TokenBalance = {
  mint: string;
  symbol: string;
  name: string;
  uiAmount: number;
  decimals: number;
};

export type WalletData =
  | { status: "invalid" }
  | { status: "error"; message: string }
  | { status: "ok"; sol: number; tokens: TokenBalance[]; tokensError?: string; cachedAt?: number };

// ── Token list cache ──────────────────────────────────────────────────────────
let tokenMetaCache: Map<string, { symbol: string; name: string }> | null = null;
let tokenMetaCachedAt = 0;
const TOKEN_META_TTL_MS = 60 * 60 * 1000; // 1 h

async function getTokenMeta(): Promise<Map<string, { symbol: string; name: string }>> {
  if (tokenMetaCache && Date.now() - tokenMetaCachedAt < TOKEN_META_TTL_MS) {
    return tokenMetaCache;
  }
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json"
    );
    const data = await res.json() as {
      tokens: { chainId: number; address: string; symbol: string; name: string }[];
    };
    tokenMetaCache = new Map(
      data.tokens
        .filter((t) => t.chainId === 101)
        .map((t) => [t.address, { symbol: t.symbol, name: t.name }])
    );
    tokenMetaCachedAt = Date.now();
  } catch {
    if (!tokenMetaCache) tokenMetaCache = new Map();
  }
  return tokenMetaCache;
}

// ── Wallet data cache ─────────────────────────────────────────────────────────
type CacheEntry = { data: Extract<WalletData, { status: "ok" }>; cachedAt: number };
const walletCache = new Map<string, CacheEntry>();
const WALLET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function getCached(addr: string): Extract<WalletData, { status: "ok" }> | null {
  const entry = walletCache.get(addr);
  if (entry && Date.now() - entry.cachedAt < WALLET_CACHE_TTL_MS) {
    return { ...entry.data, cachedAt: entry.cachedAt };
  }
  return null;
}

function setCached(addr: string, data: Extract<WalletData, { status: "ok" }>) {
  const cachedAt = Date.now();
  walletCache.set(addr, { data, cachedAt });
  return { ...data, cachedAt };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? clusterApiUrl("mainnet-beta");
}

async function withBackoff<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** i)); // 2s, 4s, 8s
      }
    }
  }
  throw lastErr;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { addresses, force = false } = await req.json();

  if (!Array.isArray(addresses)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const connection = new Connection(getRpcUrl(), {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });

  const tokenMeta = await getTokenMeta();
  const results: Record<string, WalletData> = {};

  for (const addr of addresses) {
    // 1. Return cached data if still fresh (unless forced refresh)
    if (!force) {
      const cached = getCached(addr);
      if (cached) {
        results[addr] = cached;
        continue;
      }
    }

    // 2. Validate address
    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(addr);
      if (!PublicKey.isOnCurve(pubkey.toBytes())) throw new Error("off-curve");
    } catch {
      results[addr] = { status: "invalid" };
      continue;
    }

    // 3. Fetch SOL balance
    let lamports: number;
    try {
      lamports = await withBackoff(() => connection.getBalance(pubkey));
    } catch (e) {
      results[addr] = { status: "error", message: (e as Error).message };
      continue;
    }

    await sleep(300);

    // 4. Fetch token accounts
    let tokens: TokenBalance[] = [];
    let tokensError: string | undefined;
    try {
      const legacyAccounts = await withBackoff(() =>
        connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID })
      );

      await sleep(200);

      const token2022Accounts = await withBackoff(() =>
        connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID })
      );

      tokens = [...legacyAccounts.value, ...token2022Accounts.value]
        .map((account) => {
          const info = account.account.data.parsed.info;
          const mint = info.mint as string;
          const meta = tokenMeta.get(mint);
          return {
            mint,
            symbol: meta?.symbol ?? mint.slice(0, 4) + "…",
            name: meta?.name ?? "Token desconocido",
            uiAmount: (info.tokenAmount.uiAmount as number) ?? 0,
            decimals: info.tokenAmount.decimals as number,
          };
        })
        .filter((t) => t.uiAmount > 0)
        .sort((a, b) => b.uiAmount - a.uiAmount);
    } catch (e) {
      tokensError = (e as Error).message;
      console.error(`[balances] token fetch failed for ${addr}:`, tokensError);
    }

    // Only cache successful full fetches (not partial token errors)
    const walletData: Extract<WalletData, { status: "ok" }> = {
      status: "ok",
      sol: lamports / 1e9,
      tokens,
      tokensError,
    };
    results[addr] = tokensError ? walletData : setCached(addr, walletData);

    if (addresses.indexOf(addr) < addresses.length - 1) await sleep(400);
  }

  return NextResponse.json(results);
}
