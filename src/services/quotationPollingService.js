/**
 * Serviço de Fallback para Cotação USD/BRL
 * Usado apenas como fallback quando WebSocket não está disponível
 * Mantido para compatibilidade e inicialização
 */

/**
 * Busca cotação da API existente (Banco Central / AwesomeAPI)
 */
async function fetchQuotation() {
  try {
    // Importar função diretamente da API para evitar chamada HTTP interna
    const { GET } = await import('../../api/usdbrl.js');
    const mockRequest = new Request('http://localhost/api/usdbrl', {
      method: 'GET',
      headers: new Headers({
        'Accept': 'application/json',
      }),
    });

    const response = await GET(mockRequest);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    // Converter formato da API para formato do cache
    return {
      bid: data.bid || data.price,
      ask: data.ask || data.price,
      spread: (data.ask || data.price) - (data.bid || data.price),
      timestamp: data.ts ? new Date(data.ts).toISOString() : new Date().toISOString(),
      source: 'Banco Central / AwesomeAPI',
    };
  } catch (error) {
    throw error;
  }
}

export { fetchQuotation };

