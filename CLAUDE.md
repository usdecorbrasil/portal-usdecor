# Portal Bello Tecido — Contexto do Projeto

Portal web B2B para clientes de uma empresa de estamparia por sublimação. Cada cliente
acessa uma área restrita, vê apenas o próprio catálogo/preços, monta pedido em carrinho
e acompanha o status até a entrega.

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end e back-end | Next.js (App Router) |
| Banco de dados e autenticação | Supabase |
| E-mails transacionais | Resend |
| ERP / gestão de pedidos | Bling (API v3, OAuth 2.0) |
| Hospedagem | Vercel |
| Pagamento (boleto) | Bling Conta |

Repositório: `usdecorbrasil/portal-bello-tecido` (GitHub)

## Papéis de acesso

- **Cliente** (externo): login/senha, sem auto-cadastro (conta criada pelo admin). Só vê
  o próprio catálogo, preços e pedidos.
- **Dono** (interno): acesso total, cadastra clientes/catálogos/preços, relatórios,
  configurações.
- **Funcionário** (interno): acesso operacional, mas **nunca vê valores monetários** nas
  telas (mesma regra em todas as telas, inclusive relatórios).
- **Admin Financeiro** (interno, papel novo — não é permissão extra do Dono): define
  limite de crédito por cliente, controla boletos, parcelamentos e cobranças.
  Variável interna que hoje representa "dono OU financeiro" foi renomeada para
  `nivelAdmin`.

## Catálogo

- Grade estilo marketplace: imagem, SKU, nome do desenho, tecido (fixo por produto, sem
  seleção pelo cliente), quantidade (repetições — único campo de quantidade), preço
  conforme tabela do cliente logado.
- Quantidade editável direto na listagem, com botão "adicionar ao carrinho" no card.
- Isolamento total entre clientes.
- Todo item de catálogo tem status **ativo/inativo** controlado pelo admin. Inativos não
  ficam disponíveis para pedido.

## Envio de artes pelo cliente

- Fluxo separado do pedido, aba própria ao lado do catálogo.
- Cliente cola link de pasta compartilhada (Drive/Dropbox) com acesso já liberado.
- Arquivos devem ter nome igual ao SKU (ex.: `ABC-1234.png`); fora do padrão não são
  processados.
- Gera notificação ao admin → admin baixa, cadastra no catálogo do cliente → produto
  fica ativo.
- Cliente vê histórico dos envios e status (recebido / cadastrado).

## Pedido, carrinho e pagamento

- Carrinho: itens + quantidade + subtotal, total pela tabela de preços do cliente,
  campo de notas livre.
- Confirmação grava no banco e cria **pedido de venda** no Bling (não orçamento).
- Cliente escolhe forma de pagamento na confirmação: **à vista, boleto parcelado (até 3x,
  admin/financeiro pode alterar o nº de parcelas na confirmação) ou cartão de crédito**
  (gateway fora do Bling, a definir).
- **Limite de crédito**: soma dos pedidos em aberto desde `aguardando` até "não pago".
  Se o limite estiver tomado, **só o parcelado bica bloqueado** — à vista continua
  disponível.
- Ajuste de quantidade: permitido aumentar ou reduzir livremente até o lançamento do
  status "Impressão" (janela de ajuste fecha ali). Exige motivo obrigatório e fica
  registrado em auditoria. Só o **Dono** tem permissão de alterar quantidade
  (funcionário não tem).
- Parcela atrasada: só gera alerta ao financeiro, não trava o fluxo do pedido.
- Quando todas as parcelas são pagas, o pedido **avança sozinho** para "Pedido fechado".

## Status do pedido — 9 etapas (histórico, não sequência fixa)

| # | Status | Origem |
|---|---|---|
| 1 | Pedido recebido | Automático (criação do pedido) |
| 2 | Impressão | Manual — painel |
| 3 | Estampando | Manual — painel |
| 4 | Em corte / costura | Manual — painel |
| 5 | Pedido pronto | Manual — painel |
| 6 | Nota fiscal emitida | Bling |
| 7 | Expedido | Bling |
| 8 | Entregue | Bling |
| 9 | Pedido fechado | Bling — exige baixa financeira |

Importante:
- O pedido **não** precisa passar por todas as etapas (ex.: sem costura pula direto de
  Estampando para Pedido pronto; retirada em balcão pula Expedido).
