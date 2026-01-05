# Nova Solidum - Conversor USDT/BRL

Aplicação React para exibição de cotação USDT/BRL em tempo real usando WebSocket da Binance, com gráfico candlestick interativo.

## Características

- **Tempo real**: Conexão WebSocket direta com Binance Spot API
- **Spread configurável**: Aplica markup editável (padrão 0.7% = 70 bps) no preço base
- **Throttle assimétrico**:
  - Subida: atualiza no máximo a cada 3 segundos
  - Descida: atualiza no máximo a cada 10 segundos
- **Gráfico candlestick**: Gráfico interativo com TradingView Lightweight Charts
  - Histórico via REST API
  - Atualização em tempo real via WebSocket
  - Múltiplos timeframes (1H, 24H, 7D, 30D, 90D, 1Y, MAX)
- **Reconexão automática**: Backoff exponencial em caso de falha
- **Fallback HTTP**: Endpoint opcional para quando WebSocket falha
- Teste

## Estrutura do Projeto

```
src/
├── components/
│   └── UsdtBrlCandlesChart.tsx  # Componente do gráfico candlestick
├── lib/
│   ├── marketdata/
│   │   ├── binanceWs.ts         # Cliente WebSocket ticker
│   │   ├── binanceKlineWs.ts     # Cliente WebSocket klines
│   │   ├── fetchKlines.ts        # Busca candles históricos
│   │   └── timeframeMap.ts       # Mapeamento de timeframes
│   └── pricing/
│       └── spread.ts             # Lógica de aplicação de spread
├── hooks/
│   └── useUsdtBrl.ts             # Hook principal com throttle
├── App.tsx                       # Componente principal
└── main.tsx

api/
├── usdtbrl.ts                    # Endpoint cotação (Vercel)
└── klines.ts                     # Endpoint candles (Vercel)
```

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:5173`

**Nota**: Em desenvolvimento, os dados são buscados diretamente da Binance. Para testar os endpoints serverless localmente, use:

```bash
npx vercel dev
```

## Build

```bash
npm run build
```

## Deploy na Vercel

### Opção 1: Via CLI (Recomendado)

1. **Instalar Vercel CLI** (se ainda não tiver):
```bash
npm i -g vercel
```

2. **Fazer login**:
```bash
vercel login
```

3. **Deploy**:
```bash
vercel
```

4. **Deploy em produção**:
```bash
vercel --prod
```

### Opção 2: Via GitHub (Recomendado para CI/CD)

1. **Conectar repositório GitHub**:
   - Acesse [vercel.com](https://vercel.com)
   - Clique em "Add New Project"
   - Conecte seu repositório GitHub
   - Selecione o repositório `nova-solidum-conversor`

2. **Configurações do projeto**:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

3. **Deploy automático**:
   - A Vercel fará deploy automaticamente a cada push no branch principal
   - Pull Requests geram preview deployments

### Opção 3: Via Dashboard Vercel

1. Acesse [vercel.com/new](https://vercel.com/new)
2. Importe seu repositório Git (GitHub, GitLab, Bitbucket)
3. Configure:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Clique em "Deploy"

## Configurações

- **Spread padrão**: 70 bps (0.7%) - definido em `src/lib/pricing/spread.ts`
- **Throttle subida**: 3000ms - definido em `src/hooks/useUsdtBrl.ts`
- **Throttle descida**: 10000ms - definido em `src/hooks/useUsdtBrl.ts`
- **Timeframes**: Mapeados em `src/lib/marketdata/timeframeMap.ts`

## Endpoints API (Vercel Serverless Functions)

- `GET /api/usdtbrl` - Cotação USDT/BRL (fallback)
- `GET /api/klines?interval=<interval>&limit=<limit>` - Candles históricos

## Tecnologias

- React 18
- TypeScript
- Vite
- TradingView Lightweight Charts
- Vercel Serverless Functions
- Vitest (testes)

## Notas Importantes

- **Desenvolvimento local**: Os dados são buscados diretamente da Binance (sem passar pelo endpoint serverless)
- **Produção**: Os endpoints `/api/*` funcionam automaticamente na Vercel
- **WebSocket**: Funciona tanto em desenvolvimento quanto em produção (conexão direta do browser)

