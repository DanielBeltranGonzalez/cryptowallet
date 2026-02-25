# CryptoWallet

Visor de saldos de wallets Solana. Añade una o varias direcciones y consulta de un vistazo:

- Balance de SOL y tokens SPL (Token Program y Token 2022)
- Posiciones de staking ScPrime (D2XS / SCPS) con importe bloqueado y fecha de desbloqueo
- Posiciones de liquidez Orca Whirlpool
- Panel de totales agregados: líquido, LP y staking por separado
- Precios en USD y EUR via DexScreener
- Contador de visitas persistente

Las direcciones se guardan en `localStorage` para que no tengas que volver a introducirlas.

## Requisitos

- Node.js 20+
- Acceso a Solana mainnet-beta (RPC público por defecto; se recomienda un endpoint propio en producción)

## Desarrollo local

```bash
npm install
npm run dev -- -H 0.0.0.0
```

La app estará disponible en `http://localhost:3000`.

Otros comandos útiles:

```bash
npm run build   # Build de producción
npm run lint    # ESLint
npm test        # Tests (Jest + Testing Library)
```

## Docker

La imagen se construye en tres etapas (deps → builder → runner) sobre `node:20-alpine` y corre como usuario no-root.

```bash
docker compose up -d
```

Por defecto escucha en el puerto 3000 del host. Para cambiarlo:

```bash
HOST_PORT=8080 docker compose up -d
```

## Despliegue en Portainer desde repositorio Git

> Portainer CE 2.x / BE con la funcionalidad **Stacks → Git repository**.

### Requisitos previos

- Portainer corriendo y accesible
- Acceso a internet desde el servidor (para clonar el repo y descargar imágenes base)

### Pasos

1. En Portainer, ve a **Stacks → Add stack**.
2. Pon un nombre (p. ej. `cryptowallet`).
3. Selecciona **Repository** como método de despliegue.
4. Rellena los campos:
   - **Repository URL:** `https://github.com/DanielBeltranGonzalez/cryptowallet.git`
   - **Branch:** `master`
   - **Compose path:** `docker-compose.yml`
5. En la sección **Environment variables**, añade las que necesites:

   | Variable | Descripción | Ejemplo |
   |---|---|---|
   | `HOST_PORT` | Puerto del host | `3000` |
   | `SOLANA_RPC_URL` | RPC de Solana (opcional) | `https://tu-rpc-endpoint` |

6. Haz clic en **Deploy the stack**.

Portainer clonará el repositorio, construirá la imagen con el `Dockerfile` incluido y levantará el servicio. El volumen `views_data` se crea automáticamente para persistir el contador de visitas en `/data/views.json`.

### Actualizaciones

Para desplegar una nueva versión basta con ir a la stack en Portainer y pulsar **Pull and redeploy**. Portainer descargará los últimos cambios de `master`, reconstruirá la imagen y reiniciará el contenedor sin perder el volumen de datos.

## Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `HOST_PORT` | Puerto del host en el mapeo de puertos | `3000` |
| `SOLANA_RPC_URL` | URL del RPC de Solana | `clusterApiUrl("mainnet-beta")` |
| `VIEWS_FILE` | Ruta del fichero de contador de visitas | `views.json` (cwd) |

## Licencia

GPL v3 — ver `LICENSE`.
