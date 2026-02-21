# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev -- -H 0.0.0.0   # Start development server bound to all interfaces (remote accessible)
npm run build    # Production build
npm run lint     # Run ESLint
```

No test framework is configured yet.

## Architecture

**Next.js 16 App Router** project with TypeScript and Tailwind CSS v4.

- `src/app/page.tsx` — Client component. Manages a list of Solana addresses in local state and fetches their balances via the internal API route. Displays per-address balances and a total SOL sum.
- `src/app/api/balances/route.ts` — Next.js Route Handler (POST). Accepts `{ addresses: string[] }`, queries Solana **mainnet-beta** via `@solana/web3.js` using `clusterApiUrl`, and returns a `Record<string, number | null>` mapping each address to its SOL balance (or `null` if the address is invalid).
- `src/app/layout.tsx` — Root layout with Geist font variables applied globally.

**Data flow:** UI (client) → `POST /api/balances` (server) → Solana RPC (mainnet-beta) → response back to UI.

The API uses the public Solana RPC endpoint (`clusterApiUrl("mainnet-beta")`). Rate limits may apply for production use — consider a dedicated RPC provider.
