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
  | { status: "ok"; sol: number; tokens: TokenBalance[]; tokensError?: string };

// ── In-memory token list cache (avoids re-fetching the 8 MB file each request) ──
let tokenMetaCache: Map<string, { symbol: string; name: string }> | null = null;
let tokenMetaCachedAt = 0;
const TOKEN_META_TTL_MS = 60 * 60 * 1000;

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

function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? clusterApiUrl("mainnet-beta");
}

/** Retry up to `attempts` times with exponential backoff. */
async function withBackoff<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** i)); // 800ms, 1.6s, 3.2s
      }
    }
  }
  throw lastErr;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const { addresses } = await req.json();

  if (!Array.isArray(addresses)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // disableRetryOnRateLimit: let us control retries ourselves
  const connection = new Connection(getRpcUrl(), {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });

  const tokenMeta = await getTokenMeta();
  const results: Record<string, WalletData> = {};

  // Process addresses sequentially to avoid flooding the RPC
  for (const addr of addresses) {
    // 1. Validate address format
    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(addr);
      if (!PublicKey.isOnCurve(pubkey.toBytes())) throw new Error("off-curve");
    } catch {
      results[addr] = { status: "invalid" };
      continue;
    }

    // 2. Fetch SOL balance (with backoff)
    let lamports: number;
    try {
      lamports = await withBackoff(() => connection.getBalance(pubkey));
    } catch (e) {
      results[addr] = { status: "error", message: (e as Error).message };
      continue;
    }

    // Small pause between getBalance and token account calls
    await sleep(300);

    // 3. Fetch token accounts (sequential, with backoff)
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

    results[addr] = { status: "ok", sol: lamports / 1e9, tokens, tokensError };

    // Pause between addresses
    if (addresses.indexOf(addr) < addresses.length - 1) await sleep(400);
  }

  return NextResponse.json(results);
}
