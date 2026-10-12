# Decisões atualizadas — Portal Best Color Tecidos

Complemento de `docs/decisoes-consolidadas.md`: o que mudou de regra depois da
versão consolidada. Cada seção diz o que vale hoje e o que ainda está a
construir. Quando uma implementação mudar uma regra daqui, atualize esta
página junto do PR.

Legenda das tabelas: **✅ feito** está em produção; **🔧 a construir** foi
decidido mas não implementado.

## Agrupamento, Faturado e financeiro

Decidido entre 05/10 e 07/10/2026, implementado nos PRs #8 a #27 e no PR da forma
de pagamento no faturamento (07/10).

### Forma de pagamento: decisão da equipe, no Faturar

Decidido pelo dono em 07/10/2026: **o cliente não escolhe forma de pagamento**. A
decisão é de admin/financeiro, no botão Faturar, no pedido individual ou no agrupador.

| Regra | Situação |
|---|---|
| Carrinho sem forma, parcelas, aviso de acréscimo ou mensagem de limite; só artes, quantidades e notas (o aviso de boleto atrasado continua) | ✅ |
| `pedidos.forma_pagamento` e `parcelas_solicitadas` aceitam NULL; pedido novo nasce sem forma e **nunca** bloqueado por crédito | ✅ |
| `criar_pedido(p_itens, p_notas)` sem validação de forma, parcelas, mínimo ou limite | ✅ |
| O bloco **Faturar pedido** exige a forma: boleto à vista, boleto parcelado (nº de parcelas e 1º vencimento), Pix, cartão de crédito (com parcelas) ou débito, mostrando parcela, acréscimo e total cobrado | ✅ |
| Pedido antigo, com forma escolhida pelo cliente, chega pré-selecionado e pode ser trocado | ✅ |
| **Pop-up de confirmação** antes de gravar: cliente, pedido(s), metragem, mercadoria, forma, parcelas com valor e vencimento, acréscimo, total cobrado, com/sem nota. Bloqueio em vermelho desativa o confirmar | ✅ |
| No agrupamento, a forma escolhida vale para o agrupador; a confirmação mostra os pedidos reunidos e a soma | ✅ |
| RPC `admin_definir_forma_pagamento_faturamento`: `is_admin()`, só em `pronto`, forma ativa e permitida ao cliente, parcelas ≤ teto, parcela ≥ mínimo pelo valor real (`parcelar_pedido` regenera as parcelas), limite de crédito no boleto (dispensado por `bloqueio_liberado_em`), registro em `pedido_forma_pagamento_historico` com motivo "Definida no faturamento" | ✅ |
| Gatilhos `pedidos_forma_permitida` e `pedidos_congelar_taxa` só com forma não nula, também no UPDATE do Faturar (a taxa congela ali) | ✅ |
| Limite estourado no boleto: o bloco Faturar oferece **liberar com motivo** (`admin_liberar_bloqueio_credito`, sem exigir pedido já marcado) ou trocar a forma; a recusa marca `bloqueado_credito` para o dashboard e avisa a equipe (`pedido_bloqueado_credito`) | ✅ |
| Confirmação do pedido (aguardando → recebido) não mexe mais em parcelas | ✅ |
| Listas e tela do pedido mostram "a definir no faturamento" até lá; e-mails `pedido_recebido` e `pedido_novo` sem linha de pagamento | ✅ |
| Cliente só vê a forma a partir de **Faturado** (tela do pedido e Meus pedidos); em Minha conta, o bloco Crédito mostra só a barra de uso do limite e o aviso de limite comprometido | ✅ |
| Formas permitidas por cliente (`clientes.formas_pagamento`) e configuração de Pagamento continuam valendo — agora para o que a equipe pode escolher | ✅ |

### Fluxo de status: onze etapas, com "Faturado"

