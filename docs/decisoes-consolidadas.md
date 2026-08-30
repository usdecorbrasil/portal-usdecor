Decisões consolidadas — Portal Bello Tecido

Atualizações ao escopo original, definidas durante a validação da demo.

1. Fluxo de status: nove etapas, não oito
#	Status	Origem
1	Pedido recebido	Automático (criação do pedido)
2	Impressão	Manual — painel
3	Estampando	Manual — painel
4	Em corte / costura	Manual — painel
5	Pedido pronto	Manual — painel
6	Nota fiscal emitida	Bling
7	Expedido	Bling
8	Entregue	Bling
9	Pedido fechado	Bling — exige baixa financeira

Novo: "Nota fiscal emitida" entre Pedido pronto e Expedido.

2. Status vira histórico, não sequência fixa

O pedido não percorre obrigatoriamente as nove etapas. O que existe é um registro do que efetivamente aconteceu.

Pedido sem costura vai de Estampando direto para Pedido pronto
Retirada em balcão pula Expedido
O admin escolhe qual é a próxima etapa, entre as ainda não lançadas
O admin pode desfazer o último lançamento manual

Implicação técnica: a coluna status na tabela pedidos passa a ser derivada do último registro em pedido_status_historico, não um campo independente atualizado à mão.

3. E-mails: quatro disparos
Gatilho	Conteúdo
Pedido recebido	Confirmação do pedido
Impressão	Aviso de entrada em produção
Pedido pronto	Solicitação de pagamento + resumo do pedido
Nota fiscal emitida	Aviso + PDF da NF anexo
Todos os disparos previstos
#	Gatilho	Para	Conteúdo
1	Cliente envia pedido	Equipe	Aviso de pedido aguardando confirmação
2	Cliente cancela antes da confirmação	Equipe	Aviso com o motivo
3	Cliente solicita cancelamento	Equipe	Aviso com o motivo
4	Cliente envia link de artes	Equipe	Aviso com link e observações
5	Pedido confirmado	Cliente	Confirmação do pedido
6	Impressão	Cliente	Entrou em produção
7	Pedido pronto	Cliente	Cobrança + boleto + resumo
8	Nota fiscal emitida	Cliente	Aviso + PDF da NF
9	Pedido cancelado pela equipe	Cliente	Motivo do cancelamento
10	Solicitação de cancelamento respondida	Cliente	Aceita ou recusada, com motivo
11	Envio de artes rejeitado	Cliente	O que precisa corrigir no reenvio
12	Quantidade ajustada	Cliente	Motivo e novo valor
13	Convite de primeiro acesso	Cliente	Link para definir senha
14	Recuperação de senha	Cliente	Link para nova senha

Idempotência: a tabela email_log tem chave única por pedido e tipo, impedindo disparo duplicado.

O ciclo comercial

O e-mail de "Pedido pronto" fecha o ciclo financeiro do portal:

Produção termina → cliente é avisado e recebe a cobrança
Cliente paga
NF é emitida no Bling → portal envia a nota
Expedição
Baixa financeira no Bling → pedido fechado

O e-mail de cobrança traz o resumo (itens, quantidades, subtotais, total), a linha digitável e o boleto em anexo. No portal, o pedido nessa etapa exibe um bloco escuro com o valor em aberto, a linha digitável copiável e o PDF.

Forma de pagamento: boleto via Bling Conta

Decisão: usar a Bling Conta em vez de carteira de cobrança do banco próprio (CNAB).

	Banco próprio (CNAB)	Bling Conta
Para começar	Homologação com o banco	Abrir a conta
Registro do boleto	Depende do envio da remessa	Imediato
Baixa financeira	Importação manual do arquivo de retorno	Automática
"Pedido fechado" no portal	Só se alguém importar o retorno	Sozinho

Motivo: toda a automação do portal depende de a baixa chegar sem intervenção humana. Com CNAB, o elo final do fluxo viraria tarefa manual diária.

Fluxo técnico do boleto
Admin marca Pedido pronto no painel
Portal cria a conta a receber no Bling e solicita a emissão do boleto
Bling devolve PDF e linha digitável — registro é imediato na Bling Conta
Portal guarda o PDF no Storage privado e dispara o e-mail de cobrança
Cliente paga → Bling Conta concilia automaticamente
Sincronização detecta a baixa e o portal avança o pedido
NF emitida → e-mail com a nota → expedição → pedido fechado

Regra: o boleto pode ser cancelado pelo Bling a qualquer momento, com reflexo no banco emissor em até 24h. Prever tratamento de cancelamento e reemissão no painel.

Emissão da NF — decisão

A emissão permanece no Bling. O portal não dispara nem transmite nota.

Fluxo: você emite a NF-e no Bling como sempre → a SEFAZ autoriza → a sincronização do portal detecta a autorização → o status avança para "Nota fiscal emitida" → o cliente recebe o e-mail com a nota anexa.

