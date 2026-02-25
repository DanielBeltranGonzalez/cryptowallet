# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

🚨 **Ejecuta `npm test` antes de cada commit** - Sin excepciones.
🚨 **TODOS LOS TESTS DEBEN PASAR** - No marques tareas como completas si fallan.
🚨 **Bump de versión en cada commit** - Incluye siempre el cambio de versión en `package.json` en el mismo commit que el cambio. Usa **SemVer**: PATCH para fixes/estilos, MINOR para features, MAJOR para cambios que rompen compatibilidad.
🚨 **NUNCA hagas `git push` automáticamente** - Puedes sugerirlo al final de una tarea, pero siempre requiere aprobación explícita del usuario antes de ejecutarlo.

## Docker

Cuando el usuario diga **"prepara para portainer"**, genera o actualiza los dos ficheros siguientes adaptados al proyecto:

**`Dockerfile`** — multi-stage (`deps` → `builder` → `runner`) sobre la imagen base adecuada. Usuario no-root. `EXPOSE` del puerto de la app. `CMD` para arrancar el servidor.

**`docker-compose.yml`** — con:
- `build: .`
- `container_name`
- `ports` usando `${HOST_PORT:-XXXX}:XXXX`
- `environment` con las variables necesarias
- `volumes` para datos persistentes
- `restart: unless-stopped`
- `healthcheck` obligatorio (ver regla abajo)

---

🚨 **Todo `docker-compose.yml` debe incluir `healthcheck`** en cada servicio. Usa `wget` (disponible en Alpine) en lugar de `curl`. Ejemplo mínimo:

```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:PORT/"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 30s
```

## Commands

```bash
npm run dev -- -H 0.0.0.0   # Start development server bound to all interfaces (remote accessible)
npm run build    # Production build
npm run lint     # Run ESLint
```

Tests use **Jest** + **@testing-library/react**. Files in `src/__tests__/` or matching `*.test.{ts,tsx}`.

## Architecture

**Next.js 16 App Router** project with TypeScript and Tailwind CSS v4.

- `src/app/page.tsx` — Client component. Manages a list of Solana addresses in local state and fetches their balances via the internal API route. Displays per-address balances and a total SOL sum.
- `src/app/api/balances/route.ts` — Next.js Route Handler (POST). Accepts `{ addresses: string[] }`, queries Solana **mainnet-beta** via `@solana/web3.js` using `clusterApiUrl`, and returns a `Record<string, number | null>` mapping each address to its SOL balance (or `null` if the address is invalid).
- `src/app/layout.tsx` — Root layout with Geist font variables applied globally.

**Data flow:** UI (client) → `POST /api/balances` (server) → Solana RPC (mainnet-beta) → response back to UI.

The API uses the public Solana RPC endpoint (`clusterApiUrl("mainnet-beta")`). Rate limits may apply for production use — consider a dedicated RPC provider.
