# CryptoWallet

Visor de saldos de wallets Solana. Muestra SOL, tokens SPL, posiciones de staking ScPrime (D2X, SCP) y posiciones de liquidez Orca Whirlpool, con un panel de totales agregados.

## Requisitos

- Node.js 18+
- Acceso a Solana mainnet-beta (RPC público por defecto)

## Instalación

```bash
npm install
```

## Uso

### Desarrollo
```bash
npm run dev -- -H 0.0.0.0
```

### Producción
```bash
npm run build && npm start -- -H 0.0.0.0
```

O usa el script incluido:
```bash
./lanzar.sh
```

La app estará disponible en `http://localhost:3000`.

## Funcionalidades

- Múltiples wallets de Solana simultáneas
- Balance de SOL y tokens SPL (Token Program + Token 2022)
- Detección de posiciones de staking ScPrime (D2XS, SCPS)
- Detección de posiciones de liquidez Orca Whirlpool
- Panel de totales agregados con desglose líquido / LP / staking
- Persistencia de direcciones en localStorage
- Enlace a Solscan por wallet

## Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `SOLANA_RPC_URL` | URL del RPC de Solana | `clusterApiUrl("mainnet-beta")` |

## Tests

```bash
npm test
```