Motivo: nota rejeitada é comum (dados fiscais do produto, instabilidade da SEFAZ, novas validações da Reforma Tributária em 2026). A correção sempre acontece no Bling, com acesso aos campos fiscais. Um botão no portal daria a ilusão de controle e devolveria o problema para o mesmo lugar.

O painel do admin tem um atalho Abrir no Bling para o pedido, e o bloco "Aguardando o Bling" deixa explícito o que chega sozinho.

Envio da NF — decisão

O envio automático de NF pelo Bling fica desligado. Quem envia é o portal, com identidade Bello Tecido, link do pedido e a nota anexa.

Motivo técnico: o Bling protege os links públicos de DANFE com um código de acesso (4 primeiros dígitos do CNPJ) e o link expira após 5 tentativas erradas. Repassar o link bruto ao cliente resultaria numa tela de senha.

Solução: o portal busca o PDF pela API autenticada, guarda no Storage privado do Supabase e serve ao cliente por URL assinada de curta duração. O cliente abre a nota direto, sem senha.

Atenção na implementação: os links de DANFE e XML do Bling têm limite de 255 caracteres, e o link do XML precisa ser obtido individualmente por nota.

3b. Ajuste de quantidade a faturar

Falhas de estamparia acontecem: o cliente pede 100 m, o tecido apresenta defeito e só 95 m saem aproveitáveis. O admin precisa reduzir o que será faturado.

Modelo

Cada item do pedido guarda duas quantidades:

Campo	Significado
quantidade_pedida	O que o cliente pediu — imutável
quantidade_faturada	O que será cobrado — editável dentro da janela

O total do pedido é sempre calculado sobre a quantidade faturada.

Janela de edição

Permitido de Pedido recebido até Pedido pronto. Travado a partir de "Nota fiscal emitida".

Motivo: NF autorizada pela SEFAZ não se altera. Mudança de valor após a emissão exige nota de devolução ou carta de correção — processo contábil, fora do portal. Editar depois criaria divergência entre o portal e o que foi declarado ao fisco.

Atualizado em 3h: a janela de ajuste de quantidade foi encurtada — fecha ao lançar "Impressão", não mais na nota fiscal. Ver seção 3h.

Regras
Quantidade faturada nunca maior que a pedida (só reduz)
Motivo obrigatório, mínimo 10 caracteres
O motivo é exibido ao cliente no detalhe do pedido
Registro de quem alterou e quando, no histórico
Item aparece ao cliente com a quantidade original riscada e a nova ao lado

Atualizado nesta conversa: a trava "só reduz" foi removida. O dono pode aumentar ou reduzir livremente a quantidade faturada, dentro da mesma janela (até o lançamento de "Impressão"), mantendo motivo obrigatório e auditoria. O teto de 50% acima do pedido, citado abaixo, também deixou de ser aplicado no front-end — verificar se ainda existe validação equivalente em trigger ou em outra função no banco (pendência em aberto, ver seção de Pendências).

Efeitos ao salvar
Grava novas quantidades e o motivo
Atualiza o pedido de venda no Bling
Se o boleto já foi emitido: cancela no Bling e reemite com o novo valor
Reenvia o e-mail de cobrança atualizado
Registra no histórico

Atenção na implementação: o cancelamento de boleto leva até 24h para propagar no banco emissor. Prever estado intermediário no painel.

Implicação no schema

A tabela pedido_itens deixa de ser imutável. O bloqueio de UPDATE previsto no schema inicial sai; entra auditoria: tabela pedido_ajustes com item, quantidade anterior, nova, motivo, autor e data.

3c. Cancelamento de pedido

Só o admin cancela. O cliente nunca cancela sozinho.

Momento	Permitido
Pedido recebido até Pedido pronto	✅ admin
A partir de "Nota fiscal emitida"	❌ — exige cancelamento de NF ou devolução no Bling
Efeitos
Cancela o pedido de venda no Bling
Cancela o boleto, se já emitido
E-mail ao cliente com o motivo
Pedido sai da aba Produção, mas permanece na lista, marcado como cancelado

Motivo obrigatório, mínimo 10 caracteres, exibido ao cliente. Se o pedido já entrou em produção, a confirmação alerta sobre o custo do material consumido e até que etapa chegou.

Atualizado em 3h: as regras de cancelamento pelo cliente mudaram — ver seção 3h ("Quem pode o quê" e "Cancelamento pelo cliente").

3d. Solicitação de alteração pelo cliente

Removido em 3h. Esta seção descreve uma regra que deixou de existir. O cliente confere tudo no carrinho antes de enviar; depois do envio, não há mais solicitação de alteração — apenas cancelamento (antes da confirmação, direto; depois, por solicitação). Mantida abaixo apenas como histórico da decisão original.