| # | Status | Chave | Origem | Situação |
|---|---|---|---|---|
| 1 | Aguardando confirmação | `aguardando` | automático | ✅ |
| 2 | Pedido confirmado | `recebido` | painel | ✅ |
| 3 | Impressão | `impressao` | painel | ✅ |
| 4 | Estampando | `estampando` | painel (romaneio) | ✅ |
| 5 | Estampa pronta | `pronto` | painel | ✅ |
| 6 | Faturado | `faturado` | botão Faturar | ✅ |
| 7 | Nota fiscal emitida | `nf_emitida` | Faturar / Emitir NF | ✅ |
| 8 | Expedido | `expedido` | Bling | 🔧 sincronização |
| 9 | Entregue | `entregue` | Bling | 🔧 sincronização |
| 10 | Pedido fechado | `fechado` | painel (Fechar pedido) | ✅ |

- **Corte/costura saiu do processo** (decidido em 08/10/2026, depois de dois
  rearranjos no mesmo dia): o que se fatura é impressão e estampa. O banco
  recusa qualquer lançamento novo da etapa; os pedidos que estavam nela
  voltaram para Estampa pronta por migração (registro `pronto`, origem
  `sistema`). O valor segue no enum só pelo histórico dos pedidos antigos.
- **O botão Faturar faz tudo**: pedido de venda no Bling, cobrança, etapa
  Faturado e nota fiscal. O card com botões "Emitir NF" e "Gerar cobrança"
  virou "Documentos do faturamento", só leitura (links da DANFE, XML e
  boletos). Se a nota ou a cobrança ficaram pendentes, o bloco "Pedido
  faturado" oferece "Concluir faturamento", que repete só o que faltou. O rótulo "Pedido pronto" passou a **"Estampa pronta"**
  (a chave `pronto` não muda). Ajuste de metragem só existe em Estampando:
  depois do faturamento o valor está no Bling, e quebra na costura é do
  terceiro.

- **Faturado** é a etapa que fala com o Bling. O botão **Faturar**
  (`faturarPedido`, `src/app/actions/faturamento.ts`) faz tudo de uma vez:
  define a forma de pagamento (passo zero, decisão da equipe), pedido de
  venda, cobrança (boleto ou Pix), NF-e quando o pedido é com nota,
  e-mails ao cliente e a etapa. Cada passo pode ser repetido se ficou pela
  metade (NF "processando" é consultada de novo, cobrança já lançada só relê
  os links). Nada muda no portal antes de o Bling confirmar.
- O status continua **derivado** do último registro em
  `pedido_status_historico` (`status_atual(uuid)`).

### Agrupamento de pedidos em "Pedido pronto"

| Regra | Situação |
|---|---|
| Vários pedidos **do mesmo cliente** em Pedido pronto podem virar uma cobrança só | ✅ |
| O pop-up aparece no Faturar quando há outros pedidos prontos do cliente: "só este" ou "unificar" — os dois seguem para o resumo de confirmação | ✅ |
| A forma de pagamento escolhida no bloco Faturar vale para o agrupador | ✅ |
| Nasce um pedido **agrupador**; só ele vai ao Bling | ✅ |
| Os originais ficam em `faturado`, com o rastreio (número do agrupador) nas observações | ✅ |
| Desagrupar exige motivo; se o agrupador já estava no Bling, o cancelamento lá é manual | ✅ |
| Itens do agrupador entram **somados por arte** (`pedido_itens` tem chave única pedido + arte; antes a mesma arte em dois pedidos quebrava com "duplicate key"). A recusa diz qual pedido trava e por quê (migration `20261008160000`) | ✅ |
| **Sem preço médio** (09/10/2026, pedido do dono): cada arte do agrupador leva o preço do metro do pedido de onde veio, e o total é a soma exata dos originais. A mesma arte pode ter preços diferentes: vira uma linha por preço — a chave única de `pedido_itens` passou de (pedido, arte) para (pedido, arte, preço); num pedido comum todos os itens têm o mesmo preço, então lá a mesma arte continua não entrando duas vezes. No Bling, o agrupador vai com uma linha por pedido original, cada uma com metragem e preço daquele pedido (migration `20261009130000`) | ✅ |
| Pedido que já teve cobrança gerada ou já foi ao Bling no fluxo antigo não entra em grupo. Na tela dele, o bloco **"Já foi ao Bling pelo fluxo antigo"** tem o botão **Desfazer faturamento** (motivo obrigatório): apaga as contas a receber e cancela o pedido de venda no Bling, limpa a cobrança no portal (`admin_desfazer_faturamento`, migration `20261008170000`) e registra no andamento; o pedido volta a ser um "pronto" limpo, agrupável. Recusa se houver NF ou pagamento. O que não conseguir cancelar no Bling fica em `bling_erro` para a equipe terminar lá | ✅ |

