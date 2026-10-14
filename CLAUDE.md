# Portal US Decor — Contexto do Projeto

Sistema **interno** de gestão da US Decor, fabricante e vendedora de **capas de almofada**
em marketplaces. Não há área de cliente: quem compra está na Amazon, no Mercado Livre e na
Shopee. Quem usa o portal é só a equipe.

Derivado do portal da Best Color Tecidos (`usdecorbrasil/portal-bestcolortecidos`), de
onde vem o código base. Responda e escreva commits, PRs e comentários **em português do
Brasil**.

## Stack (igual à Best Color)

- Next.js 16 (App Router), código em `src/app`, Server Actions em `src/app/actions/*.ts`
- Supabase (Postgres com RLS, Auth, Storage) — projeto próprio da US Decor
- Resend para e-mail; Anthropic API para leitura de documentos e análise de estoque
- Bling: **conta própria da US Decor**, separada da Best Color. Só para nota fiscal, se e
  quando precisar. Pedidos **não** passam pelo Bling (gera muito erro): ligação direta com
  os marketplaces.
- Deploy na Vercel, automático a cada push na `main`

## Estado do repositório

Nasce como cópia do portal da Best Color com o histórico. Primeira tarefa: a **poda**.

### Fica (reaproveitado como está)
- Login, primeiro acesso com senha provisória, papéis `admin` (dono), `financeiro` (mesmo
  acesso do dono) e `funcionario` (**nunca vê valores**, em tela nem em resposta do servidor)
- Financeiro inteiro: notas e recibos lidos por IA e XML, contas a pagar, cartões de
  crédito da empresa (fechamento/vencimento), A receber, A pagar, baixa em lote, edição
  com motivo, conciliação de extratos (OFX sem IA; PDF/imagem/CSV por IA), totalizador de
  fluxo de caixa, custos por compras (média ponderada das notas)
- Auditoria genérica, notificações à equipe, crons diários, padrão visual de listas
  densas, busca, carregamento, componentes

### Sai
- Área do cliente inteira: catálogo, carrinho, envio de artes, "meus pedidos", login de
  cliente
- Estamparia: metragem, romaneio, ajuste de metragem, tecido **de cliente**, etapas de
  produção, impressão, fila, painel de crédito de cliente, limite de crédito
- Pedido de venda no Bling, cobrança/boleto/Pix do Bling, NF pelo Faturar
- Marca: "Best Color" → "US Decor" em todo o código, e-mails e remetente

### Entra (módulos novos, nesta ordem)
1. Produtos, tecidos, insumos, ficha técnica e custo
2. Estoque por local e lançamentos manuais
3. Pedidos e repasses por canal (fase 1: relatórios exportados; fase 2: API)
4. Sugestão de produção e reposição + análise global por IA
5. Integração direta com os marketplaces

## Canais de venda (7)

| Canal | Logística |
|---|---|
| Amazon B2C | envio próprio e FBA |
| Amazon B2B | pela própria Amazon |
| Mercado Livre | envio próprio e Full |
| Shopee | envio próprio e Full |

- **Expedição do envio próprio não entra no portal**: é feita nos próprios portais dos
  marketplaces. O portal só registra a venda e a baixa de estoque.
- Cada SKU tem um **de-para por canal** (ASIN/SKU Amazon, item e variação no ML, item e
  modelo na Shopee). É o cruzamento que o Bling errava; aqui é cadastro explícito.

## Produtos, tecidos e custo

### Cadastros
- **Tecido** (matéria-prima): nome, estoque em metros, **custo médio do metro** calculado
  das notas de compra cujos itens estão vinculados a ele (mesma média ponderada com janela
  30/60/90 dias que a Best Color usa em Custos). Assume-se que o tecido entra já
  estampado, pronto para cortar (corrigir se não for).
- **Insumo**: zíper, linha, etiqueta, embalagem… com unidade e custo médio pelas notas,
  igual ao tecido.
- **Capa (SKU)**: nome, variação (tamanho, estampa), tipo de capa, de-para por canal, e a
  **ficha técnica**.
- **Local de estoque**: galpão US Decor, FBA, Full Mercado Livre, Full Shopee. Saldo por
  SKU por local.