Disponível somente enquanto o pedido está em "Pedido recebido". Depois disso o botão não existe — a produção já começou.

O cliente descreve o que quer mudar em texto livre. A solicitação aparece no topo do detalhe do pedido no painel, com botões Aceitar e Recusar. Aceitando, o admin aplica pela tela de ajuste de quantidades.

O cliente acompanha a situação no portal: aguardando, aceita ou não atendida.

Por que não deixar o cliente editar direto: o tecido pode já estar cortado. A solicitação vira registro dentro do pedido, em vez de conversa solta no WhatsApp.

3e. Reimpressão

Botão Retornar para reimpressão, disponível entre Impressão e Pedido pronto. Leva o pedido de volta à etapa de Impressão.

Registro obrigatório
Motivo, mínimo 10 caracteres
Quem arca com o custo: Bello Tecido (retrabalho interno) ou Cliente (arte ou dado errado)
Comportamento
O histórico não é apagado — mostra que o pedido avançou e voltou
A entrada de retorno aparece marcada em âmbar, com o motivo
A aba Produção exibe contador: "2ª reimpressão"
Permite medir retrabalho ao longo do tempo
3f. Confirmação em ações sensíveis

Janela de confirmação obrigatória, listando as consequências antes de executar.

Ação	Tom	Alerta extra
Cancelar pedido	Magenta	Etapa atingida + valor cancelado
Reimprimir	Âmbar	Contador se já houve reimpressão
Desativar arte	Âmbar	—
Desativar cliente	Magenta	Quantidade de pedidos no histórico

A confirmação aparece após a validação do motivo, para não perder o texto digitado. Tocar fora fecha sem executar.

Regra: desativar, nunca excluir

Nem cliente nem arte são apagados do banco. Sempre ativo = false.

Motivo: excluir arte deixa pedidos antigos órfãos; excluir cliente apaga o histórico de faturamento. Desativando, o dado permanece íntegro e reversível.

3f-bis. Unidade e metragem

O portal trabalha com duas unidades, e a conversão acontece na fronteira com o Bling.

Onde	Unidade	Motivo
Catálogo, carrinho, pedido	unidades	é como o cliente pensa
Bling (item, NF, boleto)	metros (MT)	cobrança e controle fiscal
Campo novo em produtos
sql
alter table public.produtos
  add column metros_por_unidade numeric(10,3) not null default 1
    check (metros_por_unidade > 0);

Cada estampa tem um comprimento fixo por repetição. Exemplo: AUR-1042 mede 1,40 m por unidade.

Precificação: por metro

O admin cadastra o preço por metro. O portal calcula e exibe o preço por unidade ao cliente.

preco_unidade = preco_por_metro × metros_por_unidade

Exemplo: R$ 8,86/m × 1,40 m = R$ 12,40 por unidade

A coluna preco passa a significar preço por metro.

Atualizado nas Pendências de funcionalidade: o preço por metro deixou de ser um campo de produtos e passou a ser único por cliente. Ver seção "REVISÃO — preço por cliente, não por arte".

O que cada parte enxerga
Ator	Vê
Cliente	80 un × R$ 12,40 = R$ 992,00 · (112 m)
Admin	os dois: unidades e metragem
Bling	112 MT × R$ 8,86 = R$ 992,00

O resumo do pedido mostra a metragem total, para o cliente conferir.

Cuidado com arredondamento

O total deve ser calculado uma vez só, em metros, para não haver diferença de centavos entre o portal e a nota fiscal:

total = (quantidade_un × metros_por_unidade) × preco_por_metro

Nunca somar preços unitários já arredondados.

3g. Produtos no Bling — produto genérico

Decisão: o Bling não recebe cadastro individual das estampas.

O catálogo de artes existe apenas no portal. No Bling há um produto genérico — algo como "Estampa em tecido sublimado" — e cada item do pedido usa esse produto, com quantidade, valor unitário e descrição vindos do portal.

Por que assim
	Cadastro individual	Produto genérico
Cadastro por arte	Portal + Bling	Só portal
Campos fiscais (NCM, CEST, origem)	Por arte	Uma vez só
Risco de divergência	Alto	Nenhum
Estampa nova entra no pedido	Só após cadastro no Bling	Imediato

As artes mudam com frequência e são exclusivas por cliente. Cadastrar cada uma no Bling criaria centenas de produtos com os mesmos dados fiscais, sem ganho.

Como o item chega ao Bling

A API v3 aceita, por item do pedido: identificador do produto, código, descrição, quantidade, valor unitário e unidade de medida.

O portal envia:

Campo do Bling	Origem no portal
produto.id	ID fixo do produto genérico
codigo	SKU da estampa
descricao	{SKU} — {nome} — {tecido} — {qtd} un de {metros} m
quantidade	quantidade faturada × metros por unidade
valor	preço por metro do cliente
unidade	MT — metro