### Cartão: dois momentos

| Regra | Situação |
|---|---|
| Cartão não tem gateway: a conta a receber é lançada no Bling e o link de pagamento é gerado lá | ✅ |
| No Faturar, o link é **opcional**: pode faturar sem ele | ✅ |
| Depois, o bloco "Pedido faturado" tem o campo para colar o link; o cliente recebe e-mail com o botão "Pagar com cartão" e vê o link no pedido | ✅ |
| A baixa é dada no Bling e chega pela sincronização | ✅ |

### Formas de pagamento por cliente

| Regra | Situação |
|---|---|
| Cada cliente tem a lista de formas que a equipe pode escolher para ele no Faturar; nasce com todas, o dono tira ou devolve na tela do cliente | ✅ |
| Vale junto da configuração geral de Pagamento: as **duas** precisam permitir | ✅ |
| Regra no banco: a RPC do faturamento recusa forma fora da lista; o gatilho em `pedidos` continua travando o papel cliente (hoje sem efeito, porque o cliente não grava forma) | ✅ |

### Limite de crédito consumido pelos boletos

| Regra | Situação |
|---|---|
| Crédito em uso = pedidos faturados em boleto ainda não pagos (parcelas em aberto, ou valor cobrado inteiro no à vista) + pedidos confirmados e não faturados em boleto (valor já conhecido) | ✅ |
| Pix, cartão, cancelados, fechados e "aguardando" ficam de fora | ✅ |
| ~~Pedido em boleto que passa do limite nasce bloqueado em `aguardando`~~ — desde 07/10/2026 o limite é conferido **no Faturar**, quando a forma é escolhida; a recusa marca `bloqueado_credito`, destaca no dashboard e avisa a equipe (`pedido_bloqueado_credito`) | ✅ |
| Só admin/financeiro libera, com motivo, no próprio bloco Faturar (ou troca a forma). Pedidos antigos que nasceram bloqueados em `aguardando` seguem exigindo liberação para confirmar (gatilho) | ✅ |
| Boleto à vista dentro do limite continua disponível mesmo sem crédito para parcelar; Pix e cartão não passam por limite | ✅ |

### Trava por boleto atrasado e aba Boletos

| Regra | Situação |
|---|---|
| ~~Cliente com boleto vencido não envia pedido novo~~ — substituída em 08/10/2026 pela regra dos 5 dias úteis abaixo (o gatilho em `pedidos` foi removido) | ✅ |
| **Boleto vencido há mais de 5 dias úteis trava o andamento, não o envio** (migration `20261008130000`): o cliente envia o pedido, mas vê que ele não será atendido até a regularização; no painel, nenhum pedido do cliente recebe lançamento manual de etapa (confirmar, produção, Faturar, fechar). Gatilho `status_bloquear_por_atraso` em `pedido_status_historico`, só para origem `admin`; `sistema` e `bling` (criação, baixa de pagamento, NF) passam | ✅ |
| Contagem em `cliente_boletos_atraso(cliente)`: parcelas e boleto à vista vencidos e não pagos, com `trava_em` = 6º dia útil após o vencimento (`proximo_dia_util`, com feriados). `cliente_boletos_vencidos` passou a contar só os que travam; `clientes_bloqueados_por_atraso()` lista os clientes travados para a lista de pedidos e o dashboard | ✅ |
| Cliente: faixa amarela com o prazo enquanto o boleto venceu há menos de 5 dias úteis, vermelha ("pedidos não serão atendidos") depois. Painel: etiqueta `atraso` na lista, bloco vermelho na tela do pedido com o botão Liberar, alerta no dashboard | ✅ |
| O dono libera à mão, com motivo (na tela do cliente ou na do pedido); a liberação vale até o **próximo boleto vencer** depois dela | ✅ |
| Boleto pago com atraso ou vencido em aberto **desconta** no score de crédito (pontualidade de −50 a +50), em vez de só render menos | ✅ |
| Aba **Boletos** na área do cliente: todos os boletos, com vencimento, situação e link | ✅ |
| Baixa automática: GitHub Actions de hora em hora chama `/api/cron/pagamentos`, que lê as contas a receber no Bling e marca parcelas/pedidos pagos (`sincronizar_pagamento_*`, idempotentes) | ✅ |

