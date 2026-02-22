import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { AccountLayout, MintLayout, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

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

// Maximum number of addresses accepted per request (DoS protection)
const MAX_ADDRESSES = 20;

// ── Token list cache (Solana Labs, ~13k known tokens) ────────────────────────
let tokenListCache: Map<string, { symbol: string; name: string }> | null = null;
let tokenListCachedAt = 0;
const TOKEN_LIST_TTL_MS = 60 * 60 * 1000;

async function getTokenList(): Promise<Map<string, { symbol: string; name: string }>> {
  if (tokenListCache && Date.now() - tokenListCachedAt < TOKEN_LIST_TTL_MS) {
    return tokenListCache;
  }
  try {
    // Timeout to prevent indefinite hangs on slow/unresponsive upstream
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(
        "https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json",
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Validate HTTP response before parsing
    if (!res.ok) throw new Error(`Token list fetch failed: HTTP ${res.status}`);

    const data = await res.json() as unknown;
    if (
      typeof data !== "object" ||
      data === null ||
      !Array.isArray((data as { tokens?: unknown }).tokens)
    ) {
      throw new Error("Unexpected token list format");
    }

    tokenListCache = new Map(
      ((data as { tokens: { chainId: number; address: string; symbol: string; name: string }[] }).tokens)
        .filter((t) => t.chainId === 101 && typeof t.address === "string")
        .map((t) => [t.address, { symbol: String(t.symbol ?? ""), name: String(t.name ?? "") }])
    );
    tokenListCachedAt = Date.now();
  } catch {
    if (!tokenListCache) tokenListCache = new Map();
  }
  return tokenListCache;
}

// ── On-chain Metaplex metadata ───────────────────────────────────────────────
// Official Metaplex Token Metadata program ID (mainnet-beta)
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
// Persistent per-mint cache (metadata is immutable in practice)
const onChainMetaCache = new Map<string, { symbol: string; name: string } | null>();

function deriveMetadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBytes(), mint.toBytes()],
    METADATA_PROGRAM_ID
  )[0];
}

function parseMetaplexAccount(data: Buffer): { name: string; symbol: string } | null {
  // Layout: 1 (key) + 32 (update_auth) + 32 (mint) + 4+32 (name) + 4+10 (symbol)
  if (data.length < 115 || data[0] !== 4) return null; // key 4 = MetadataV1
  try {
    const name   = data.slice(69,  101).toString("utf8").replace(/\0+$/, "").trim();
    const symbol = data.slice(105, 115).toString("utf8").replace(/\0+$/, "").trim();
    if (!name && !symbol) return null;
    // Limit lengths to prevent display abuse
    return {
      name:   name.slice(0, 50)   || "?",
      symbol: symbol.slice(0, 20) || "?",
    };
  } catch {
    return null;
  }
}

async function fetchOnChainMeta(
  mints: string[],
  connection: Connection
): Promise<Map<string, { symbol: string; name: string }>> {
  const result = new Map<string, { symbol: string; name: string }>();
  const uncached = mints.filter((m) => !onChainMetaCache.has(m));

  if (uncached.length > 0) {
    const pdas = uncached.map((mint) => ({
      mint,
      pda: deriveMetadataPda(new PublicKey(mint)),
    }));

    // Batch in groups of 100 (RPC limit)
    for (let i = 0; i < pdas.length; i += 100) {
      const batch = pdas.slice(i, i + 100);
      try {
        const accounts = await withBackoff(() =>
          connection.getMultipleAccountsInfo(batch.map((p) => p.pda))
        );
        accounts.forEach((account, j) => {
          const { mint } = batch[j];
          if (account?.data) {
            const parsed = parseMetaplexAccount(Buffer.from(account.data as Uint8Array));
            onChainMetaCache.set(mint, parsed);
          } else {
            onChainMetaCache.set(mint, null);
          }
        });
      } catch {
        // On failure leave mints uncached; they'll retry next time
      }
    }
  }

  for (const mint of mints) {
    const meta = onChainMetaCache.get(mint);
    if (meta) result.set(mint, meta);
  }
  return result;
}