A nota fiscal sai com a descrição detalhada de cada estampa, mesmo usando um produto único no cadastro.

Configuração necessária no Bling
 Criar o produto genérico com os dados fiscais corretos
 Anotar o ID desse produto → vai para variável de ambiente
 Unidade de medida: metro (MT)
 Verificar se a conta permite valor unitário livre por item

Atenção: o Bling tem uma configuração que bloqueia item com preço abaixo do valor de tabela do produto. Como cada cliente tem preço próprio, essa trava precisa estar liberada — senão pedidos com preço menor são recusados.

Implicação no schema

Nenhuma coluna nova em produtos. O ID do produto genérico fica em variável de ambiente:

BLING_PRODUTO_GENERICO_ID=
4. Visibilidade: cliente x admin
Informação	Cliente	Admin
Etapas já cumpridas	✅	✅
Etapas futuras	❌	✅ (como opção de lançamento)
Origem da atualização (painel / Bling / automático)	❌	✅
Marcação de e-mail disparado	❌	✅
Etapa atual em destaque	✅	✅
5. Catálogo do admin

Lista de clientes com resumo (total de artes, ativas, inativas). As imagens só carregam ao entrar no catálogo de um cliente específico.

6. Aba Produção (nova)

Primeira tela do admin. Lista dos pedidos em produção (etapas 1 a 5).

Ordenação automática pelo tempo parado na etapa atual
Alerta visual: crítico a partir de 4 dias parado, atenção a partir de 2
Filtro por etapa, com contagem
Sem prazo de entrega — decisão explícita

Implicação técnica: o tempo parado é calculado a partir do created_at do último registro em pedido_status_historico. Nenhuma coluna nova.

7. Quantidade no catálogo

Incremento de 5 em 5 unidades no catálogo, 1 em 1 no carrinho. O cliente compra em unidades; o Bling recebe em metros.

8. Envio de artes
Campo de link obrigatório — validação no navegador, no servidor e no banco
Link precisa começar com https://
Aviso em dois passos: compartilhar a pasta com bellotecido@gmail.com (com botão de copiar) e nomear cada arquivo pelo SKU
Campo de observações permanece opcional
9. Identidade visual

Logo Bello Tecido aplicado: horizontal no cabeçalho, símbolo como favicon, vertical como ícone de app e no selo de compartilhamento. Paleta alinhada ao logo: magenta 
#D8007A e ciano 
#0090D8.

10. Infraestrutura
Item	Escolha	Custo
Hospedagem	Cloudflare Workers	US$ 0
Banco / auth / storage	Supabase Free	US$ 0
E-mails	Resend	US$ 0 até 3.000/mês
Backup	GitHub Actions diário	US$ 0
Domínio	Registro.br	~R$ 40/ano

Vercel Hobby descartado: proíbe uso comercial. Supabase Pro dispensado por ora; backup diário externo cobre a lacuna.

3h. REVISÃO — confirmação de pedido e alterações

Substitui as regras de 3b, 3c e 3d.

Fluxo novo: pedido precisa ser confirmado

O pedido enviado pelo cliente não entra em produção automaticamente. Ele fica aguardando confirmação da equipe.

O fluxo passa a ter dez etapas:

#	Status	Chave	Origem
1	Aguardando confirmação	aguardando	automático
2	Pedido confirmado	recebido	painel
3	Impressão	impressao	painel
4	Estampando	estampando	painel
5	Em corte / costura	corte_costura	painel
6	Pedido pronto	pronto	painel
7	Nota fiscal emitida	nf_emitida	Bling
8	Expedido	expedido	Bling
9	Entregue	entregue	Bling
10	Pedido fechado	fechado	Bling

O pedido nasce em aguardando. A equipe confirma, e ele passa a recebido (exibido como "Pedido confirmado"). Só a partir daí entra em produção.

Pedido criado pelo admin já nasce confirmado — pula a etapa 1.

Quem pode o quê
Ação	Cliente	Funcionário	Dono
Alterar quantidade	❌ nunca	❌	✅ até a Impressão
Confirmar pedido	❌	✅	✅
Cancelar antes da confirmação	✅ direto	✅	✅
Cancelar depois da confirmação	❌ solicita	✅	✅
Reimprimir	❌	✅	✅
Cancelamento pelo cliente
Antes da confirmação: cancela direto. A equipe recebe e-mail avisando.
Depois da confirmação: só pode solicitar. A equipe decide.
Janela de alteração de quantidade

Fecha ao lançar "Impressão" — não mais na nota fiscal.

Depois disso, as únicas saídas são reimpressão ou cancelamento.

Motivo: com a impressão iniciada, o material já foi consumido. Alterar quantidade a partir daí não reflete o que aconteceu na produção.

