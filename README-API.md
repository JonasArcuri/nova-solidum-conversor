# API USD/BRL - Cotação em Tempo Real

API Node.js/Express para fornecer cotação USD/BRL com cache, SSE e atualização agendada.

## 📋 Características

- ✅ **Cache-first**: Arquitetura eficiente, sem requisições desnecessárias
- ✅ **SSE Broadcast**: Server-Sent Events para múltiplos clientes
- ✅ **Atualização agendada**: 2x ao dia (09:00 e 15:00 BRT)
- ✅ **Rate Limiting**: Proteção contra abuso
- ✅ **Fonte**: Banco Central do Brasil (PTAX) com fallback AwesomeAPI

## 🏗️ Arquitetura

### Cache-First Pattern

```
┌─────────────┐
│   Worker    │───(2x/dia)───► API Banco Central / AwesomeAPI
│  Scheduler  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    Cache    │───(atualiza)───► Broadcast SSE
│  (Memória)  │
└──────┬──────┘
       │
       ├───► GET /api/usdbrl (REST - do cache)
       └───► GET /api/usdbrl/stream (SSE)
```

**Princípios:**
- Worker atualiza cache 2x ao dia (09:00 e 15:00 BRT)
- REST e SSE **NUNCA** fazem fetch externo
- Cache é a única fonte de dados para clientes
- Broadcast automático via SSE quando cache atualiza

## 🚀 Instalação

```bash
npm install
```

## ⚙️ Configuração

### Variáveis de Ambiente (Opcional)

- `PORT` - Porta do servidor (padrão: 3000, Render define automaticamente)
- `FORCE_REFRESH_SECRET` - Secret para endpoint de force-refresh (opcional)
- `API_BASE_URL` - URL base da API (para worker, padrão: localhost:PORT)

## 📡 Endpoints

### GET /api/usdbrl

Retorna cotação do cache (nunca faz fetch externo).

**Resposta:**
```json
{
  "symbol": "USD/BRL",
  "bid": 5.12,
  "ask": 5.14,
  "spread": 0.02,
  "timestamp": "2026-01-06T15:00:00-03:00",
  "source": "Banco Central / AwesomeAPI",
  "lastUpdate": "2026-01-06T15:00:00.000Z"
}
```

**Rate Limit:** 30 req/min por IP

### GET /api/usdbrl/stream

Server-Sent Events para receber atualizações em tempo real.

**Comportamento:**
- Envia dados imediatamente ao conectar (se cache disponível)
- Envia atualização quando cache é atualizado (2x ao dia)
- Heartbeat a cada 60 segundos
- 1 conexão ativa por IP

**Exemplo de uso:**
```javascript
const eventSource = new EventSource('/api/usdbrl/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Nova cotação:', data);
};
```

### GET /health

Status do sistema.

**Resposta:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-06T15:00:00.000Z",
  "cache": {
    "hasData": true,
    "lastUpdate": "2026-01-06T15:00:00.000Z"
  },
  "sse": {
    "connectedClients": 5
  }
}
```

### POST /api/usdbrl/force-refresh

Força atualização manual (apenas para emergências).

**Headers:**
```
x-force-refresh-secret: seu_secret_aqui
```

**Resposta:**
```json
{
  "success": true,
  "message": "Atualização forçada iniciada",
  "timestamp": "2026-01-06T15:00:00.000Z"
}
```

## ⏰ Atualização Agendada

A cotação é atualizada **EXATAMENTE 2 vezes ao dia**:

- **09:00 BRT** (horário de Brasília)
- **15:00 BRT** (horário de Brasília)

**Importante:**
- Nunca atualiza fora desses horários
- Nunca permite fetch por requisição de usuário
- Mantém último valor válido se API falhar

## 🔐 Segurança

### Rate Limiting

- **REST**: 30 requisições/minuto por IP
- **SSE**: 1 conexão ativa por IP (substitui conexão anterior)

## 🏭 Deploy no Render

### Configurações

1. **Tipo**: Web Service
2. **Environment**: Node
3. **Build Command**: `npm install && npm run build`
4. **Start Command**: `npm start`
5. **Root Directory**: `.`

### Variáveis de Ambiente (Opcional)

- `FORCE_REFRESH_SECRET` - Secret para force-refresh
- `API_BASE_URL` - URL base (para worker interno)

### Verificação

Após deploy, verifique:
```bash
curl https://seu-app.onrender.com/health
curl https://seu-app.onrender.com/api/usdbrl
```

## 📁 Estrutura do Projeto

```
src/
 ├── server.js                 # Servidor principal
 ├── worker/
 │    └── usdbrlScheduler.js   # Scheduler de atualização
 ├── cache/
 │    └── usdbrlCache.js       # Cache em memória
 ├── sse/
 │    └── sseHub.js            # Gerenciamento SSE
 ├── routes/
 │    └── usdbrl.routes.js     # Rotas da API
 └── middlewares/
      └── rateLimit.js         # Rate limiting

api/
 └── usdbrl.js                # API de busca (Banco Central / AwesomeAPI)
```

## 🔄 Fluxo de Dados

### Atualização Agendada

1. **Scheduler** executa às 09:00 ou 15:00 BRT
2. **Worker** busca cotação da API (Banco Central / AwesomeAPI)
3. **Cache** é atualizado com novos dados
4. **SSE Hub** faz broadcast para todos os clientes conectados

### Requisição REST

1. Cliente faz `GET /api/usdbrl`
2. **Cache** retorna dados (sem fetch externo)
3. Resposta imediata

### Conexão SSE

1. Cliente conecta em `/api/usdbrl/stream`
2. **SSE Hub** adiciona cliente à lista
3. Envia dados do cache imediatamente
4. Envia atualização quando cache muda (2x ao dia)

## 🧪 Testes

### Testar Endpoint REST

```bash
curl http://localhost:3000/api/usdbrl
```

### Testar SSE

```bash
curl -N http://localhost:3000/api/usdbrl/stream
```

### Testar Health

```bash
curl http://localhost:3000/health
```

## ⚠️ Limitações Conhecidas

1. **Cache em memória**: Não compartilhado entre instâncias
   - Solução futura: Migrar para Redis

2. **Horários fixos**: Atualização apenas 2x ao dia
   - Por design: Economia de requisições

3. **1 conexão SSE por IP**: Conexão anterior é substituída
   - Por design: Previne abuso

## 🔮 Melhorias Futuras

- [ ] Migrar cache para Redis (multi-instância)
- [ ] Adicionar métricas (Prometheus)
- [ ] Histórico de cotações
- [ ] Retry automático com backoff

## 📝 Licença

Proprietário - Nova Solidum

