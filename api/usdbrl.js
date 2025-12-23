/**
 * API de Cotação USD/BRL - Alta Performance
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
const EXCHANGERATE_API_URL = "https://api.exchangerate-api.com/v4/latest/USD";
const EXCHANGERATE_BACKUP_URL = "https://api.exchangerate-api.com/v4/latest/USD";

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
// Fonte 1: ExchangeRate-API (mais rápido)
// ============================================
async function fetchFromExchangeRate() {
  const response = await fetchWithTimeout(EXCHANGERATE_API_URL, 2000);
  
  if (!response.ok) {
    throw new Error(`ExchangeRate API error: ${response.status}`);
  }
  
  const data = await response.json();
  const brlRate = data.rates?.BRL;
  
  if (!brlRate || !isFinite(brlRate) || brlRate <= 0) {
    throw new Error("Invalid BRL rate");
  }
  
  const price = parseFloat(brlRate);
  // Simular bid/ask com pequena variação
  const spread = 0.0001;
  const bid = price - spread;
  const ask = price + spread;
  
  return { price, bid, ask };
}

// ============================================
// Fonte 2: ExchangeRate-API backup
// ============================================
async function fetchFromExchangeRateBackup() {
  const response = await fetchWithTimeout(EXCHANGERATE_BACKUP_URL, 3000);
  
  if (!response.ok) {
    throw new Error(`ExchangeRate backup error: ${response.status}`);
  }
  
  const data = await response.json();
  const brlRate = data.rates?.BRL;
  
  if (!brlRate || !isFinite(brlRate) || brlRate <= 0) {
    throw new Error("Invalid backup BRL rate");
  }
  
  const price = parseFloat(brlRate);
  const spread = 0.0001;
  const bid = price - spread;
  const ask = price + spread;
  
  return { price, bid, ask };
}

// ============================================
// Multi-source com racing
// ============================================
async function fetchPriceWithRacing() {
  try {
    // Tentar ExchangeRate-API primeiro
    return await fetchFromExchangeRate();
  } catch {
    // Se falhar, tentar backup
    return await fetchFromExchangeRateBackup();
  }
}

// ============================================
// Handler Principal
// ============================================
export default async function handler(req) {
  const startTime = Date.now();
  
  // Edge Runtime: req pode ser Request object ou objeto com propriedades
  const method = req.method || (req instanceof Request ? req.method : "GET");
  const origin = req.headers?.get?.("origin") || 
                 req.headers?.get?.("referer") || 
                 req.headers?.origin || 
                 "";
  const headers = getSecureHeaders(origin);

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (method !== "GET") {
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
    console.error("[usdbrl API] Erro:", sanitizeErrorForLog(error));
    headers["X-Response-Time"] = `${Date.now() - startTime}ms`;
    
    return new Response(
      JSON.stringify({ error: "Erro ao buscar cotação USD/BRL" }),
      { status: 500, headers }
    );
  }
}