Atualizado nesta conversa: dentro dessa mesma janela (até o lançamento de "Impressão"), o dono pode agora aumentar ou reduzir livremente a quantidade faturada — a trava de "só reduz" e o teto de 50% acima do pedido foram removidos do front-end (painel-acoes.tsx). Motivo obrigatório e auditoria em pedido_ajustes continuam valendo sem alteração.

Pendente de confirmação: ainda não localizamos se existe alguma validação equivalente ao teto de 50% em trigger ou em outra função no banco — o erro "Máximo de 8 un... 50% acima do pedido" voltou a aparecer mesmo após a limpeza do front-end e da função ajustar_quantidade_item. Ver seção de Pendências.

Notificações à equipe
Evento	Ação
Pedido recebido do cliente	E-mail ao admin
Cliente cancelou antes da confirmação	E-mail ao admin
Cliente solicitou cancelamento	E-mail ao admin

Push fica para depois. Exige transformar o portal em aplicativo instalável, com permissão do navegador e serviço de envio — bloco de trabalho próprio. Começar por e-mail e pelo aviso no dashboard; avaliar push quando o portal estiver em uso.

Dashboard ganha um bloco de avisos no topo: pedidos aguardando confirmação, solicitações de cancelamento pendentes.

Removido

A solicitação de alteração de quantidade pelo cliente (item 3d) deixa de existir. O cliente confere no carrinho antes de enviar; depois disso, não altera.

3i. Coleções — permissões (IMPLEMENTADO)

A arte ganha a possibilidade de ser movida entre coleções do mesmo cliente.

Quem edita o quê no catálogo
Campo / ação	Cliente	Funcionário	Dono
SKU, nome, tecido, imagem	❌	❌	✅
Metros por unidade, preço	❌	❌	✅
Mover arte entre coleções	✅	✅	✅
Renomear coleção	✅	✅	✅
Criar coleção	❌	❌	✅
Arquivar coleção	❌	❌	✅
Ativar / desativar arte	❌	❌	✅
Ver preços	próprios	❌	✅
Onde cada ação aparece

Dono: coleção é campo do formulário de edição da arte, junto com SKU, nome, tecido e preço. Renomear fica no cabeçalho do catálogo.

Funcionário: seletor de coleção separado no card, com confirmação. Sem acesso a preços nem a editar/ativar.

Cliente: seletor de coleção no card, com confirmação. Renomear ao lado do nome da coleção, e só quando tem mais de uma.

Regras de banco
mover_arte_colecao() — destino obrigatoriamente coleção ativa do mesmo cliente; cliente só mexe nas artes dele
renomear_colecao() — só nome e descrição; cliente não renomeia coleção arquivada
Nenhuma dessas funções permite tocar em preço, SKU ou status de ativação
Regra do seletor de coleção

O dropdown lista apenas as coleções do cliente dono da arte. Impossível mover uma arte para a coleção de outro cliente — validado na tela, na Server Action e no banco (trigger validar_catalogo_produto, já existente).

Implicação técnica

O cliente passa a ter permissão de UPDATE em produtos, restrita a:

artes do próprio cliente_id
alteração exclusiva da coluna catalogo_id
destino obrigatoriamente uma coleção ativa do mesmo cliente

Exige política de RLS específica, com verificação coluna a coluna.

3j. Aba Artes incorporada ao Catálogo

A aba "Artes" deixa de existir como item separado.

Lado do admin: o envio de links de arte pelo cliente aparece dentro de Catálogos, como uma área de pendências — quais clientes enviaram artes aguardando cadastro.

Lado do cliente: o envio de artes fica dentro do catálogo dele. Com mais de uma coleção, as artes aparecem agrupadas por coleção.

Pendências de funcionalidade
REVISÃO — preço por cliente, não por arte (a construir)

Muda o modelo de precificação em toda a estrutura já construída.

Modelo atual (a ser substituído)

Preço por metro é campo de produtos — cada estampa tem seu próprio valor.

Modelo novo

Preço por metro é único por cliente. Todas as artes daquele cliente usam o mesmo valor. Cadastrar arte nova não pede preço — ele vem do cliente.

Onde o preço passa a viver
sql
alter table public.clientes
  add column preco_metro numeric(12,2) not null default 0
    check (preco_metro > 0);

A coluna produtos.preco deixa de ser usada para exibição — o valor efetivo é sempre clientes.preco_metro. Avaliar se remove a coluna ou mantém como histórico do que foi cadastrado originalmente.

Quem edita o preço do cliente

Só o dono, na tela de cadastro/edição do cliente — mesmo padrão de acesso que já existe para os demais campos administrativos.

Alterar o preço do cliente não muda pedidos já feitos — o preço gravado em pedido_itens.preco_unitario continua congelado no valor da época, como já funciona hoje.

Desconto pontual no pedido

Na confirmação de um pedido específico, o dono pode aplicar um desconto só naquele pedido — sem alterar o preço padrão do cliente nem o cadastro de nenhuma arte.

