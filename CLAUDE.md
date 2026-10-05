# Portal Best Color Tecidos (Bello Tecido)

Portal B2B de pedidos para estamparia por sublimação. Responda e escreva
commits, PRs e comentários **em português do Brasil**.

## Stack
- Next.js 16 (App Router), código em `src/app`
- Supabase (Postgres, Auth, Storage) — `src/lib/supabase/{server,admin}.ts`
- Bling API v3 — `src/lib/bling/*` (função base `chamarBling(path, init)`)
- Resend — templates em `src/lib/resend/templates/*`
- Deploy: Vercel, automático a cada push na `main`
- Documentação de decisões: `decisoes-atualizadas.md` (atualize quando
  implementar algo que mude uma regra)

## Banco de dados — REGRAS OBRIGATÓRIAS
- Nunca rode SQL direto. Toda mudança de schema ou função vai em
  `supabase/migrations/<YYYYMMDDHHMMSS>_<nome>.sql` (crie com
  `supabase migration new <nome>`).
- Toda migration precisa do par de desfazer em
  `supabase/rollbacks/<mesmo nome>.sql`, que reverte exatamente o que ela fez.
- Migrations são aplicadas pela GitHub Action ao chegar na `main`.
- Status do pedido é **derivado** do último registro em
  `pedido_status_historico` via `status_atual(uuid)`. Não existe coluna
  `pedidos.status`.
- `pedido_itens.metros_total` e `subtotal` são colunas GENERATED — nunca
  insira valores nelas.
- Toda regra de negócio é validada no banco (função/trigger/RLS), não só
  no front-end. Funções administrativas checam `is_admin()` / `is_interno()`.
- Nunca excluir cliente ou arte: sempre `ativo = false`.
- Preço: `clientes.preco_metro` é o padrão; `pedido_itens.preco_unitario`
  fica congelado no valor da época. Cálculo de total sempre em metros, uma
  vez só, para não divergir da nota fiscal.

## Fluxo de status (10 etapas)
aguardando → recebido → impressao → estampando → corte_costura → pronto →
faturado → nf_emitida → expedido → entregue → fechado.
O envio ao Bling, a cobrança e a NF acontecem **só** no botão Faturar
(`faturarPedido` em `src/app/actions/faturamento.ts`), na transição
pronto → faturado. Pedidos agrupados: só o agrupador vai ao Bling.

## Papéis
cliente, funcionario, dono (admin), e futuramente financeiro.
Funcionário nunca vê preços nem valores — nem na tela, nem na resposta do
servidor.

## Padrões de código
- Server Actions em `src/app/actions/*.ts`, sempre com validação e
  `revalidatePath`.
- Ações sensíveis exigem motivo (mínimo 10 caracteres) e registro de
  auditoria.
- Mensagens ao usuário em português, sem jargão técnico.
- Rode `npm run build` antes de abrir o PR; se falhar, corrija antes.

## Ao abrir um PR
- Título e descrição em português.
- Liste: arquivos alterados, migration criada (e seu rollback), o que
  precisa ser testado à mão e qualquer configuração externa necessária
  (Bling, Resend, Vercel).
- Um PR por issue. Não misture assuntos.
