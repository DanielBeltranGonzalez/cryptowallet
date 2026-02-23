import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { AccountLayout, MintLayout, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export type WhirlpoolDetails = {
  tokenAMint: string;
  tokenASymbol: string;
  tokenAName: string;
  tokenAAmount: number;
  tokenADecimals: number;
  tokenBMint: string;
  tokenBSymbol: string;
  tokenBName: string;
  tokenBAmount: number;
  tokenBDecimals: number;
};

export type TokenBalance = {
  mint: string;
  symbol: string;
  name: string;
  uiAmount: number;
  decimals: number;
  stakingDetails?: {
    stakedAmount: number;  // UI amount of the underlying staked token
    stakedSymbol: string;  // "D2X" or "SCP"
    unlockAt?: number;     // Unix timestamp (seconds)
  };
  whirlpoolDetails?: WhirlpoolDetails;
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

// ── Orca Whirlpool position lookup ───────────────────────────────────────────
const WHIRLPOOL_PROGRAM_ID = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const WHIRLPOOL_POSITION_DISCRIMINATOR = Buffer.from([0xaa, 0xbc, 0x8f, 0xe4, 0x7a, 0x40, 0xf7, 0xd0]);

function readU128LE(buf: Buffer, offset: number): bigint {
  return (buf.readBigUInt64LE(offset + 8) << BigInt(64)) | buf.readBigUInt64LE(offset);
}

function tickIndexToSqrtPriceX64(tick: number): bigint {
  const sqrtPrice = Math.pow(1.0001, tick / 2);
  const TWO64 = BigInt(2) ** BigInt(64);
  const intPart = Math.floor(sqrtPrice);
  return BigInt(intPart) * TWO64 + BigInt(Math.floor((sqrtPrice - intPart) * Number(TWO64)));
}

function calcWhirlpoolAmounts(
  liquidity: bigint,
  sqrtCurrent: bigint,
  tickCurrent: number,
  tickLower: number,
  tickUpper: number
): { amountA: bigint; amountB: bigint } {
  const sqrtLower = tickIndexToSqrtPriceX64(tickLower);
  const sqrtUpper = tickIndexToSqrtPriceX64(tickUpper);
  const TWO64 = BigInt(2) ** BigInt(64);

  if (tickCurrent < tickLower) {
    const amountA = liquidity * (sqrtUpper - sqrtLower) * TWO64 / (sqrtLower * sqrtUpper);
    return { amountA, amountB: BigInt(0) };
  } else if (tickCurrent >= tickUpper) {
    const amountB = liquidity * (sqrtUpper - sqrtLower) / TWO64;
    return { amountA: BigInt(0), amountB };
  } else {
    const amountA = liquidity * (sqrtUpper - sqrtCurrent) * TWO64 / (sqrtCurrent * sqrtUpper);
    const amountB = liquidity * (sqrtCurrent - sqrtLower) / TWO64;
    return { amountA, amountB };
  }
}

async function fetchWhirlpoolPositions(
  connection: Connection,
  decoded: { mint: string; amount: bigint }[],
  mintDecimalsMap: Map<string, number>,
  tokenListMap: Map<string, { symbol: string; name: string }>,
  localOnChainMeta: Map<string, { symbol: string; name: string }>
): Promise<Map<string, WhirlpoolDetails>> {
  const result = new Map<string, WhirlpoolDetails>();
  try {
    // Step 1: filter NFT-like candidates (decimals=0, amount >= 1)
    const candidates = decoded.filter((t) => {
      const decimals = mintDecimalsMap.get(t.mint) ?? 0;
      return decimals === 0 && Number(t.amount) >= 1;
    });
    if (candidates.length === 0) return result;

    // Step 2: derive Whirlpool position PDAs
    const whirlpoolProgramKey = new PublicKey(WHIRLPOOL_PROGRAM_ID);
    const candidatesWithPda = candidates.map((t) => {
      const mintBuf = new PublicKey(t.mint).toBytes();
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), mintBuf],
        whirlpoolProgramKey
      );
      return { mint: t.mint, pda };
    });

    // Step 3: batch fetch PDAs
    const pdaAccounts = await withBackoff(() =>
      connection.getMultipleAccountsInfo(candidatesWithPda.map((c) => c.pda))
    );

    // Step 4: filter valid position accounts and parse
    const positions: {
      mint: string;
      whirlpool: string;
      liquidity: bigint;
      tickLower: number;
      tickUpper: number;
    }[] = [];

    candidatesWithPda.forEach((candidate, i) => {
      const acct = pdaAccounts[i];
      if (!acct) return;
      if (acct.owner.toBase58() !== WHIRLPOOL_PROGRAM_ID) return;
      if (acct.data.length < 96) return;
      const data = Buffer.from(acct.data as Uint8Array);
      if (!WHIRLPOOL_POSITION_DISCRIMINATOR.equals(data.slice(0, 8))) return;

      const whirlpool = new PublicKey(data.slice(8, 40)).toBase58();
      const liquidity = readU128LE(data, 72);
      const tickLower = data.readInt32LE(88);
      const tickUpper = data.readInt32LE(92);
      positions.push({ mint: candidate.mint, whirlpool, liquidity, tickLower, tickUpper });
    });

    if (positions.length === 0) return result;

    // Step 5-6: batch fetch whirlpool accounts
    const uniqueWhirlpools = [...new Set(positions.map((p) => p.whirlpool))];
    const whirlpoolAccounts = await withBackoff(() =>
      connection.getMultipleAccountsInfo(uniqueWhirlpools.map((w) => new PublicKey(w)))
    );

    const whirlpoolDataMap = new Map<string, {
      sqrtPrice: bigint;
      tickCurrent: number;
      mintA: string;
      mintB: string;
    }>();

    uniqueWhirlpools.forEach((addr, i) => {
      const acct = whirlpoolAccounts[i];
      if (!acct || acct.data.length < 213) return;
      const data = Buffer.from(acct.data as Uint8Array);
      const sqrtPrice = readU128LE(data, 65);
      const tickCurrent = data.readInt32LE(81);
      const mintA = new PublicKey(data.slice(101, 133)).toBase58();
      const mintB = new PublicKey(data.slice(181, 213)).toBase58();
      whirlpoolDataMap.set(addr, { sqrtPrice, tickCurrent, mintA, mintB });
    });

    // Step 7-8: fetch decimals for mints not already in mintDecimalsMap
    const allPoolMints = [...new Set(
      [...whirlpoolDataMap.values()].flatMap((w) => [w.mintA, w.mintB])
    )].filter((m) => !mintDecimalsMap.has(m));

    const extraDecimalsMap = new Map<string, number>();
    if (allPoolMints.length > 0) {
      try {
        const mintInfos = await withBackoff(() =>
          connection.getMultipleAccountsInfo(allPoolMints.map((m) => new PublicKey(m)))
        );
        allPoolMints.forEach((mint, i) => {
          const data = mintInfos[i]?.data;
          if (data) {
            try { extraDecimalsMap.set(mint, MintLayout.decode(Buffer.from(data)).decimals); }
            catch { /* skip */ }
          }
        });
      } catch { /* skip */ }
    }

    // Step 9: resolve metadata for pool mints
    const allPoolMintsAll = [...new Set(
      [...whirlpoolDataMap.values()].flatMap((w) => [w.mintA, w.mintB])
    )];
    const unknownPoolMints = allPoolMintsAll.filter(
      (m) => !tokenListMap.has(m) && !localOnChainMeta.has(m)
    );
    const extraMeta = unknownPoolMints.length > 0
      ? await fetchOnChainMeta(unknownPoolMints, connection)
      : new Map<string, { symbol: string; name: string }>();

    const resolveMeta = (mint: string): { symbol: string; name: string } =>
      tokenListMap.get(mint) ??
      localOnChainMeta.get(mint) ??
      extraMeta.get(mint) ??
      { symbol: mint.slice(0, 4) + "…", name: "Token desconocido" };

    // Step 10: calculate amounts and build result
    for (const pos of positions) {
      const whirlpoolData = whirlpoolDataMap.get(pos.whirlpool);
      if (!whirlpoolData) continue;
      const { sqrtPrice, tickCurrent, mintA, mintB } = whirlpoolData;
      const decimalsA = mintDecimalsMap.get(mintA) ?? extraDecimalsMap.get(mintA) ?? 0;
      const decimalsB = mintDecimalsMap.get(mintB) ?? extraDecimalsMap.get(mintB) ?? 0;

      const { amountA, amountB } = calcWhirlpoolAmounts(
        pos.liquidity, sqrtPrice, tickCurrent, pos.tickLower, pos.tickUpper
      );
      const metaA = resolveMeta(mintA);
      const metaB = resolveMeta(mintB);

      result.set(pos.mint, {
        tokenAMint: mintA,
        tokenASymbol: metaA.symbol,
        tokenAName: metaA.name,
        tokenAAmount: Number(amountA) / Math.pow(10, decimalsA),
        tokenADecimals: decimalsA,
        tokenBMint: mintB,
        tokenBSymbol: metaB.symbol,
        tokenBName: metaB.name,
        tokenBAmount: Number(amountB) / Math.pow(10, decimalsB),
        tokenBDecimals: decimalsB,
      });
    }
  } catch { /* return partial result on any error */ }
  return result;
}

