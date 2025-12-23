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
const AWESOMEAPI_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL";
const EXCHANGERATE_API_URL = "https://api.exchangerate-api.com/v4/latest/USD";
const EXCHANGERATE_BACKUP_URL = "https://open.er-api.com/v6/latest/USD";

// ============================================
// Cache desabilitado para atualizações em tempo real
// ============================================
let priceCache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 0; // Cache desabilitado - sempre buscar valores frescos

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
// Fonte 1: AwesomeAPI (mais rápido, bid/ask preciso)
// ============================================
async function fetchFromAwesomeAPI() {
  // Adicionar timestamp único para evitar cache do navegador/CDN e forçar atualização
  const cacheBuster = Date.now();
  const url = `${AWESOMEAPI_URL}?t=${cacheBuster}&_=${cacheBuster}`;
  const response = await fetchWithTimeout(url, 2000);
  
  if (!response.ok) {
    throw new Error(`AwesomeAPI error: ${response.status}`);
  }
  
  const data = await response.json();
  const usdBrl = data["USD-BRL"] || data["USDBRL"];
  
  if (!usdBrl) {
    throw new Error("Invalid AwesomeAPI response");
  }
  
  const bid = parseFloat(usdBrl.bid);
  const ask = parseFloat(usdBrl.ask);
  const price = bid && ask ? (bid + ask) / 2 : parseFloat(usdBrl.high) || parseFloat(usdBrl.low);
  
  if (!isFinite(price) || price <= 0) {
    throw new Error("Invalid AwesomeAPI price");
  }
  
  return { price, bid: bid || price, ask: ask || price };
}

// ============================================
// Fonte 2: ExchangeRate-API (backup)
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
// Fonte 3: ExchangeRate-API backup
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
    // Disparar todas as fontes em paralelo, usar a primeira
    const result = await Promise.any([
      fetchFromAwesomeAPI(),
      fetchFromExchangeRate(),
    ]);
    return result;
  } catch {
    // Todas falharam, tentar backup
    return await fetchFromExchangeRateBackup();
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
    // Sempre buscar valores frescos (cache desabilitado para tempo real)
    const now = Date.now();
    
    // Buscar preço com racing
    const { price, bid, ask } = await fetchPriceWithRacing();

    // Criar resposta com timestamp sempre atualizado
    const responseData = {
      price,
      bid: bid || price, // Usar bid da API ou price como fallback
      ask: ask || price, // Usar ask da API ou price como fallback
      ts: now, // Sempre usar timestamp atual para garantir atualizações
      latency: Date.now() - startTime,
    };

    // Salvar no cache (mesmo que TTL seja 0, útil para debug)
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