- **Implicação técnica**: a coluna `status` em `pedidos` é **derivada** do último
  registro em `pedido_status_historico`, não é mais um campo independente atualizado à
  mão.
- Admin escolhe a próxima etapa entre as ainda não lançadas e pode desfazer o último
  lançamento manual.

## E-mails automáticos

Disparo ao cliente em 4 momentos: Pedido recebido, Impressão, Pedido pronto (cobrança +
boleto + resumo), Nota fiscal emitida (+ PDF da NF).

Outros disparos (ver `project-decisoes_consolidadas.txt` para a lista completa de 14
gatilhos, incluindo avisos internos à equipe, cancelamentos, envio de artes rejeitado,
primeiro acesso, recuperação de senha).

`email_log` tem chave única por pedido + tipo → evita disparo duplicado (idempotência).

## Banco de dados (Supabase) — pontos de atenção

- Schema `public`. Ao investigar estrutura, consultar `information_schema.tables` /
  `information_schema.columns` antes de assumir nomes de tabela/coluna (o projeto já
  passou por renomes).
- Tabelas conhecidas: `pedidos`, `pedido_itens`, `pedido_status_historico`,
  `pedido_parcelas`, `clientes`, `cliente_limite_historico`, `configuracoes`,
  `email_log`, `profiles` (usuários/papéis).
- RLS (Row Level Security) ativo — checar `pg_policies` ao debugar acesso negado.
- Ao criar relação nova, atualizar o schema cache do PostgREST (Supabase) — erros de
  relação "não encontrada" logo após criar FK costumam ser isso.
- Regra transversal: **funcionário nunca deve ver valores monetários** — aplicar em toda
  query/tela nova, inclusive relatórios.

## Painel do Dono — extras

- **Aba Produção**: gestão operacional dos status.
- **Aba Relatórios** (a construir): Faturamento, Pedidos, Por cliente, Metragem
  produzida, Retrabalho, Ajustes de quantidade, Cancelamentos, Artes mais pedidas.
  Filtro por período (com atalhos) e por cliente, exportação CSV/PDF, exclusivo do Dono.
  Pedidos cancelados ficam fora dos totais de faturamento.
- **Configurações** (a construir): tabela `configuracoes` (uma linha por chave), lida
  pelo servidor, alterações logadas em auditoria. Segurança: sessões ativas, histórico
  de acessos, exportação de dados (LGPD).

## Integração com o Bling

- API v3, OAuth 2.0. Credenciais na área de aplicativos do painel Bling.
- Pedido confirmado no portal → criado no Bling como pedido de venda.
- Sincronização de volta: Nota fiscal emitida, Expedido, Entregue, baixa financeira
  (gatilho de "Pedido fechado").
- Desligar o envio automático de NF no painel do Bling (o portal controla isso).

## Pendências conhecidas (checar status atual antes de assumir resolvido)

- Domínio para envio de e-mails via Resend.
- Gerar credenciais OAuth do Bling / abrir Bling Conta / habilitar boletos.
- Definir prazo padrão de vencimento do boleto.
- Criar produto genérico de estampa no Bling.
- Definir gateway de pagamento para cartão de crédito/débito.
- Bug: erro de teto de 50% ainda aparecendo ao ajustar quantidade mesmo após remoção da
  trava — suspeita de função/trigger duplicada ou resíduo de schema antigo
  (`ajustar_quantidade_item`).

## Custo estimado

Supabase Pro (~US$25) + Vercel Pro (~US$20) + Resend (grátis até 3.000 e-mails/mês) ≈
**US$45/mês**, fixo, independente do nº de clientes.

## Convenções

- Nomes de tabelas/colunas em português, snake_case.
- Server Actions em `app/actions/*.ts`.
- Mudança estrutural de schema: sempre confirmar nome real de tabela/coluna via
  `information_schema` antes de gerar SQL, pois o schema já sofreu renomes ao longo do
  projeto.

---

Este arquivo é a memória de trabalho do Claude Code para este projeto. Decisões e
histórico completo de debugging/código estão em `docs/decisoes-consolidadas.md` e
`docs/escopo.md` (cópias dos documentos originais) — consulte-os para detalhes que não
couberam aqui.