### Boleto à vista: 4 dias úteis

| Regra | Situação |
|---|---|
| O boleto único vence em **4 dias úteis** a partir do faturamento (`BOLETO_AVISTA_DIAS_UTEIS`, `proximo_dia_util()` no banco) | ✅ |
| Pula sábados, domingos e feriados nacionais, fixos e móveis; feriados estaduais e municipais ficam de fora, porque o banco segue o calendário nacional | ✅ |
| A data usada fica em `pedidos.vencimento_avista`, para a leitura das contas casar pelo mesmo vencimento | ✅ |
| **Vencimento escolhido no Faturar** (08/10/2026): o campo "Vencimento" aparece para boleto à vista, já com o padrão de 4 dias úteis; quem fatura pode mudar (ex.: 15 dias a pedido do cliente). **Teto de 30 dias corridos** a partir de hoje, recusado pela RPC (`admin_definir_forma_pagamento_faturamento`, migration `20261008180000`) e avisado na tela (`PRAZO_MAXIMO_BOLETO_AVISTA_DIAS`). A data fica em `pedidos.vencimento_avista`, que o Bling e a cobrança usam | ✅ |

### Parcela mínima no boleto parcelado

| Regra | Situação |
|---|---|
| Mínimo por parcela em Configurações → Pagamento → boleto (padrão **R$ 200**) | ✅ |
| ~~Aplicado já no carrinho, com o valor estimado~~ — desde 07/10/2026 é aplicado no **Faturar**, com o valor real: o seletor de parcelas só oferece o que respeita o mínimo, e a RPC recusa o resto | ✅ |
| Continua aplicado no valor real (romaneio, Pedido pronto e `parcelar_pedido`) | ✅ |
| À vista, Pix e cartão não têm mínimo | ✅ |
| Teto de parcelas: 4 | ✅ |

### Observação do cliente imutável e instruções internas

| Regra | Situação |
|---|---|
| `pedidos.notas` é o que o cliente escreveu ao enviar; ninguém edita nem apaga, nem o admin (gatilho) | ✅ |
| O que a equipe precisa anotar vai em `pedidos.instrucoes_internas`, editável por quem é interno e invisível ao cliente | ✅ |
| Toda edição ou exclusão das instruções vira linha em histórico, com autor e data, por gatilho | ✅ |
| As instruções aparecem na tela do pedido, com o histórico em "Alterações no pedido" | ✅ |

### Pedido fechado sem depender da baixa

| Regra | Situação |
|---|---|
| Fechar exige **cobrança gerada** (boleto/Pix, link do cartão ou pagamento identificado) e **nota fiscal definida** (emitida ou dispensada) | ✅ |
| Não depende mais da baixa financeira no Bling; o pagamento continua sendo registrado em `pedidos.pago_em` e nas parcelas pela sincronização | ✅ |
| Quem fecha é admin/financeiro, pelo bloco "Fechar pedido" do painel, de Faturado em diante (`admin_fechar_pedido`) | ✅ |
| Pedido fechado vai para Arquivados | ✅ |

### Relatório de estampa (prestador de serviço)

| Regra | Situação |
|---|---|
| Financeiro → Relatórios → **Estampa (prestador)**: metros que passaram pela estamparia no período, para conferir a fatura do prestador, que cobra por metro | ✅ |
| O corte é pela **data de saída de Estampando** (lançamento de Estampa pronta em `pedido_status_historico`), não pela entrada nem pela data do pedido — decidido pelo dono em 08/10/2026: o serviço conta quando está concluído. A metragem é a `metragem_impressa` final (já com ajustes de quebra); o que ainda está em Estampando fica para o período seguinte | ✅ |
| Cancelados entram, marcados: o serviço foi feito. Pedido sem romaneio confirmado aparece com 0 m e aviso | ✅ |
| Totais por tecido, por cliente e por dia; CSV pedido a pedido, **CSV pedido com artes** (uma linha por arte: SKU, nome, peças, metros/peça, metros da arte, mais a linha de total do pedido com a metragem impressa) e por dia. `relatorioEstampa` em `src/app/actions/relatorios.ts` | ✅ |

