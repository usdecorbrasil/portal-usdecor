# Decisões atualizadas — Portal US Decor

Registro das decisões de regra do portal da US Decor. Começa do zero em 14/10/2026,
quando o repositório nasceu como cópia do portal da Best Color Tecidos: as decisões da
Best Color ficam no histórico do Git e **não valem aqui**, salvo o que está listado
abaixo como herdado. Quando uma implementação mudar uma regra daqui, atualize esta
página e o `CLAUDE.md` no mesmo PR.

Legenda: **✅ feito** está na `main`; **🔧 a construir** foi decidido e não implementado.

## Origem e escopo

| Decisão | Situação |
|---|---|
| Portal **interno**, só para a equipe; sem área de cliente, sem login de cliente | 🔧 (poda) |
| Código base copiado do portal da Best Color com o histórico | ✅ |
| Marca "US Decor" no lugar de "Best Color" no código, e-mails e remetente, com o logo oficial | ✅ |
| Sai a estamparia: metragem, romaneio, ajuste de metragem, tecido de cliente, etapas de produção, impressão, fila, crédito e limite de cliente | 🔧 (poda) |
| Sai o pedido de venda no Bling, a cobrança/boleto/Pix do Bling e a NF pelo Faturar | 🔧 (poda) |
| Migrations consolidadas numa base limpa para o Supabase novo, sem o histórico da estamparia | 🔧 (poda) |

## Herdado da Best Color (fica como está)

| Decisão | Situação |
|---|---|
| Login, primeiro acesso com senha provisória | ✅ |
| Papéis `admin` (dono), `financeiro` (mesmo acesso do dono) e `funcionario` (nunca vê valores, em tela nem em resposta do servidor) | ✅ |
| Financeiro: notas e recibos por IA e XML, contas a pagar, cartões de crédito da empresa, A receber, A pagar, baixa em lote, edição com motivo, conciliação de extratos (OFX sem IA; PDF/imagem/CSV por IA), fluxo de caixa, custos por compras | ✅ |
| Auditoria genérica, notificações à equipe, crons diários, padrão visual de listas densas | ✅ |

## Integrações

| Decisão | Situação |
|---|---|
| Bling em conta própria da US Decor, só para nota fiscal, se e quando precisar | 🔧 |
| Pedidos **não** passam pelo Bling (gera muito erro): ligação direta com os marketplaces | 🔧 |
| Fase 1: relatórios exportados pelos marketplaces, pelo caminho do conciliador (arquivo → leitura → casamento → conferência → gravação) | 🔧 |
| Fase 2: API direta (Amazon SP-API, Mercado Livre, Shopee Open Platform); a fase 1 continua valendo, a API só troca a origem | 🔧 |

## Canais de venda (7)

| Decisão | Situação |
|---|---|
| Amazon B2C (próprio e FBA), Amazon B2B, Mercado Livre (próprio e Full), Shopee (próprio e Full) | 🔧 |
| Expedição do envio próprio fica nos portais dos marketplaces; o portal só registra a venda e a baixa | 🔧 |
| De-para explícito por canal em cada SKU (ASIN/SKU Amazon, item e variação ML, item e modelo Shopee) | 🔧 |

## Produtos, ficha técnica e custo

| Decisão | Situação |
|---|---|
| Cadastros: tecido (metros, custo médio das notas), insumo (unidade, custo médio das notas), capa/SKU (variação, tipo, de-para, ficha), local de estoque (galpão, FBA, Full ML, Full Shopee) | 🔧 |
| Custo médio do metro e do insumo pela média ponderada das notas, janela 30/60/90 dias, como em Custos | 🔧 |
| Tecido entra já estampado, pronto para cortar (premissa a confirmar) | 🔧 |
| Ficha técnica com consumo **estimado** por unidade: tecido (metros), estampa (metros a estampar, com preço por metro e histórico), insumos (quantidade), mão de obra (valor fixo por tipo de capa, com histórico) | 🔧 |
| Custo da capa = tecido + estampa + insumos + mão de obra, mostrado por parcela | 🔧 |
| Custo congelado na venda: o pedido guarda o custo da capa no dia | 🔧 |
| A ficha não baixa estoque de nada | 🔧 |

## Estoque

Decisão do dono em 13/10/2026: sem ordem de produção com etapas, prazo ou custo de mão
de obra por ordem. Só saldo e lançamentos.

| Decisão | Situação |
|---|---|
| Nota de compra com item vinculado a tecido/insumo dá entrada e atualiza o custo médio | 🔧 |
| Lançamento manual "Tecido enviado para produção" (tecido, metros, data, observação) tira metros | 🔧 |
| Lançamento manual "Produção concluída" (SKU, quantidade, data) põe capas no galpão e **não mexe em tecido** | 🔧 |
| Remessa para fulfillment: sai do galpão, fica em trânsito, vira saldo no destino quando o marketplace confirma | 🔧 |
| Venda importada tira do local de origem e congela custo e taxas | 🔧 |
| Ajuste manual com motivo ≥ 10 caracteres e auditoria | 🔧 |
| Consumo real por capa (metros enviados ÷ capas produzidas no período) só como referência, nunca aplicado | 🔧 |
| Saldo nos marketplaces acertado pelos relatórios de estoque deles | 🔧 |

## Pedidos e resultado

| Decisão | Situação |
|---|---|
| Pedido nasce importado, nunca digitado: canal, logística, SKU, quantidade, preço, taxas do canal, custo congelado | 🔧 |
| Resultado por canal e por SKU = preço − taxas − custo (primeira entrega, junto do estoque por local) | 🔧 |
| Repasses dos marketplaces casam na conciliação com o lote de pedidos do período | 🔧 |

## Sugestão de produção e reposição

| Decisão | Situação |
|---|---|
| Cálculo determinístico diário por SKU e local: velocidade (30 dias, peso maior nos últimos 7), cobertura, ruptura prevista, quantidade para a cobertura-alvo por local | 🔧 |
| Cascata: repor no local − galpão = produzir N; N × consumo estimado − estoque = comprar M (tecido e insumos) | 🔧 |
| Prazos configuráveis por etapa (fornecedor, produção, trânsito) para a data-limite de cada ação | 🔧 |
| Análise global por IA sobre a tabela calculada: explica e prioriza, não grava; o humano aprova e a ação vira lançamento | 🔧 |

## Regras obrigatórias

| Decisão | Situação |
|---|---|
| Nunca SQL direto: migration em `supabase/migrations` com rollback em `supabase/rollbacks`, aplicada pela GitHub Action na `main` | ✅ |
| Regra de negócio validada no banco; funções administrativas checam `is_admin()`; tabela nova com `GRANT` explícito | ✅ |
| Ação sensível com motivo (mín. 10 caracteres) e registro em `auditoria` | ✅ |
| Nada é excluído de verdade: `ativo = false` ou exclusão lógica com motivo | ✅ |
| IA nunca grava; esquema de saída sem `nullable` (`""`, `0`, `nao_informado`) com `normalizar()` | ✅ |
| "Hoje" de Brasília (`hojeBrasilia()` / `hoje_brasilia()`); número digitado por `paraNumeroBr()` | ✅ |
| `npm run build` antes de PR; um PR por assunto; commits e PRs em português | ✅ |
