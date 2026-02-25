export type Language = "es" | "en";

export type Translations = {
  numLocale: string;
  // Page
  notQueried: string;
  invalidAddress: string;
  networkError: string;
  tokenErrorShort: string;
  collapse: string;
  expand: string;
  networkErrorRetry: string;
  noTokens: string;
  tokenErrorRetry: string;
  retrying: string;
  remove: string;
  staked: string;
  unlock: string;
  addressPlaceholder: string;
  cancel: string;
  confirm: string;
  addAddress: string;
  totalAccumulated: string;
  liquid: string;
  inLP: string;
  inStaking: string;
  fetching: string;
  updateBalances: string;
  unknownToken: string;
  // Footer
  visits: string;
  // ConsentModal
  legalTitle: string;
  localStorageTitle: string;
  localStorageDesc: string;
  externalServicesTitle: string;
  externalServicesDesc: string;
  noFinancialAdviceTitle: string;
  noFinancialAdviceDesc: string;
  cookiesTitle: string;
  cookiesDescPre: string;
  cookiesDescPost: string;
  acceptBtn: string;
};

const es: Translations = {
  numLocale: "es-ES",
  notQueried: "Sin consultar",
  invalidAddress: "Dirección inválida",
  networkError: "Error de red",
  tokenErrorShort: "Error tokens",
  collapse: "Colapsar",
  expand: "Expandir",
  networkErrorRetry: "Error de red — intenta de nuevo",
  noTokens: "Sin tokens",
  tokenErrorRetry: "Error tokens — reintentar",
  retrying: "Reintentando…",
  remove: "Eliminar",
  staked: "staked",
  unlock: "unlock",
  addressPlaceholder: "Dirección de Solana...",
  cancel: "Cancelar",
  confirm: "Confirmar",
  addAddress: "+ Añadir dirección",
  totalAccumulated: "Total acumulado",
  liquid: "líquido",
  inLP: "en LP",
  inStaking: "en staking",
  fetching: "Consultando…",
  updateBalances: "Actualizar saldos",
  unknownToken: "Token desconocido",
  visits: "visitas",
  legalTitle: "Aviso Legal y Privacidad",
  localStorageTitle: "Almacenamiento local",
  localStorageDesc:
    "Las direcciones de wallet que introduzcas se guardan en el almacenamiento local de tu navegador (localStorage). Ningún servidor propio almacena ni procesa estos datos.",
  externalServicesTitle: "Servicios externos",
  externalServicesDesc:
    "Para consultar saldos, las direcciones se envían al nodo RPC público de Solana. Los precios se obtienen de DexScreener y los tipos de cambio de Frankfurter. Son servicios de terceros con sus propias políticas de privacidad.",
  noFinancialAdviceTitle: "Sin asesoramiento financiero",
  noFinancialAdviceDesc:
    "La información mostrada es puramente informativa y no constituye asesoramiento financiero, fiscal ni de inversión de ningún tipo.",
  cookiesTitle: "Cookies",
  cookiesDescPre: "Esta aplicación no utiliza cookies. Solo emplea",
  cookiesDescPost: "para recordar tus direcciones y tu aceptación de este aviso.",
  acceptBtn: "He leído y acepto",
};

const en: Translations = {
  numLocale: "en-US",
  notQueried: "Not queried",
  invalidAddress: "Invalid address",
  networkError: "Network error",
  tokenErrorShort: "Token error",
  collapse: "Collapse",
  expand: "Expand",
  networkErrorRetry: "Network error — try again",
  noTokens: "No tokens",
  tokenErrorRetry: "Token error — retry",
  retrying: "Retrying…",
  remove: "Remove",
  staked: "staked",
  unlock: "unlock",
  addressPlaceholder: "Solana address...",
  cancel: "Cancel",
  confirm: "Confirm",
  addAddress: "+ Add address",
  totalAccumulated: "Total balance",
  liquid: "liquid",
  inLP: "in LP",
  inStaking: "staked",
  fetching: "Fetching…",
  updateBalances: "Update balances",
  unknownToken: "Unknown token",
  visits: "visits",
  legalTitle: "Legal Notice & Privacy",
  localStorageTitle: "Local storage",
  localStorageDesc:
    "The wallet addresses you enter are saved in your browser's local storage (localStorage). No server stores or processes this data.",
  externalServicesTitle: "External services",
  externalServicesDesc:
    "To check balances, addresses are sent to Solana's public RPC node. Prices are obtained from DexScreener and exchange rates from Frankfurter. These are third-party services with their own privacy policies.",
  noFinancialAdviceTitle: "No financial advice",
  noFinancialAdviceDesc:
    "The information shown is purely informational and does not constitute financial, tax, or investment advice of any kind.",
  cookiesTitle: "Cookies",
  cookiesDescPre: "This application does not use cookies. It only uses",
  cookiesDescPost: "to remember your addresses and your acceptance of this notice.",
  acceptBtn: "I have read and accept",
};

export const translations: Record<Language, Translations> = { es, en };