// ── Wallet data cache ────────────────────────────────────────────────────────
type CacheEntry = { data: Extract<WalletData, { status: "ok" }>; cachedAt: number };
const walletCache = new Map<string, CacheEntry>();
const WALLET_CACHE_TTL_MS = 5 * 60 * 1000;

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? clusterApiUrl("mainnet-beta");
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function withBackoff<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
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
  const body = await req.json() as unknown;

  // Validate request body shape
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { addresses, force } = body as Record<string, unknown>;

  if (!Array.isArray(addresses)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // DoS protection: cap number of addresses per request
  if (addresses.length > MAX_ADDRESSES) {
    return NextResponse.json(
      { error: `Too many addresses (max ${MAX_ADDRESSES})` },
      { status: 400 }
    );
  }

  // Validate each address is a non-empty string
  if (!addresses.every((a) => typeof a === "string" && a.length > 0 && a.length <= 100)) {
    return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
  }

  // Validate `force` is boolean (ignore other types)
  const forceRefresh = force === true;

  const connection = new Connection(getRpcUrl(), {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });

  const tokenList = await getTokenList();
  const results: Record<string, WalletData> = {};

  for (const addr of addresses as string[]) {
    // Return cache if fresh
    if (!forceRefresh) {
      const cached = getCached(addr);
      if (cached) { results[addr] = cached; continue; }
    }

    // Validate address format
    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(addr);
      if (!PublicKey.isOnCurve(pubkey.toBytes())) throw new Error("off-curve");
    } catch {
      results[addr] = { status: "invalid" };
      continue;
    }

    // Fetch SOL balance
    let lamports: number;
    try {
      lamports = await withBackoff(() => connection.getBalance(pubkey));
    } catch (e) {
      results[addr] = { status: "error", message: toErrorMessage(e) };
      continue;
    }

    await sleep(300);

    // Fetch token accounts (raw encoding — cheaper RPC call than parsed variant)
    let tokens: TokenBalance[] = [];
    let tokensError: string | undefined;
    try {
      const legacyRaw = await withBackoff(() =>
        connection.getTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID })
      );
      await sleep(200);
      const token2022Raw = await withBackoff(() =>
        connection.getTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID })
      );

      // Decode raw SPL token account layout
      const decoded = [...legacyRaw.value, ...token2022Raw.value].flatMap(({ account }) => {
        try {
          const d = AccountLayout.decode(Buffer.from(account.data));
          return [{ mint: new PublicKey(d.mint).toBase58(), amount: d.amount, state: d.state }];
        } catch { return []; }
      }).filter((t) => t.state === 1 && Number(t.amount.toString()) > 0);

      // Batch-fetch mint decimals in one call
      const uniqueMints = [...new Set(decoded.map((t) => t.mint))];
      const mintDecimalsMap = new Map<string, number>();
      if (uniqueMints.length > 0) {
        await sleep(200);
        try {
          const mintInfos = await withBackoff(() =>
            connection.getMultipleAccountsInfo(uniqueMints.map((m) => new PublicKey(m)))
          );
          uniqueMints.forEach((mint, i) => {
            const data = mintInfos[i]?.data;
            if (data) {
              try { mintDecimalsMap.set(mint, MintLayout.decode(Buffer.from(data)).decimals); }
              catch { /* skip */ }
            }
          });
        } catch { /* decimals default to 0 */ }
      }

      // Resolve token metadata
      const unknownMints = uniqueMints.filter((m) => !tokenList.has(m));
      const onChainMeta = unknownMints.length > 0
        ? await fetchOnChainMeta(unknownMints, connection)
        : new Map<string, { symbol: string; name: string }>();

      tokens = decoded
        .map((t) => {
          const decimals = mintDecimalsMap.get(t.mint) ?? 0;
          const uiAmount = Number(t.amount.toString()) / Math.pow(10, decimals);
          const meta = tokenList.get(t.mint) ?? onChainMeta.get(t.mint);
          return {
            mint: t.mint,
            symbol: meta?.symbol ?? t.mint.slice(0, 4) + "…",
            name: meta?.name ?? "Token desconocido",
            uiAmount,
            decimals,
          };
        })
        .filter((t) => t.uiAmount > 0)
        .sort((a, b) => {
          const aUnknown = a.name === "Token desconocido" ? 1 : 0;
          const bUnknown = b.name === "Token desconocido" ? 1 : 0;
          if (aUnknown !== bUnknown) return aUnknown - bUnknown;
          return b.uiAmount - a.uiAmount;
        });
    } catch (e) {
      // Omit address from log to avoid exposing user data
      tokensError = toErrorMessage(e);
      console.error("[balances] token fetch failed:", tokensError);
    }

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