### Ficha técnica (por capa)
Consumo **estimado** por unidade, declarado, não medido. Componentes, cada um opcional
conforme o tipo de capa:

| Componente | Informado como | Custo |
|---|---|---|
| Tecido | tecido + metros por unidade | custo médio do metro (notas) |
| Estampa | metros a estampar por unidade (capa estampada; lisa não tem) | preço do metro de estampa, cadastrado, com histórico |
| Insumos | lista com quantidade por unidade | custo médio de cada insumo (notas) |
| Mão de obra | valor fixo por unidade, por tipo de capa | o valor informado, com histórico |

- **Custo da capa = tecido + estampa + insumos + mão de obra**, mostrado por parcela na
  tela do produto.
- **Custo congelado na venda**: cada pedido importado guarda o custo da capa no dia. Tecido
  que subiu depois não muda a margem do mês passado.
- A ficha **não baixa estoque de nada**. Serve para custo e para a sugestão de compra.

## Estoque: básico, com lançamentos manuais

Decisão do dono (13/10/2026): sem ordem de produção com etapas, sem prazo, sem custo de
mão de obra por ordem. Só o saldo e dois lançamentos.

| Lançamento | Efeito |
|---|---|
| Nota de compra com item vinculado a tecido/insumo | entra metros/unidades e atualiza o custo médio |
| **Tecido enviado para produção** (manual: tecido, metros, data, observação) | sai metros |
| **Produção concluída** (manual: SKU, quantidade, data) | entra capas no galpão. **Não mexe em tecido** |
| Remessa para fulfillment (SKU, quantidade, destino) | sai do galpão, entra em trânsito, vira saldo no destino quando o marketplace confirma |
| Venda importada | sai do local de origem (FBA, Full ou galpão), congela custo e taxas |
| Ajuste manual | com motivo ≥ 10 caracteres e auditoria |

- **A entrada de capas não baixa tecido, de propósito**: quebra na produção e variação de
  medida tornariam a baixa automática mentirosa. O consumo real por capa é um número
  **observado** (metros enviados ÷ capas produzidas no período), mostrado como referência,
  nunca aplicado como regra.
- Saldo nos marketplaces é acertado pelos relatórios de estoque deles (FBA, Full ML, Full
  Shopee).

## Pedidos e resultado por canal

- Pedido nasce **importado**, nunca digitado. Guarda canal, logística (próprio/Full/FBA),
  SKU, quantidade, preço, e as **taxas do canal** (comissão, frete, fulfillment,
  publicidade quando o relatório traz), mais o custo congelado da capa.
- **Resultado por canal e por SKU** = preço − taxas − custo. É a primeira entrega
  pedida pelo dono, junto do estoque por local.
- **Repasses** dos marketplaces entram na conciliação: o repasse do extrato casa com o
  lote de pedidos do período.

### Fase 1 — relatórios exportados (sem API)
Importar os relatórios que os três portais já exportam (vendas e repasses da Amazon,
vendas e cobranças do ML, receita da Shopee, estoque do FBA e dos Full) pelo mesmo
caminho do conciliador: arquivo → leitura (CSV/XLSX sem IA quando o layout é fixo; PDF por
IA) → casamento → conferência → gravação. Entrega resultado por canal e estoque por local
antes de qualquer aprovação de API.

### Fase 2 — API direta (decisão do dono: não usar o Bling para pedidos)
Cada canal passa a sincronizar sozinho quando o cadastro de desenvolvedor for aprovado. A
fase 1 continua valendo: a API só troca a origem dos dados.

| Canal | Pré-requisito do dono | Observação |
|---|---|---|
| Amazon SP-API | perfil de desenvolvedor no Seller Central, app, autorizar a própria loja | cobre B2C, B2B e FBA; relatórios de settlement e estoque FBA |
| Mercado Livre | app no portal de desenvolvedores, autorizar a conta | token curto com renovação; webhooks; Full e próprio na mesma API |
| Shopee Open Platform | cadastro de desenvolvedor, app aprovado, autorizar a loja | aprovação mais lenta; Full com endpoints próprios |

Confirmar as regras atuais de cada API na hora de implementar; o dono inicia os cadastros
em paralelo porque o prazo deles é o que manda.