// ── ScPrime staking position lookup (D2XS and SCPS) ─────────────────────────
const SCPRIME_STAKING_PROGRAM = "iA2NuwXky5631nDQ2XkhPXauHvcHpi1gtqhwYUxkioZ";

// NFT symbol → { underlying token symbol, raw decimals, position account size in bytes }
const SCPRIME_STAKING_POSITIONS: Record<string, { symbol: string; decimals: number; positionSize: number }> = {
  D2XS: { symbol: "D2X", decimals: 3,  positionSize: 98 },
  SCPS: { symbol: "SCP", decimals: 9,  positionSize: 74 },
};

async function fetchScPrimeStaking(
  nftMintStr: string,
  positionSize: number,
  decimals: number,
  connection: Connection
): Promise<{ stakedAmount: number; stakedSymbol: string; unlockAt?: number } | null> {
  // stakedSymbol is resolved by the caller; we only need decimals and positionSize here
  try {
    const sigs = await withBackoff(() =>
      connection.getSignaturesForAddress(new PublicKey(nftMintStr), { limit: 10 })
    );
    if (sigs.length === 0) return null;

    // The creation tx is the oldest — last in the desc-ordered list
    for (const sig of [...sigs].reverse()) {
      const tx = await withBackoff(() =>
        connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 })
      );
      if (!tx) continue;

      type AnyKey = string | { pubkey?: { toBase58?: () => string } };
      const accountKeys: string[] = (tx.transaction.message.accountKeys as AnyKey[]).map((k) => {
        if (typeof k === "string") return k;
        return k.pubkey?.toBase58?.() ?? String(k.pubkey);
      });

      if (!accountKeys.includes(SCPRIME_STAKING_PROGRAM)) continue;

      const accts = await withBackoff(() =>
        connection.getMultipleAccountsInfo(accountKeys.map((a) => new PublicKey(a)))
      );

      for (const acct of accts) {
        if (
          acct &&
          acct.owner.toBase58() === SCPRIME_STAKING_PROGRAM &&
          acct.data.length === positionSize
        ) {
          const data = Buffer.from(acct.data as Uint8Array);
          const rawAmount = data.readBigUInt64LE(0);
          const stakedAmount = Number(rawAmount) / Math.pow(10, decimals);
          const unlockTimestamp = data.readUInt32LE(10);
          const unlockAt =
            unlockTimestamp > 1_700_000_000 && unlockTimestamp < 2_500_000_000
              ? unlockTimestamp
              : undefined;
          return { stakedAmount, stakedSymbol: "", unlockAt }; // symbol filled by caller
        }
      }
    }
    return null;
  } catch {
    return null;
  }
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

      // Fetch ScPrime staking details for D2XS and SCPS position NFTs
      const stakingDetailsMap = new Map<string, { stakedAmount: number; stakedSymbol: string; unlockAt?: number }>();
      const stakingNfts = decoded.filter((t) => {
        const meta = tokenList.get(t.mint) ?? onChainMeta.get(t.mint);
        return meta?.symbol !== undefined && meta.symbol in SCPRIME_STAKING_POSITIONS;
      });
      for (const t of stakingNfts) {
        const meta = tokenList.get(t.mint) ?? onChainMeta.get(t.mint);
        const posConfig = SCPRIME_STAKING_POSITIONS[meta!.symbol];
        await sleep(300);
        const details = await fetchScPrimeStaking(t.mint, posConfig.positionSize, posConfig.decimals, connection);
        if (details) stakingDetailsMap.set(t.mint, { ...details, stakedSymbol: posConfig.symbol });
      }

      await sleep(200);
      const whirlpoolPositions = await fetchWhirlpoolPositions(
        connection, decoded, mintDecimalsMap, tokenList, onChainMeta
      );

      tokens = decoded
        .map((t) => {
          const decimals = mintDecimalsMap.get(t.mint) ?? 0;
          const uiAmount = Number(t.amount.toString()) / Math.pow(10, decimals);
          const meta = tokenList.get(t.mint) ?? onChainMeta.get(t.mint);
          const base: TokenBalance = {
            mint: t.mint,
            symbol: meta?.symbol ?? t.mint.slice(0, 4) + "…",
            name: meta?.name ?? "Token desconocido",
            uiAmount,
            decimals,
          };
          const stakingDetails = stakingDetailsMap.get(t.mint);
          const whirlpoolDetails = whirlpoolPositions.get(t.mint);
          if (stakingDetails) return { ...base, stakingDetails };
          if (whirlpoolDetails) return { ...base, whirlpoolDetails };
          return base;
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