Regra	Comportamento
Desconto é por pedido	Não persiste para pedidos futuros
Não altera clientes.preco_metro	O padrão do cliente continua intacto
Registrado com motivo	Auditoria de por que aquele pedido saiu mais barato
Só o dono aplica	Funcionário não vê nem aplica desconto

Implicação técnica: a função admin_criar_pedido (ou uma nova etapa na confirmação) precisa aceitar um preço por metro alternativo para aquele pedido específico, sem tocar na tabela clientes. Provavelmente um campo preco_metro_pedido ou percentual de desconto em pedidos, aplicado no momento de gravar pedido_itens.

Decisões
Campo de preço na arte: removido. Cadastro de arte não pede preço.
Desconto pontual: valor fixo por metro (não percentual)
Quando pode alterar: o dono altera o preço do pedido a qualquer momento, não só na confirmação — mesma janela das outras edições, até a nota fiscal ser emitida
Visibilidade: o cliente vê o preço aplicado no pedido. Ele não vê o preço-tabela do cliente separadamente — só o valor daquele pedido
Onde o preço do pedido é definido

Ao criar o pedido (cliente ou admin em nome dele), cada item nasce com o preco_metro do cliente naquele momento — congelado, como já funciona hoje com preco_unitario.

O dono pode então sobrescrever esse valor por item, num pedido específico, com motivo obrigatório — reaproveitando a mesma tela e a mesma auditoria já construídas para o ajuste de quantidade (pedido_ajustes, ou tabela irmã dedicada a preço).

3k. Parcelamento do boleto (a construir)

Possibilidade de dividir o valor do pedido em mais de uma parcela.

Regras
Item	Regra
Quem configura	Somente o dono
Onde	Na confirmação do pedido, ou na tela de cobrança
Padrão	Parcela única, como hoje
Perguntas a esclarecer antes de implementar
 O parcelamento é por boleto (um boleto por parcela) ou uma condição do pedido (ex.: 30/60/90 dias)?
 Quantas parcelas no máximo?
 Cada parcela vira uma linha própria em pedidos/cobrança, ou ficam registradas numa tabela pedido_parcelas?
 Se uma parcela atrasar, o que acontece com o fluxo do pedido — ele trava em "Pedido pronto" até pagar tudo, ou libera por parcela paga?
 O Bling Conta permite múltiplos boletos vinculados ao mesmo pedido de venda, ou cada boleto precisa ser um lançamento financeiro separado?

Implicação técnica provável:

sql
create table public.pedido_parcelas (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references public.pedidos(id) on delete cascade,
  numero         integer not null,
  valor          numeric(12,2) not null check (valor > 0),
  vencimento     date not null,
  boleto_id      text,
  boleto_linha   text,
  pago_em        timestamptz,
  unique (pedido_id, numero)
);

O status "Pedido fechado" precisaria checar que todas as parcelas foram pagas, não só uma baixa financeira única.

Relacionado à seção 3l, abaixo: o parcelamento via boleto passa a depender do limite de crédito do cliente — cliente que atingiu o limite fica bloqueado para boleto parcelado, mesmo que a funcionalidade de parcelamento em si já esteja pronta.

3l. Admin financeiro, limite de crédito e forma de pagamento (a construir)

Novo papel de acesso: Admin Financeiro, com escopo próprio dentro do painel administrativo.

Responsabilidades do Admin Financeiro
Controle de contas a receber do sistema
Define e edita o limite de crédito de cada cliente
Acompanha o consumo do limite (quanto do crédito já está comprometido em pedidos em aberto)
Limite de crédito por cliente

Cada cliente passa a ter um teto de crédito. Quando o valor em aberto (pedidos ainda não pagos/baixados) atinge esse limite, o cliente é bloqueado para boleto parcelado.

Situação	Boleto à vista	Boleto parcelado	Cartão (crédito/débito)
Dentro do limite	✅	✅	✅
Limite atingido	✅ (a esclarecer — ver perguntas)	❌ bloqueado	✅
Forma de pagamento no pedido

O cliente passa a selecionar a forma de pagamento ao montar o pedido, não é mais fixo em boleto. Opções previstas:

Boleto à vista
Boleto parcelado (indisponível se limite de crédito atingido)
Cartão de crédito
Cartão de débito

Se o cliente estiver bloqueado, o portal esconde ou desabilita a opção de parcelamento, deixando disponíveis apenas à vista e cartão.

