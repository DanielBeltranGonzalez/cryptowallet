import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

export async function POST(req: NextRequest) {
  const { addresses } = await req.json();

  if (!Array.isArray(addresses)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
  const results: Record<string, number | null> = {};

  await Promise.all(
    addresses.map(async (addr: string) => {
      try {
        const pubkey = new PublicKey(addr);
        const lamports = await connection.getBalance(pubkey);
        results[addr] = lamports / 1e9;
      } catch {
        results[addr] = null;
      }
    })
  );

  return NextResponse.json(results);
}
