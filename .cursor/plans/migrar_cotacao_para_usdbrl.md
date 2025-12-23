# Migrar Cotação para USD/BRL (Dólar Americano)

## Objetivo
Migrar a cotação em tempo real de USDT/BRL para USD/BRL (dólar americano), atualizando todas as APIs e componentes relacionados.

## Arquivos a criar/modificar

### 1. Criar [`api/usdbrl.js`](api/usdbrl.js)
- Nova API endpoint para cotação USD/BRL
- Usar ExchangeRate-API (https://api.exchangerate-api.com/v4/latest/USD) - gratuita, sem necessidade de API key
- Alternativa: usar API do Banco Central do Brasil ou outras fontes confiáveis
- Implementar cache curto (1-2 segundos) para performance
- Retornar formato compatível com o hook atual: `{ price, bid, ask, ts, latency }`

### 2. Atualizar [`src/hooks/useUsdtBrl.ts`](src/hooks/useUsdtBrl.ts)
- Renomear para `useUsdBrl.ts` (opcional, ou manter nome mas mudar funcionalidade)
- Remover dependência do WebSocket da Binance (não há WebSocket público para USD/BRL)
- Implementar polling HTTP frequente (1-2 segundos) para simular tempo real
- Atualizar endpoint de `/api/usdtbrl` para `/api/usdbrl`
- Manter mesma interface de retorno para compatibilidade

### 3. Atualizar [`src/lib/marketdata/binanceWs.ts`](src/lib/marketdata/binanceWs.ts)
- Opção A: Criar novo arquivo `usdBrlPolling.ts` para polling HTTP
- Opção B: Manter arquivo mas não usar para USD/BRL
- Implementar polling com intervalo de 1-2 segundos
- Manter mesma interface de callbacks para compatibilidade

### 4. Atualizar [`src/App.tsx`](src/App.tsx)
- Atualizar import do hook (se renomeado)
- Atualizar labels de "USDT/BRL" para "USD/BRL"
- Atualizar título "Cotação USDT/BRL" para "Cotação USD/BRL"
- Manter mesma estrutura de UI

### 5. Atualizar [`src/components/TradingViewTicker.tsx`](src/components/TradingViewTicker.tsx)
- Atualizar símbolo padrão para `"FX_IDC:USDBRL"` (já feito anteriormente, verificar se precisa reverter)

### 6. Atualizar comentários e documentação
- Atualizar todos os comentários que mencionam USDT/BRL para USD/BRL
- Atualizar documentação do código

## Estratégia de implementação

### Fase 1: Criar API USD/BRL
- Criar `api/usdbrl.js` usando ExchangeRate-API
- Testar endpoint manualmente
- Implementar cache e tratamento de erros

### Fase 2: Atualizar Hook
- Modificar hook para usar polling HTTP ao invés de WebSocket
- Manter mesma interface de retorno
- Implementar polling com intervalo de 1-2 segundos

### Fase 3: Atualizar UI
- Atualizar todos os labels e textos
- Verificar se ticker TradingView está correto

### Fase 4: Testes
- Testar cotação em tempo real
- Verificar atualização frequente
- Validar cálculo de spread

## Notas importantes

1. **ExchangeRate-API**: Endpoint gratuito `https://api.exchangerate-api.com/v4/latest/USD` retorna todas as taxas em relação ao USD, incluindo BRL. Não requer API key no tier gratuito.

2. **Polling vs WebSocket**: Como não há WebSocket público para USD/BRL, usaremos polling HTTP com intervalo curto (1-2s) para simular tempo real.

3. **Compatibilidade**: Manter mesma interface do hook para não quebrar componentes que dependem dele.

4. **Performance**: Implementar cache curto na API para reduzir chamadas e melhorar latência.