## Sugestão de produção e reposição

**Cálculo determinístico, diário**, por SKU e por local:
- velocidade de venda (média de 30 dias com peso maior nos últimos 7), dias de cobertura,
  data prevista de ruptura, quantidade a repor para a **cobertura-alvo** (configurável por
  local, ex.: 30 dias no FBA);
- cascata: repor no local − saldo do galpão = **produzir N**; N × consumo estimado −
  tecido em estoque = **comprar M metros** (idem insumos);
- prazos configuráveis por etapa (fornecedor, produção, trânsito até cada fulfillment)
  para dar a data-limite de cada ação;
- saída: lista de ações com prioridade ("produzir 60 da capa X até 20/10", "comprar 21 m
  do tecido T", "enviar 120 para o FBA"), ordenada por quem acaba primeiro.

**Análise global por IA** em cima da tabela calculada: escreve o plano da semana em
linguagem de gente — prioridades e por quê, gargalo (tecido, insumo, capa, trânsito), o que
está encalhado, compras ou remessas que vale agrupar, anomalias ("vendas da capa Y caíram
60% no ML, confira o anúncio"). **Os números vêm do cálculo; a IA explica e prioriza; nada
grava sozinho.** O humano aprova e a ação vira lançamento com um clique.

## Regras obrigatórias (herdadas da Best Color)

- Nunca rodar SQL direto. Toda mudança de schema ou função vai em
  `supabase/migrations/<YYYYMMDDHHMMSS>_<nome>.sql` com o par de desfazer em
  `supabase/rollbacks/<mesmo nome>.sql`. Aplicadas pela GitHub Action ao chegar na `main`.
- Toda regra de negócio validada no banco (função/trigger/RLS). Funções administrativas
  checam `is_admin()`. Tabela nova leva `GRANT` explícito.
- Ações sensíveis exigem motivo (mín. 10 caracteres) e registro em `auditoria`.
- Nada é excluído de verdade: `ativo = false` ou exclusão lógica com motivo.
- IA nunca grava: devolve rascunho, humano confere e salva. Esquema de saída da IA
  **sem `nullable`** (limite de 16 uniões da API): texto ausente `""`, número `0`, enum
  desconhecido `nao_informado`, com `normalizar()` para o tipo com null.
- "Hoje" é sempre o de Brasília (`hojeBrasilia()` no app, `hoje_brasilia()` no banco).
- Número digitado passa por `paraNumeroBr()`.
- `npm run build` antes de abrir PR. Um PR por assunto. PR em português listando arquivos,
  migration e rollback, testes à mão e configuração externa.
- Atualizar este arquivo e `decisoes-atualizadas.md` quando uma regra mudar.

## Infra

- Supabase: organização própria (grátis enquanto em desenvolvimento; Pro ao entrar em
  produção, US$ 10/mês por projeto adicional na organização Pro da empresa).
- GitHub: `usdecorbrasil/portal-usdecor`, privado. Secrets de Actions:
  `SUPABASE_ACCESS_TOKEN` (gerar com validade longa; o da Best Color expirou e travou as
  migrations por um dia), `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, `SITE_URL`,
  `CRON_SECRET`.
- Vercel: projeto próprio; Hobby serve para desenvolver, Pro para produção.
- `ANTHROPIC_API_KEY` na Vercel para leitura de documentos e análise de estoque. Modelos:
  rápido `claude-haiku-5-5` (padrão), preciso `claude-opus-5-5` (releitura).

## Primeira sessão: o que fazer

1. Adicionar `usdecorbrasil/portal-bestcolortecidos` à sessão, copiar o código com o
   histórico para este repositório e enviar a `main`.
2. PR "Marca e documentação": US Decor no lugar de Best Color, este `CLAUDE.md`,
   `decisoes-atualizadas.md` zerado com as decisões acima.
3. PR "Poda": remover o que está em "Sai", deixando login, equipe, financeiro, auditoria e
   notificações funcionando. Migrations consolidadas numa base limpa para o Supabase novo
   (não arrastar o histórico de estamparia).
4. Daí em diante, os módulos novos na ordem listada em "Entra".
