/**
 * API de Cotação USD/BRL - Banco Central do Brasil (PTAX)
 * 
 * Fonte principal: API PTAX do Banco Central do Brasil (cotação oficial)
 * Fallback: AwesomeAPI (caso BCB não esteja disponível)
 * 
 * Otimizações:
 * 1. Edge runtime para menor latência
 * 2. Cache desabilitado para atualizações em tempo real
 * 3. Multi-source com fallback automático
 * 4. Headers otimizados
 * 
 * Nota: A API PTAX do BCB fornece cotações oficiais, mas geralmente
 * é atualizada apenas em dias úteis. Em caso de indisponibilidade,
 * usa-se o fallback AwesomeAPI para continuidade do serviço.
 */

export const runtime = "edge";

// ============================================
// URLs de API - Banco Central do Brasil (PTAX)
// ============================================
// API PTAX do Banco Central - Cotação oficial USD/BRL
// Formato: MM-DD-YYYY (mês-dia-ano)
function getBcbPtaxUrl() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const year = today.getFullYear();
  const dateStr = `${month}-${day}-${year}`;
  
  return `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`;
}

// Fallback: AwesomeAPI (caso BCB não esteja disponível)
const AWESOMEAPI_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL";

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

  try {
    // Em produção, permitir qualquer origin do domínio Vercel ou localhost
    // Isso garante que funciona mesmo se o origin não for detectado corretamente
    const isAllowedOrigin = origin && (
      ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed)) ||
      origin.includes("nova-solidum") ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1")
    );

    if (isAllowedOrigin || !origin) {
      // Se não houver origin (requisição do mesmo domínio), permitir
      headers["Access-Control-Allow-Origin"] = origin || "*";
      headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type, Accept";
    }
  } catch (headerError) {
    // Ignorar erros de header
  }

  return headers;
}

// ============================================
// Fetch com timeout
// ============================================
async function fetchWithTimeout(url, timeoutMs = 2000) {
  let timeoutId = null;
  
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });
    
    return response;
  } catch (fetchError) {
    throw fetchError;
  } finally {
    // clearTimeout pode não existir no Edge Runtime
    if (typeof clearTimeout !== 'undefined' && timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================
// Fonte 1: Banco Central do Brasil (PTAX) - Fonte oficial
// ============================================
async function fetchFromBancoCentral() {
  try {
    // Tentar data de hoje primeiro
    let url = getBcbPtaxUrl();
    let response = await fetchWithTimeout(url, 3000);
    
    if (!response.ok) {
      throw new Error(`BCB API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Se não houver dados para hoje, tentar dia anterior (útil)
    if (!data.value || data.value.length === 0) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const month = String(yesterday.getMonth() + 1).padStart(2, '0');
      const day = String(yesterday.getDate()).padStart(2, '0');
      const year = yesterday.getFullYear();
      const dateStr = `${month}-${day}-${year}`;
      
      url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`;
      response = await fetchWithTimeout(url, 3000);
      
      if (!response.ok) {
        throw new Error(`BCB API error: ${response.status}`);
      }
      
      const dataYesterday = await response.json();
      if (!dataYesterday.value || dataYesterday.value.length === 0) {
        throw new Error("No BCB data available");
      }
      
      // Usar dados do dia anterior
      const cotacao = dataYesterday.value[0];
      const cotacaoCompra = parseFloat(cotacao.cotacaoCompra);
      const cotacaoVenda = parseFloat(cotacao.cotacaoVenda);
      
      if (!isFinite(cotacaoCompra) || !isFinite(cotacaoVenda) || cotacaoCompra <= 0 || cotacaoVenda <= 0) {
        throw new Error("Invalid BCB price data");
      }
      
      const price = (cotacaoCompra + cotacaoVenda) / 2;
      return { price, bid: cotacaoCompra, ask: cotacaoVenda };
    }
    
    // Usar dados de hoje
    const cotacao = data.value[0];
    const cotacaoCompra = parseFloat(cotacao.cotacaoCompra);
    const cotacaoVenda = parseFloat(cotacao.cotacaoVenda);
    
    if (!isFinite(cotacaoCompra) || !isFinite(cotacaoVenda) || cotacaoCompra <= 0 || cotacaoVenda <= 0) {
      throw new Error("Invalid BCB price data");
    }
    
    const price = (cotacaoCompra + cotacaoVenda) / 2;
    return { price, bid: cotacaoCompra, ask: cotacaoVenda };
    
  } catch (apiError) {
    throw apiError;
  }
}

// ============================================
// Fonte 2: AwesomeAPI (fallback caso BCB não esteja disponível)
// ============================================
async function fetchFromAwesomeAPI() {
  try {
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
  } catch (apiError) {
    throw apiError;
  }
}

// ============================================
// Multi-source com racing - Banco Central primeiro, depois fallback
// ============================================
async function fetchPriceWithRacing() {
  const sources = [
    () => fetchFromBancoCentral(), // Prioridade: Banco Central (fonte oficial)
    () => fetchFromAwesomeAPI(),   // Fallback: AwesomeAPI
  ];
  
  // Tentar todas as fontes em paralelo, usar a primeira que responder com sucesso
  const results = await Promise.allSettled(sources.map(source => source()));
  
  for (const result of results) {
    if (result.status === 'fulfilled') {
      return result.value;
    }
  }
  
  // Se todas falharam, lançar o último erro
  const lastError = results[results.length - 1];
  if (lastError.status === 'rejected') {
    throw lastError.reason || new Error("All API sources failed");
  }
  
  throw new Error("All API sources failed");
}

// ============================================
// Handler Principal (Edge Runtime)
// ============================================
export async function OPTIONS(req) {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const headers = getSecureHeaders(origin);
  return new Response(null, { status: 204, headers });
}

export async function GET(req) {
  const startTime = Date.now();
  
  try {
    // Edge Runtime: req é sempre um Request object
    const method = req.method;
    const origin = req.headers.get("origin") || req.headers.get("referer") || "";
    const headers = getSecureHeaders(origin);

    if (method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers }
      );
    }

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

    // Salvar no cache
    priceCache = responseData;
    cacheExpiry = now + CACHE_TTL_MS;

    headers["X-Cache-Status"] = "MISS";
    headers["X-Response-Time"] = `${Date.now() - startTime}ms`;

    return new Response(JSON.stringify(responseData), { status: 200, headers });
    
  } catch (error) {
    console.error("[usdbrl API] Erro:", sanitizeErrorForLog(error));
    
    try {
      const origin = req.headers?.get("origin") || req.headers?.get("referer") || "";
      const headers = getSecureHeaders(origin);
      headers["X-Response-Time"] = `${Date.now() - startTime}ms`;
      
      // Em caso de erro, retornar valores do cache se disponível (fallback)
      if (priceCache && Date.now() - priceCache.ts < 60000) { // Cache válido por 1 minuto em caso de erro
        headers["X-Cache-Status"] = "ERROR-FALLBACK";
        return new Response(JSON.stringify(priceCache), { status: 200, headers });
      }
      
      return new Response(
        JSON.stringify({ 
          error: "Erro ao buscar cotação USD/BRL",
          message: process.env.NODE_ENV === "development" ? error.message : undefined
        }),
        { status: 500, headers }
      );
    } catch (innerError) {
      return new Response(
        JSON.stringify({ error: "Erro interno do servidor" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
}