### Painel de crédito (Financeiro → card Crédito, separado das abas)

Decidido em 08/10/2026. Uma tela para acompanhar e gerenciar o financeiro de
cada cliente: limite, crédito em uso, histórico de boletos, score e sugestão
de limite, com exportação em CSV. Regra em `src/lib/credito/score.ts`, pura.

| Regra | Situação |
|---|---|
| Score 0–100 = pontualidade (−50 a +50) + volume (até 30) + frequência (até 20), menos 10 por boleto vencido em aberto (até 30); o resultado é preso entre 0 e 100 | ✅ |
| Pontualidade (08/10/2026: atraso desconta, não só rende menos): boleto pago em dia vale +1; pago com até 7 dias de atraso −0,3; até 30 dias −0,6; mais de 30 dias −1; vencido sem pagar −1. A média × 50 é a pontualidade. Sem boleto vencido ainda: 25 pontos neutros | ✅ |
| Volume: faturamento do cliente no período comparado ao maior cliente (raiz quadrada, para o segundo lugar não ficar com quase nada) | ✅ |
| Frequência: pedidos no período contra um alvo de 0,75 pedido por mês (mínimo 4) | ✅ |
| Classes: Excelente ≥ 80 · Bom ≥ 60 · Atenção ≥ 40 · Risco abaixo · Sem histórico quando não há pedido nem boleto | ✅ |
| Sugestão: boleto vencido há mais de 30 dias → reduzir (maior entre o que está em uso e 75% do limite); score < 40 → reduzir 25%; score ≥ 80 com ≥ 60% do limite em uso → aumentar 25% ou 2× a média mensal faturada; sem limite e score ≥ 60 → definir 2× a média mensal; senão manter | ✅ |
| A sugestão é só sugestão: o ajuste passa pela mesma RPC do cadastro (`atualizar_limite_credito`), com motivo obrigatório e registro em `cliente_limite_historico` e `auditoria` | ✅ |
| Período de análise escolhível: 6, 12 ou 24 meses | ✅ |
| Boletos à vista entram no histórico (vêm de `pedidos`, não de `pedido_parcelas`) | ✅ |
| Exportação CSV da lista de clientes e do histórico de boletos de cada um | ✅ |
| Só admin/financeiro (aba Financeiro inteira) | ✅ |

## Estoque de tecido do cliente

Decidido em 06/10/2026, implementado nos PRs #22, #23 e #24.

### O que é

Cada cliente tem tecido guardado na estamparia. O portal controla **quanto**
de cada tecido ele tem, de onde cada pedido consome e o que entrou. O saldo
nunca é editado: é a soma dos movimentos em `tecido_movimentos` (view
`tecido_saldos`).

| Movimento | Sinal | Quem lança | Situação |
|---|---|---|---|
| Entrada | + | conferência de um envio, ou lançamento manual da equipe | ✅ |
| Consumo | − | gatilho, ao gravar a metragem impressa do pedido | ✅ |
| Quebra | − | equipe (manual) ou reimpressão com tecido do cliente | ✅ |
| Ajuste | ± | equipe, com observação (inventário) | ✅ |

Todo movimento guarda quem, quando, quanto, observação e, quando é o caso, o
pedido. Cadastro de tecidos é do dono; movimentações são da equipe inteira
(`is_admin_producao()`).

### Remessa com NF e conferência

| Regra | Situação |
|---|---|
| O envio é **separado do pedido**: cliente (aba Tecidos) ou equipe (aba Estoque) registram tecido, metros e, opcionalmente, número e arquivo da NF de remessa | ✅ |
| A NF pode ser anexada depois, enquanto o envio não for conferido; depois disso não muda | ✅ |
| O saldo **não muda no envio**: só na conferência, quando a equipe mede o que chegou e isso vira a entrada (metragem **medida**, não a informada; a diferença fica anotada) | ✅ |
| Recusar exige motivo e não mexe no saldo | ✅ |
| Aviso por e-mail à equipe quando o cliente registra envio (`tecido_enviado`, em Configurações → Notificações) | ✅ |
| NF guardada no bucket `documentos`, link assinado | ✅ |