Perguntas a esclarecer antes de implementar
 Boleto à vista também bloqueia quando o limite é atingido, ou só o parcelado? (o pedido do dono sugere que só parcelado bloqueia)
 Como o limite é calculado: soma de pedidos em aberto (aguardando até fechado não pago), ou só a partir de algum status específico (ex.: a partir de "Pedido pronto", quando a cobrança é gerada)?
 Cartão de crédito/débito — qual gateway? O Bling Conta cobre isso ou precisa de um provedor separado (Stripe, Pagar.me, Mercado Pago etc.)?
 Pagamento por cartão é capturado no ato do pedido (antecipado) ou só na etapa "Pedido pronto", como já acontece com o boleto hoje?
 O Admin Financeiro é um papel novo e distinto de Dono/Funcionário, ou é uma permissão adicional dentro do papel Dono?
 O Admin Financeiro pode ver preços e dados de todos os clientes, ou só o que for necessário para contas a receber?
 Alteração de limite de crédito precisa de motivo/auditoria, como as outras ações sensíveis (seção 3f)?
Implicação técnica provável
sql
-- novo campo em clientes
alter table public.clientes
  add column limite_credito numeric(12,2) not null default 0
    check (limite_credito >= 0);

-- forma de pagamento no pedido
alter table public.pedidos
  add column forma_pagamento text not null default 'boleto_avista'
    check (forma_pagamento in ('boleto_avista', 'boleto_parcelado', 'cartao_credito', 'cartao_debito'));

-- papel novo (ajustar enum/tabela de papéis existente)
-- ex.: papel_usuario in ('cliente', 'funcionario', 'dono', 'financeiro')

A checagem de bloqueio por limite provavelmente vira uma função cliente_pode_parcelar(cliente_id) chamada tanto na Server Action de criação do pedido quanto validada de novo no banco (RLS/trigger), seguindo o mesmo padrão das outras regras — nunca confiar só na validação do front-end.

4. Visibilidade: cliente x admin

(ver seção 4 acima — sem novas mudanças)

5. Catálogo do admin

(ver seção 5 acima — sem novas mudanças)

6. Aba Produção (nova)

Primeira tela do admin. Lista dos pedidos em produção (etapas 1 a 5).

Ordenação automática pelo tempo parado na etapa atual
Alerta visual: crítico a partir de 4 dias parado, atenção a partir de 2
Filtro por etapa, com contagem
Sem prazo de entrega — decisão explícita

Implicação técnica: o tempo parado é calculado a partir do created_at do último registro em pedido_status_historico. Nenhuma coluna nova.

7. Quantidade no catálogo

Incremento de 5 em 5 unidades no catálogo, 1 em 1 no carrinho. O cliente compra em unidades; o Bling recebe em metros.

8. Envio de artes
Campo de link obrigatório — validação no navegador, no servidor e no banco
Link precisa começar com https://
Aviso em dois passos: compartilhar a pasta com bellotecido@gmail.com (com botão de copiar) e nomear cada arquivo pelo SKU
Campo de observações permanece opcional
9. Identidade visual

Logo Bello Tecido aplicado: horizontal no cabeçalho, símbolo como favicon, vertical como ícone de app e no selo de compartilhamento. Paleta alinhada ao logo: magenta 
#D8007A e ciano 
#0090D8.

10. Infraestrutura
Item	Escolha	Custo
Hospedagem	Cloudflare Workers	US$ 0
Banco / auth / storage	Supabase Free	US$ 0
E-mails	Resend	US$ 0 até 3.000/mês
Backup	GitHub Actions diário	US$ 0
Domínio	Registro.br	~R$ 40/ano

Vercel Hobby descartado: proíbe uso comercial. Supabase Pro dispensado por ora; backup diário externo cobre a lacuna.

Fila de impressão (a construir)

Ordenação manual dos pedidos que aguardam impressão, para a equipe seguir uma sequência definida em vez de decidir na hora.

Quem faz o quê
Ação	Funcionário	Dono
Ver a fila	✅	✅
Reordenar (arrastar)	❌	✅
Avançar etapa a partir da fila	✅	✅
Comportamento
Entram na fila os pedidos confirmados que ainda não foram impressos
O dono arrasta os cartões para definir a ordem
Quando um pedido avança de etapa, sai da fila automaticamente e os demais sobem
Pedido que volta para reimpressão reentra na fila — decidir se no topo ou no fim
Pedido cancelado sai da fila
Implicação técnica

Coluna nova em pedidos:

sql
alter table public.pedidos
  add column ordem_fila numeric;

Usar valor fracionário em vez de inteiro sequencial: ao inserir entre a posição 2 e a 3, grava 2.5 e nenhuma outra linha precisa ser reescrita. Renumerar só quando as casas decimais ficarem longas demais.

A função de reordenação exige is_admin(). O funcionário lê a fila mas não altera — validado no banco, não só na tela.

Decisões
Composição da fila: pedidos com status Impressão — não é "aguardando impressão", é "em impressão agora". Entra ao lançar a etapa, sai ao avançar para a próxima
Reimpressão: reentra no fim da fila, com marcação visual
Onde fica: aba própria no painel, visível para funcionário e dono
Reordenação: arrasto (desktop) ou setas ▲▼ (funciona em qualquer aparelho, essencial no celular)

