/**
 * API de Cotação USDT/BRL - Alta Performance
 * 
 * Fallback HTTP para quando WebSocket falha
 * 
 * Otimizações:
 * 1. Edge runtime para menor latência
 * 2. Cache curto para reduzir chamadas
 * 3. Multi-source para máxima disponibilidade
 * 4. Headers otimizados
 */

export const runtime = "edge";

// ============================================
// URLs de API (múltiplas fontes)
// ============================================
const BINANCE_API_URL = "https://api.binance.com/api/v3/ticker/price?symbol=USDTBRL";
const BINANCE_BACKUP_URL = "https://api1.binance.com/api/v3/ticker/price?symbol=USDTBRL";
const BINANCE_BOOKTICKER_URL = "https://api.binance.com/api/v3/ticker/bookTicker?symbol=USDTBRL";

// ============================================
// Cache ultracurto (1 segundo)
// ============================================
let priceCache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 1000; // 1 segundo - dados de cotação mudam rápido

// ============================================
// Segurança
// ============================================
const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN || "https://nova-solidum.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function sanitizeErrorForLog(error) {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  return { message: String(error) };
}

function getSecureHeaders(origin) {
  const headers = {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-cache, max-age=1",
    "X-Response-Time": "0",
  };

  if (origin && ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Accept";
  }

  return headers;
}

// ============================================
// Fetch com timeout
// ============================================
async function fetchWithTimeout(url, timeoutMs = 2000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// Fonte 1: Binance ticker/price (mais rápido)
// ============================================
async function fetchFromBinancePrice() {
  const response = await fetchWithTimeout(BINANCE_API_URL, 2000);
  
  if (!response.ok) {
    throw new Error(`Binance error: ${response.status}`);
  }
  
  const data = await response.json();
  const price = parseFloat(data.price);
  
  if (!isFinite(price) || price <= 0) {
    throw new Error("Invalid price");
  }
  
  return { price, bid: price, ask: price };
}

// ============================================
// Fonte 2: Binance bookTicker (bid/ask preciso)
// ============================================
async function fetchFromBinanceBook() {
  const response = await fetchWithTimeout(BINANCE_BOOKTICKER_URL, 2000);
  
  if (!response.ok) {
    throw new Error(`Binance book error: ${response.status}`);
  }
  
  const data = await response.json();
  const bid = parseFloat(data.bidPrice);
  const ask = parseFloat(data.askPrice);
  const price = (bid + ask) / 2;
  
  if (!isFinite(price) || price <= 0) {
    throw new Error("Invalid book price");
  }
  
  return { price, bid, ask };
}

// ============================================
// Fonte 3: Binance backup
// ============================================
async function fetchFromBinanceBackup() {
  const response = await fetchWithTimeout(BINANCE_BACKUP_URL, 3000);
  
  if (!response.ok) {
    throw new Error(`Binance backup error: ${response.status}`);
  }
  
  const data = await response.json();
  const price = parseFloat(data.price);
  
  if (!isFinite(price) || price <= 0) {
    throw new Error("Invalid backup price");
  }
  
  return { price, bid: price, ask: price };
}

// ============================================
// Multi-source com racing
// ============================================
async function fetchPriceWithRacing() {
  try {
    // Disparar todas as fontes em paralelo, usar a primeira
    const result = await Promise.any([
      fetchFromBinancePrice(),
      fetchFromBinanceBook(),
    ]);
    return result;
  } catch {
    // Todas falharam, tentar backup
    return await fetchFromBinanceBackup();
  }
}

// ============================================
// Handler Principal
// ============================================
export default async function handler(req) {
  const startTime = Date.now();
  const origin = req.headers.get?.("origin") || req.headers?.origin || "";
  const headers = getSecureHeaders(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers }
    );
  }

  try {
    // Verificar cache
    const now = Date.now();
    if (priceCache && now < cacheExpiry) {
      headers["X-Cache-Status"] = "HIT";
      headers["X-Response-Time"] = `${now - startTime}ms`;
      return new Response(JSON.stringify(priceCache), { status: 200, headers });
    }

    // Buscar preço com racing
    const { price, bid, ask } = await fetchPriceWithRacing();

    // Criar resposta
    const responseData = {
      price,
      bid,
      ask,
      ts: now,
      latency: Date.now() - startTime,
    };

    // Salvar no cache
    priceCache = responseData;
    cacheExpiry = now + CACHE_TTL_MS;

    headers["X-Cache-Status"] = "MISS";
    headers["X-Response-Time"] = `${Date.now() - startTime}ms`;

    return new Response(JSON.stringify(responseData), { status: 200, headers });
    
  } catch (error) {
    console.error("[usdtbrl API] Erro:", sanitizeErrorForLog(error));
    headers["X-Response-Time"] = `${Date.now() - startTime}ms`;
    
    return new Response(
      JSON.stringify({ error: "Erro ao buscar cotação" }),
      { status: 500, headers }
    );
  }
}
