# Troubleshooting - Erro 404 na Vercel

## Problema
O endpoint `/api/klines` retorna 404 na Vercel, mas funciona localmente.

## Verificações Necessárias

### 1. Verificar se os arquivos estão no repositório
```bash
git ls-files api/
```
Deve mostrar:
- `api/klines.ts`
- `api/usdtbrl.ts`

### 2. Verificar na Dashboard da Vercel

1. Acesse o dashboard do projeto na Vercel
2. Vá em **Deployments** → selecione o último deployment
3. Abra a aba **Functions**
4. Verifique se `/api/klines` e `/api/usdtbrl` aparecem na lista

### 3. Se os arquivos NÃO aparecerem na lista de Functions

Isso indica que a Vercel não está detectando os arquivos serverless. Possíveis causas:

#### Causa 1: Arquivos não estão sendo incluídos no deploy
- Verifique se os arquivos estão commitados no Git
- Verifique se o `.vercelignore` não está ignorando a pasta `api/`

#### Causa 2: Framework Preset incorreto
- Na dashboard da Vercel, vá em **Settings** → **General**
- Verifique se o **Framework Preset** está como "Vite"
- Se estiver como "Other", mude para "Vite"

#### Causa 3: Build Command pode estar excluindo a pasta api/
- Verifique se o build command está como `npm run build`
- O build do Vite não deve processar a pasta `api/` (ela é processada separadamente pela Vercel)

### 4. Solução: Forçar detecção dos arquivos

Se os arquivos ainda não aparecerem, tente:

1. **Adicionar um arquivo vazio na pasta api/** para forçar a detecção:
```bash
touch api/.vercel-include
```

2. **Verificar se há algum problema com o formato dos handlers**

Os handlers devem estar no formato:
```typescript
export default async function handler(req: Request): Promise<Response> {
  // ...
}
```

3. **Verificar logs do build**
- Na dashboard, vá em **Deployments** → selecione o deployment
- Abra **Build Logs**
- Procure por erros relacionados à pasta `api/`

### 5. Solução Alternativa: Usar JavaScript

Se o problema persistir, você pode converter os arquivos para JavaScript:

1. Renomeie `api/klines.ts` para `api/klines.js`
2. Remova as anotações de tipo TypeScript
3. Faça o mesmo para `api/usdtbrl.ts`

### 6. Verificar se o problema é de roteamento

Se os arquivos aparecem na lista de Functions mas ainda retornam 404:

1. Verifique se o `vercel.json` não está sobrescrevendo as rotas
2. Verifique se há algum rewrite que está interferindo

### 7. Testar localmente com Vercel CLI

Para simular o ambiente da Vercel localmente:

```bash
npm i -g vercel
vercel dev
```

Isso iniciará um servidor local que simula o ambiente da Vercel e deve mostrar se os endpoints estão funcionando.

## Contato

Se o problema persistir após todas essas verificações, verifique:
- Logs de erro na dashboard da Vercel
- Se há alguma configuração específica do projeto que possa estar interferindo
- Se o projeto está usando alguma versão específica do Node.js que possa causar problemas

