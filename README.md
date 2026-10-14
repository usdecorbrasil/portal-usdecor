# Portal US Decor

Sistema interno de gestão da US Decor (capas de almofada vendidas na Amazon, no Mercado
Livre e na Shopee). Next.js (App Router) + Supabase + Resend + Anthropic API, deploy na
Vercel.

O contexto completo, as regras e a ordem dos módulos estão no [`CLAUDE.md`](CLAUDE.md);
as decisões de negócio, em [`decisoes-atualizadas.md`](decisoes-atualizadas.md).

## Rodar local

```bash
cp .env.example .env.local   # preencher as chaves do Supabase, Resend e Anthropic
npm ci
npm run dev
```

Antes de abrir PR: `npm run build`.

Mudança de banco só por migration em `supabase/migrations/` com o rollback em
`supabase/rollbacks/`; a GitHub Action aplica ao chegar na `main`.