### Consumo no romaneio e quebra

| Regra | Situação |
|---|---|
| Em **Impressão → Estampando** a escolha do tecido do cliente é obrigatória; as opções são os tecidos com saldo dele | ✅ |
| A metragem impressa é baixada do saldo por gatilho, com o número do pedido no extrato; ajuste de metragem acerta a diferença (a mais vira consumo, a menos devolução) | ✅ |
| **Saldo insuficiente bloqueia** a etapa, no banco e no modal. Estoque negativo não existe: lance a entrada antes | ✅ |
| Reimpressão pergunta de onde sai o tecido: do saldo do cliente (informa os metros, baixa como quebra ligada ao pedido) ou fornecido pela Best Color (saldo não muda). O valor da estampa do pedido não muda | ✅ |
| O tecido aparece na tela do pedido e no romaneio em PDF | ✅ |
| Cancelar depois de Estampando não devolve tecido: ele já foi estampado | ✅ |

### Antes de usar em produção

Com o consumo ligado, nenhum pedido passa para Estampando sem tecido em
estoque. Antes dos próximos romaneios a equipe precisa **dar entrada no tecido
que já está na estamparia** pela aba Estoque, senão a produção trava.

## Despesas por nota e suprimentos

### O que é (08/10/2026)

| Regra | Situação |
|---|---|
| Estoque → **Despesas e notas** (admin/financeiro): foto pela câmera ou arquivo (JPG/PNG/WebP/PDF até 10 MB); a foto é reduzida no aparelho antes de subir (1600 px, JPEG 82%) e o original não sobe | ✅ |
| Dois modelos: **rápido** (Haiku, padrão, ~R$ 0,01/página — a opção mais barata, pedida pelo dono) e **preciso** (Opus, ~R$ 0,40), acionado por botão sobre o mesmo arquivo quando o rápido não entende. O modelo usado fica gravado na nota (`modelo_ia`) | ✅ |
| CNPJ/CPF do fornecedor e chave de acesso passam por dígito verificador antes de gravar | ✅ |
| **Leitura por IA** (Claude, saída estruturada) pré-preenche tipo, fornecedor, CNPJ, nº, chave, emissão, pagamento, totais e itens, com confiança por campo; abaixo de 0,7 o campo fica amarelo. **Nunca grava sozinha**: a tela de conferência é a mesma com ou sem IA | ✅ |
| Na conferência, o arquivo enviado abre em tela cheia ao clicar (imagem com zoom, PDF embutido; no celular, botão "Ver a nota") para conferir os dados lidos (12/10/2026) | ✅ |
| Na conferência do envio de tecido, a equipe pode **ler a NF do cliente com IA** e comparar nº, cliente, tecido e metragem com o informado; só pré-preenche, não grava; invisível ao cliente (12/10/2026) | ✅ |
| **Conciliação de extratos** (Financeiro → Conciliação): importa OFX (sem IA) ou PDF/imagem/CSV (IA), sugere o vínculo de cada lançamento com conta a pagar ou cobrança de pedido (valor igual + data + nome), vincula com baixa opcional, ignora com motivo e fecha o extrato sem pendência (12/10/2026, migration `20261012140000`) | ✅ |
| **Baixa manual** em A receber e A pagar: caixa de seleção nas contas em aberto com confirmação em lote (data + observação) e botão de confirmar no detalhe de cada conta. Recebimento manual grava `pago_em` da parcela/pedido e deixa rastro no andamento; a baixa pelo Bling continua (12/10/2026, migration `20261012130000`) | ✅ |
| Compra no **crédito exige o cartão sempre**, com cadastro rápido "+ Cartão" na conferência; aviso "prefira o XML" também para a equipe em Nova nota (decisão do dono, 12/10/2026, migration `20261012150000`) | ✅ |
| **Totalizador no Financeiro**: card no topo com a receber, a pagar e saldo previsto no período (7/15/30 dias ou personalizado), mais o que já venceu (12/10/2026) | ✅ |
| **Cartões de crédito** cadastrados em Configurações → Pagamento (fechamento e vencimento; saiu do Financeiro em 12/10/2026). Compra no crédito escolhe o cartão e as parcelas vencem na fatura real (até o fechamento → fatura do mês; depois → mês seguinte); A pagar filtra por cartão. A fatura é só previsão: a conta guarda a **data da compra** e o **vencimento da nota** para cruzar com o extrato do cartão, e A pagar filtra também por data da compra (decisão do dono, 12/10/2026, migration `20261012120000`) | ✅ |
| "Já pago" não é mais opção em "Como foi paga": Pix, débito, crédito, boleto e a pagar. Pix entra já quitado na emissão, como o débito (decisão do dono, 12/10/2026, migration `20261012110000`) | ✅ |
| O esquema enviado à IA **não usa `nullable`** (a API limita a 16 campos com união de tipos; com destinatário e tecido eram 24 e a leitura falhava com 400). Ausente = `""` / `0` / `nao_informado`, convertido para null por `normalizar()` antes de chegar à conferência (12/10/2026) | ✅ |
| Cada item tem **categoria de gasto** (tabela `categorias_despesa`, semeada e editável) e, opcionalmente, um **suprimento** — aí entra no estoque com o custo | ✅ |
| Chave de acesso de 44 dígitos é única: a mesma NF não entra duas vezes. Exclusão é lógica, com motivo, e desfaz as entradas de estoque | ✅ |
| Relatório: gasto no período, por categoria (com %), por fornecedor, documentos com itens; CSV item a item e por categoria | ✅ |
| Estoque → **Suprimentos** (equipe inteira; custo só para quem vê valores): cadastro com unidade, mínimo (alerta) e **consumo por metro estampado**; saldo = soma dos movimentos; consumo e ajuste à mão; entrada só pela nota | ✅ |
| **Consumo automático**: suprimento com consumo por metro é baixado pelo romaneio (e pelo ajuste de metragem), na mesma lógica do consumo de tecido | ✅ |
| Configuração: `ANTHROPIC_API_KEY` na Vercel. Sem ela, só preenchimento à mão | ⚠️ |
| XML da NF-e, QR code da NFC-e e consulta à SEFAZ (caminho preferencial da especificação do dono) | ❌ a fazer |