Implementado. Pendência de ajuste visual: reduzir o tamanho dos cards da lista — hoje ocupam espaço maior que o necessário.

Aba Configurações (a construir)

Área exclusiva do dono, para administrar o portal sem depender do Supabase.

Equipe
Cadastrar funcionário: e-mail, nome, senha provisória gerada
Listar equipe com papel e situação
Redefinir senha de qualquer usuário
Ativar / desativar acesso
Promover funcionário a admin, ou rebaixar
Registro de quem fez cada alteração

Motivo: hoje criar funcionário exige mexer no painel do Supabase e rodar SQL. Precisa estar no portal.

Dados da empresa
Razão social, CNPJ, endereço, telefone
E-mail de contato exibido aos clientes
E-mail que recebe as notificações internas
Logo (já embutido, mas permitir troca)
Integrações
Bling: status da conexão, botão de reconectar, token e validade
ID do produto genérico de estampa
Resend: domínio verificado e situação
Teste de envio de e-mail
Automações e regras
Prazo de vencimento padrão do boleto
Teto de ajuste de quantidade (hoje fixo em 50%)
Incremento do catálogo (hoje fixo em 5)
Limite de envios de arte por hora (hoje fixo em 10)
Ligar / desligar cada um dos 14 e-mails
Alerta de pedido parado: em quantos dias fica crítico

Motivo: esses valores estão embutidos no código. Mudar exige alterar arquivo e publicar de novo.

Nota desta conversa: o "teto de ajuste de quantidade, hoje fixo em 50%" citado acima está sendo removido do fluxo de ajuste de quantidade (ver 3b e 3h) — o dono passou a poder ajustar livremente até o lançamento de "Impressão". Revisar se este item continua fazendo sentido como configuração futura ou se deve ser removido desta lista.

Segurança
Ver sessões ativas e encerrar remotamente
Histórico de acessos por usuário
Exportar dados (LGPD)
Implicação técnica

Nova tabela configuracoes, com uma linha por chave, lida pelo servidor. Alterações registradas em log de auditoria.

Atenção: os limites hoje validados no banco (teto de 50%, anti-flood de envios) precisariam ler a configuração em vez de usar valor fixo — ou manter o valor fixo como teto absoluto, com a configuração podendo apenas restringir.

Aba Relatórios (a construir)

Nova aba no painel do dono, com filtro por período de datas e exportação.

Relatórios previstos:

Relatório	Conteúdo
Faturamento	Total por período, com comparação e evolução mensal
Pedidos	Lista completa com cliente, valor, metragem, situação
Por cliente	Ranking, ticket médio, metragem, frequência
Metragem produzida	Total por período, por cliente e por arte
Retrabalho	Reimpressões, motivo e responsável pelo custo
Ajustes de quantidade	Reduções e aumentos, com motivo e autor
Cancelamentos	Pedidos cancelados, motivo e valor perdido
Artes mais pedidas	Ranking por metragem e por frequência

Requisitos:

Filtro por intervalo de datas, com atalhos (mês atual, mês anterior, últimos 30/90 dias, ano)
Filtro adicional por cliente
Exportação em CSV e PDF
Exclusivo do dono — funcionário não acessa
Pedidos cancelados excluídos dos totais de faturamento

Atenção na implementação: os valores não podem sair do banco quando quem consulta é funcionário, seguindo a mesma regra já aplicada nas outras telas.

Relacionado à seção 3l: considerar incluir um relatório de contas a receber / limite de crédito por cliente, exclusivo do Admin Financeiro, quando esse papel for implementado.

Pendências
 Domínio para envio dos e-mails via Resend
 Desligar o envio automático de NF no painel do Bling
 Gerar credenciais OAuth na área de aplicativos do Bling
 Abrir a Bling Conta e habilitar emissão de boletos
 Definir prazo de vencimento padrão do boleto
 Criar o produto genérico de estampa no Bling e anotar o ID
 Liberar no Bling a permissão de valor unitário abaixo da tabela
 Localizar a origem do erro "Máximo de X un... 50% acima do pedido" que ainda aparece ao ajustar quantidade, mesmo após a remoção do teto em painel-acoes.tsx e na função ajustar_quantidade_item. Suspeitas: trigger adicional em pedido_itens, função recalcular_total_pedido(), versão duplicada/antiga de ajustar_quantidade_item, ou a Server Action ajustarItem em app/actions/producao.ts chamando outra função — verificação em andamento
 Definir gateway de pagamento para cartão de crédito/débito (fora do Bling)
 Criar papel de acesso "Admin Financeiro" e suas permissões
 Responder as perguntas em aberto da seção 3l (limite de crédito, forma de pagamento, bloqueio de boleto parcelado)