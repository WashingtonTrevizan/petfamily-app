# PetFamily Frontend

Aplicacao frontend do app PetFamily em React + Vite + Tailwind.

## Integracao com Supabase

Este projeto ja esta preparado para consumir Supabase diretamente no frontend.

1. Crie um projeto no Supabase.
2. Copie a URL do projeto e a anon key.
3. Crie um arquivo `.env.local` na raiz com:

```env
VITE_SUPABASE_URL="https://SEU_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="SUA_SUPABASE_ANON_KEY"
```

Cliente configurado em [src/lib/supabase.ts](src/lib/supabase.ts).

## Fluxo Completo (Auth + Dados + RLS)

1. Abra o SQL Editor do Supabase.
2. Execute o script [supabase/schema.sql](supabase/schema.sql).
3. Em Authentication > Providers, mantenha Email habilitado.
4. No app, execute o fluxo:
	1. Criar conta
	2. Criar familia ou entrar por codigo
	3. Adicionar pet
	4. Registrar atividades e assumir/concluir tarefas

Arquivos principais do fluxo:

- [src/App.tsx](src/App.tsx)
- [src/services/familyApi.ts](src/services/familyApi.ts)
- [supabase/schema.sql](supabase/schema.sql)

## Rodando localmente

Pre-requisito: Node.js 18+

1. Instalar dependencias:

```bash
npm install
```

2. Rodar em desenvolvimento:

```bash
npm run dev
```

3. Build de producao:

```bash
npm run build
```

## Publicar e gerar APK (atualizacao automatica)

Estratégia recomendada:

1. Publicar o app web (Vercel, Netlify, Cloudflare Pages, etc).
2. Gerar APK Android com TWA (Trusted Web Activity) apontando para a URL publicada.

Quando o app web for atualizado, o APK passa a refletir as mudanças sem novo build nativo na maioria dos casos.

### Checklist PWA

Este projeto já está com base PWA configurada em:

- [vite.config.ts](vite.config.ts)
- [src/main.tsx](src/main.tsx)
- [public/icon-192.svg](public/icon-192.svg)
- [public/icon-512.svg](public/icon-512.svg)

### Passo 1: publicar web

1. Suba o repositório para GitHub.
2. Conecte no Vercel/Netlify.
3. Configure as variáveis de ambiente de produção:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

4. Faça deploy e guarde a URL HTTPS final.

### Passo 2: gerar APK com Bubblewrap (TWA)

Pré-requisitos na sua máquina:

1. Node.js 18+
2. Java JDK 17+
3. Android Studio (SDK + build-tools)

Instalar Bubblewrap:

```bash
npm i -g @bubblewrap/cli
```

Na pasta vazia para o app Android:

```bash
bubblewrap init --manifest https://SEU-DOMINIO/manifest.webmanifest
bubblewrap build
```

O comando gera APK/AAB para instalar/testar.

Observação:

- Para publicar na Play Store, prefira usar AAB assinado e manter o Digital Asset Links configurado no domínio.