## Operação

### Migrations e a Action

- Toda mudança de banco vai em `supabase/migrations/<timestamp>_<nome>.sql`,
  com o rollback de mesmo nome em `supabase/rollbacks/`. A Action "Migrations
  Supabase" aplica ao chegar na `main`.
- Em 06/10/2026 a fila travou porque um PR com timestamp menor foi juntado
  depois de um com timestamp maior; a Action passou a rodar
  `supabase db push --include-all` para isso não acontecer de novo. Mesmo
  assim, confira a Action depois de cada merge com migration.
- PR que depende de outro aponta para a branch dele. Ao juntar o primeiro,
  **apague a branch** ("Delete branch"), senão o dependente é juntado nela e
  não na `main` (aconteceu com #23 e #24, corrigido pelo #26).

### Bling: token JWT (migração obrigatória, 15/10/2026)

O Bling desliga os tokens opacos em 15/10/2026. O portal envia `enable-jwt: 1`
no POST `/oauth/token`, tanto ao conectar quanto a cada renovação; Configurações →
Integração Bling mostra o formato do token atual. Token opaco em uso vira JWT na
próxima renovação automática (poucas horas) ou ao clicar em reconectar.

### Cron sem Vercel Pro

A baixa automática roda por GitHub Actions (`.github/workflows/baixa-pagamentos.yml`,
de hora em hora), chamando `/api/cron/pagamentos` com `CRON_SECRET`. O plano
Hobby da Vercel não aceita cron horário.

## Custos pelas compras (08/10/2026)

- A aba Custos sugere papel e tinta pela média ponderada das notas de compra do período
  (30, 60 ou 90 dias). Papel precisa estar cadastrado em metros; tinta em L ou mL.
- Papel por metro impresso = custo médio do metro comprado no período, sem fator de
  consumo (o dono preferiu a conta simples).
- Coeficiente de tinta (mL por metro) = soma do "consumo por metro" de cada tinta
  cadastrada. Sem coeficiente, mantém o valor atual.
- Calandra não é afetada.
- Atualização automática a cada nota é opcional e começa desligada. Mudanças passam pela
  mesma função `atualizar_custos_producao` e só valem para romaneios futuros.

## Contas a pagar (08/10/2026)

- Toda nota lançada em Despesas informa como foi paga: já pago, cartão de débito, cartão de
  crédito, boleto ou a pagar. Sem isso a nota não salva.
- Já pago e débito entram em contas a pagar quitados na data da nota. Crédito, boleto e a
  pagar geram uma conta por parcela, com vencimento e valor; a soma das parcelas tem de
  bater com o total da nota.
- Conta a pagar só nasce de nota fiscal ou recibo lançado em Estoque → Despesas, com a forma de
  pagamento. Não há lançamento de conta avulsa (decidido em 08/10/2026). A nota pode ser salva
  sem foto ou PDF, depois de um pop-up de confirmação que lembra de anexar; a conta fica marcada
  como "sem comprovante".
- Nota sem foto ou PDF há mais de 2 dias do lançamento aparece num aviso vermelho no dashboard
  (dono e financeiro), até alguém anexar o comprovante pela própria conta a pagar.
- Pagar, mudar vencimento/valor, estornar e cancelar ficam registrados; os três últimos
  exigem motivo. Excluir a nota cancela as parcelas ainda não pagas.

## Avisos do dashboard e e-mail diário (08/10/2026)

- Todos os avisos do dashboard seguem o mesmo formato: uma linha compacta por assunto, com a cor
  indicando a urgência (vermelho urgente, amarelo atenção, azul informação), em duas colunas no
  computador.
- Todo dia de manhã, se houver nota sem comprovante há mais de 2 dias ou conta a pagar vencida,
  sai um e-mail de resumo para quem estiver em Configurações → Notificações → "Pendências de
  contas a pagar". Sem pendência, não sai nada.

### Leitura de nota: conferência automática (09/10/2026)

| Regra | Status |
|---|---|
| Chave de acesso válida corrige CNPJ/CPF, número, série e tipo lidos pela IA; divergência com a chave bloqueia o salvar (tela, servidor e gatilho `despesas_validar`) | ✅ |
| Leitura rápida com erro provável (dígito de CNPJ/chave, soma ≠ total por mais de R$ 0,05, sem total ou sem itens) é relida uma vez, sozinha, pelo modelo preciso em esforço médio | ✅ |
| Mesmo fornecedor + número + série já lançado é recusado no banco; mesmo fornecedor + data + valor pede confirmação | ✅ |
| Emissão no futuro bloqueia; mais de 90 dias avisa | ✅ |
| Comprador diferente do das notas anteriores (2+ notas) avisa — sem cadastro de CNPJ da empresa | ✅ |
| `leitura_ia` + `versao_prompt` guardam a leitura original e o que a conferência mudou, para medir o acerto por modelo | ✅ |
| Importar o XML da NF-e: sem IA, dados exatos, duplicatas viram parcelas, XML guardado como comprovante (`modo = 'xml'`, migration `20261010100000`) | ✅ |
| Nota de tecido de cliente: a leitura reconhece o tecido e o cliente; o item marcado vira envio de tecido (NF anexada, saldo só na conferência); nota só de tecido não gera despesa; cadastro rápido de tecido no próprio item | ✅ |
| Toda entrada conferida contra repetição: nota de compra (chave; fornecedor+número+série; fornecedor+tipo+data+valor+quantidades pede confirmação) e envio de tecido (mesmo cliente+NF recusa; sem NF, cliente+tecido+metragem no dia recusa; nota lida anexa ao envio que o cliente já avisou) | ✅ |
| Ler QR code/código de barras e várias fotos num documento | a fazer |

### Limite de crédito só no portal (09/10/2026)

| Regra | Status |
|---|---|
| O limite de crédito vale só no portal (Faturar). Se o cadastro do cliente no Bling barra o pedido de venda pelo limite de lá, o portal tira esse limite do contato (`limiteCredito = 0`), registra em auditoria e tenta de novo uma vez | ✅ |
| Se o Bling continuar barrando, a tela pede para marcar "Limite ilimitado" no contato do Bling | ✅ |
| Configurações → Bling tem o botão "Tirar o limite do Bling de todos os clientes", com confirmação e resultado por cliente | ✅ |
| Cliente cadastrado ou editado no portal já vai ao Bling sem limite de crédito | ✅ |

