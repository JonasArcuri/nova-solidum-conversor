# Guia de Deploy na Vercel

## Pré-requisitos

1. Conta na Vercel (gratuita): [vercel.com/signup](https://vercel.com/signup)
2. Projeto no Git (GitHub, GitLab ou Bitbucket) - **Recomendado**
   - Ou pode fazer deploy direto via CLI

## Método 1: Deploy via CLI (Mais Rápido)

### Passo 1: Instalar Vercel CLI

```bash
npm i -g vercel
```

### Passo 2: Fazer Login

```bash
vercel login
```

Isso abrirá o navegador para autenticação.

### Passo 3: Deploy

No diretório do projeto:

```bash
vercel
```

Siga as instruções:
- **Set up and deploy?** → `Y`
- **Which scope?** → Selecione sua conta
- **Link to existing project?** → `N` (primeira vez) ou `Y` (se já tiver)
- **Project name?** → `nova-solidum-conversor` (ou deixe o padrão)
- **Directory?** → `.` (pressione Enter)
- **Override settings?** → `N`

### Passo 4: Deploy em Produção

Após o deploy de preview funcionar:

```bash
vercel --prod
```

### URLs Geradas

- **Preview**: `https://nova-solidum-conversor-<hash>.vercel.app`
- **Produção**: `https://nova-solidum-conversor.vercel.app` (ou seu domínio customizado)

---

## Método 2: Deploy via GitHub (Recomendado para CI/CD)

### Passo 1: Push para GitHub

Se ainda não tiver o projeto no GitHub:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <seu-repositorio-github>
git push -u origin main
```

### Passo 2: Conectar na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new)
2. Clique em **"Import Git Repository"**
3. Autorize acesso ao GitHub (se necessário)
4. Selecione o repositório `nova-solidum-conversor`

### Passo 3: Configurar Projeto

A Vercel detecta automaticamente:
- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

**Verifique se está correto** e clique em **"Deploy"**

### Passo 4: Deploy Automático

- ✅ Cada push no branch `main`/`master` faz deploy em produção
- ✅ Pull Requests geram preview deployments automaticamente
- ✅ Builds são executados na nuvem da Vercel

---

## Método 3: Deploy via Dashboard (Sem Git)

1. Acesse [vercel.com/new](https://vercel.com/new)
2. Clique em **"Browse"** ou arraste a pasta do projeto
3. Configure:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Clique em **"Deploy"**

**Nota**: Este método não permite atualizações automáticas.

---

## Verificações Pós-Deploy

### 1. Testar Endpoints API

Após o deploy, teste os endpoints:

```bash
# Cotação
curl https://seu-projeto.vercel.app/api/usdtbrl

# Candles
curl https://seu-projeto.vercel.app/api/klines?interval=1h&limit=100
```

### 2. Verificar Logs

Na dashboard da Vercel:
- Vá em **"Deployments"**
- Clique no deployment
- Abra a aba **"Functions"** para ver logs dos endpoints

### 3. Testar Funcionalidades

- ✅ Cotação em tempo real
- ✅ Gráfico carrega histórico
- ✅ Gráfico atualiza em tempo real
- ✅ Troca de timeframe funciona
- ✅ Spread editável funciona

---

## Configurações Avançadas

### Domínio Customizado

1. Na dashboard do projeto, vá em **"Settings" → "Domains"**
2. Adicione seu domínio
3. Configure DNS conforme instruções

### Variáveis de Ambiente

Se precisar de variáveis de ambiente:

1. **Settings** → **Environment Variables**
2. Adicione variáveis (ex: `API_KEY`, `SPREAD_BPS`)
3. Redeploy para aplicar

### Build Settings

O arquivo `vercel.json` já está configurado, mas você pode ajustar:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

---

## Troubleshooting

### Erro: "Build Failed"

- Verifique os logs na dashboard
- Teste build local: `npm run build`
- Verifique se todas as dependências estão em `package.json`

### Endpoints API não funcionam

- Verifique se os arquivos em `api/` estão corretos
- Veja logs em **Functions** na dashboard
- Teste localmente com `npx vercel dev`

### WebSocket não conecta

- WebSocket funciona direto do browser (não precisa de servidor)
- Verifique console do navegador para erros
- Pode ser bloqueio de CORS ou firewall

### Gráfico não carrega

- Verifique console para erros
- Teste endpoint `/api/klines` diretamente
- Verifique se `lightweight-charts` está instalado

---

## Comandos Úteis

```bash
# Ver logs em tempo real
vercel logs

# Ver informações do projeto
vercel inspect

# Remover projeto
vercel remove

# Listar deployments
vercel ls
```

---

## Próximos Passos

Após o deploy bem-sucedido:

1. ✅ Teste todas as funcionalidades
2. ✅ Configure domínio customizado (opcional)
3. ✅ Configure monitoramento (opcional)
4. ✅ Configure analytics (opcional)

**Pronto!** Seu projeto está no ar! 🚀

