/**
 * Cache global em memória para cotação USD/BRL
 * Singleton pattern - única instância compartilhada
 */

let cache = null;

/**
 * Estrutura do cache:
 * {
 *   data: {
 *     bid: number,
 *     ask: number,
 *     spread: number,
 *     timestamp: string,
 *     source: "Banco Central / AwesomeAPI"
 *   },
 *   lastUpdate: string
 * }
 */

/**
 * Atualiza o cache com novos dados
 * @param {Object} data - Dados da cotação
 */
function updateCache(data) {
  cache = {
    data: {
      bid: data.bid,
      ask: data.ask,
      spread: data.spread,
      timestamp: data.timestamp,
      source: data.source || 'Banco Central / AwesomeAPI',
    },
    lastUpdate: new Date().toISOString(),
  };
}

/**
 * Obtém dados do cache
 * @returns {Object|null} Dados do cache ou null se vazio
 */
function getCache() {
  return cache;
}

/**
 * Verifica se o cache está válido
 * @returns {boolean}
 */
function hasCache() {
  return cache !== null;
}

/**
 * Limpa o cache (útil para testes)
 */
function clearCache() {
  cache = null;
}

/**
 * Obtém status do cache
 * @returns {Object}
 */
function getCacheStatus() {
  return {
    hasData: hasCache(),
    lastUpdate: cache?.lastUpdate || null,
    data: cache?.data || null,
  };
}

export { updateCache, getCache, hasCache, clearCache, getCacheStatus };

