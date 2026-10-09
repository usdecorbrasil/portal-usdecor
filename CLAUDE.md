# Portal Best Color Tecidos — Contexto do Projeto

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
- **O cliente não escolhe forma de pagamento** (decidido pelo dono em 07/10/2026). O
  carrinho só tem artes, quantidades e notas; o pedido nasce com `forma_pagamento` e
  `parcelas_solicitadas` nulos. Quem decide é **admin/financeiro, no botão Faturar**
  (pedido individual ou agrupador), com o valor real em mãos: boleto à vista, boleto
  parcelado (nº de parcelas e 1º vencimento), Pix, cartão de crédito ou débito. A RPC
  `admin_definir_forma_pagamento_faturamento` valida forma ativa, permitida ao cliente,
  teto e mínimo de parcelas pelo valor real e limite de crédito, grava e registra em
  `pedido_forma_pagamento_historico` ("Definida no faturamento"). O Faturar abre um
  resumo de confirmação antes de gravar qualquer coisa. Pedidos antigos, que já tinham
  forma, chegam com ela pré-selecionada e podem trocar.
- **Limite de crédito**: conferido **no Faturar**, quando a forma é escolhida (antes era
  na criação). Boleto que passa do limite, ou parcelado sem crédito, é recusado pela
  RPC (`hint = 'limite_credito'`); o pedido fica marcado `bloqueado_credito` para o
  dashboard e a equipe recebe o aviso. Saídas: liberar com motivo no próprio bloco
  Faturar (`admin_liberar_bloqueio_credito`, que deixou de exigir pedido já marcado) ou
  escolher outra forma. Pix e cartão não passam por limite.
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
| 4 | Estampa pronta (chave `pronto`) | Manual — painel |
| 5 | Faturado | Botão Faturar (Bling + cobrança + NF) |
| 6 | Nota fiscal emitida | Faturar |
| 7 | Expedido | Bling |
| 8 | Entregue | Bling |
| 9 | Pedido fechado | Painel (Fechar pedido), sem depender da baixa |

**Corte/costura não existe mais** (08/10/2026): `validar_status_pedido` recusa
qualquer lançamento da etapa; o valor fica no enum só pelo histórico. Os pedidos
que estavam nela foram movidos para Estampa pronta pela migration
`20261008120000`. `admin_ajustar_metragem` só aceita Estampando.

**Faturar faz tudo** (pedido no Bling, cobrança, etapa, nota). O card
"Documentos do faturamento" na tela do pedido é só leitura; nota ou cobrança
pendentes se concluem pelo botão "Concluir faturamento" no bloco Pedido faturado,
que chama `faturarPedido` de novo (retomável).

Importante:
- O pedido **não** precisa passar por todas as etapas (ex.: sem costura pula direto de
  Estampando para Pedido pronto; retirada em balcão pula Expedido).
- **Implicação técnica**: a coluna `status` em `pedidos` é **derivada** do último
  registro em `pedido_status_historico`, não é mais um campo independente atualizado à
  mão.
- Admin escolhe a próxima etapa entre as ainda não lançadas e pode desfazer o último
  lançamento manual.
- **Arrastar e soltar em `/admin/pedidos`**: arrasta-se a própria linha do pedido (o
  punho à esquerda foi removido a pedido do dono). No mouse o arraste só começa depois
  de andar 6px, para o clique continuar abrindo o pedido; no toque exige segurar 350ms
  parado (tolerância de 10px), para não brigar com a rolagem. Os ouvintes de mouse são
  presos no próprio `pointerdown`, não num efeito — num efeito, os primeiros movimentos
  se perdiam esperando o React renderizar. No toque são eventos nativos não-passivos
  (`preventDefault` no `touchmove`), com `contextmenu` bloqueado e
  `-webkit-touch-callout: none` na linha, senão o menu de contexto do Android e a prévia
  de link do iOS cancelam o gesto. Rolagem automática perto das bordas. Destinos vêm de
  `destinosPermitidos()` em `src/app/admin/pedidos/estagios.ts` e espelham a regra do
  painel do pedido: uma etapa por vez, exceto saindo de Estampando, onde a costura pode
  ser pulada. Tentar arrastar uma linha que não se move (aguardando confirmação, ou já
  em etapa do Bling) mostra o motivo (`motivoSemDestino()`) em vez de ignorar.
- A listagem é densa, em linhas com cabeçalho de colunas por etapa. A coluna
  **"Parado há"** conta dias desde o **último lançamento de status**, não desde a
  criação do pedido — a data de criação está na coluna "Entrou", visível também no
  celular (pedido do dono em 08/10/2026).
- Toda mudança por arraste **pede confirmação antes de gravar**, e quando a etapa exige
  dados eles são preenchidos no próprio pop-up: Estampando abre o acerto de metragem e
  quantidades (gera o romaneio), Impressão abre a conferência de quantidade para o dono.
  Os modais são os mesmos das duas telas — `src/app/admin/pedidos/modais-status.tsx`.

## E-mails automáticos

Disparo ao cliente em 4 momentos: Pedido recebido, Impressão, Pedido pronto (cobrança +
boleto + resumo), Nota fiscal emitida (+ PDF da NF).

Outros disparos (ver `project-decisoes_consolidadas.txt` para a lista completa de 14
gatilhos, incluindo avisos internos à equipe, cancelamentos, envio de artes rejeitado,
primeiro acesso, recuperação de senha).

`email_log` tem chave única por pedido + tipo → evita disparo duplicado (idempotência).

**Remetente e resposta são coisas separadas.** `RESEND_FROM` precisa ser de um domínio
verificado no Resend (`@bestcolortecidos.com.br`) — o provedor recusa enviar como
`@gmail.com`, e o e-mail falharia em SPF/DKIM de qualquer jeito. Para a resposta do
cliente cair numa caixa que alguém lê, existe `RESEND_REPLY_TO`, aplicado como
`replyTo` em `src/lib/resend/enviar.ts`; aí sim pode ser Gmail.

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

## Busca e navegação

- **Busca geral** (pedidos + clientes + artes) vive **atrás de uma lupa** no cabeçalho,
  tanto no painel quanto na área do cliente. Abre em sobreposição, `Esc` fecha.
- **Busca da página**: campo ao lado do título de cada tela, que filtra a própria página
  na hora, sem recarregar e sem tirar o usuário de onde ele está. Componente genérico
  `src/components/busca-pagina.tsx`; a página só marca o conteúdo com atributos:
  `data-busca` (item), `data-busca-grupo` (bloco que some quando vazio),
  `data-busca-contagem` (contador do grupo) e `data-busca-vazio` (aviso de nada
  encontrado). Convive com os filtros de URL da tela (cliente, período, etapa):
  o servidor filtra primeiro, a busca da página filtra por cima.
  Cuidados que já deram problema: o `MutationObserver` que reaplica o filtro após
  `router.refresh()` só pode escrever no DOM o que mudou (reescrever o mesmo
  `textContent` conta como mutação e vira laço infinito, travando a aba), e a contagem
  de resultados fica **dentro** da caixa do campo — posicionada abaixo dele, no celular
  caía em cima da linha seguinte.

## Carregamento entre páginas

Cada área tem um `loading.tsx` (`app/loading.tsx`, `app/admin/`, `app/(cliente)/`) que
renderiza `src/components/carregando.tsx`: logo pulsando, barra indeterminada e a
palavra "carregando". O Next troca só o miolo — cabeçalho e navegação continuam na
tela, então dá para clicar em outra aba sem esperar. As animações (`respira`,
`desliza`) estão em `globals.css`, com `prefers-reduced-motion` desligando ambas.

Além disso, as abas mostram um pontinho no link clicado enquanto a navegação está
pendente (`src/components/link-carregando.tsx`, via `useLinkStatus` do Next) — resposta
imediata ao clique, antes mesmo de o `loading.tsx` entrar. Por causa disso as abas do
painel viraram client component (`src/app/admin/abas.tsx`).

## Padrão visual das listas

Decidido em 12/09/2026: as telas de lista deixaram de ser cartões espaçados e
coloridos e passaram a ser **listas densas com cabeçalho de colunas**, com cara de
sistema de gestão. A cor do estágio continua, mas como sinal (tarja lateral de 1px,
etiqueta curta), não como fundo de bloco.

O vocabulário está em `src/components/estilo-lista.ts` (`CAIXA`, `CABECALHO`, `CORPO`,
`LINHA`, `NUM`, `NOME`, `ETIQUETA`, `TITULO_GRUPO`, `VAZIO`) — strings de classe, não
componentes, porque cada tela tem colunas próprias; o que precisa ser igual é moldura,
densidade e tipografia. Já aplicado em Pedidos, Fila de impressão, Clientes,
Financeiro/Boletos, Arquivados, Catálogos e "Meus pedidos" do cliente. Nas grades de
arte (catálogo), densidade veio de cartão menor e mais colunas, não de virar linha —
ali a imagem é o conteúdo.

## Catálogo paginado

- Catálogo do cliente e detalhe do catálogo no admin mostram no máximo **24 artes por
  página** (`POR_PAGINA` em `lista-catalogo.tsx` / `lista-artes.tsx`), com o paginador
  de `src/components/paginacao.tsx`.
- **A busca varre o catálogo inteiro, não a página aberta.** Para isso `BuscaPagina`
  tem um modo controlado: com `ProvedorBusca` (`src/components/busca-contexto.tsx`) em
  volta, ela só publica o texto e recebe de volta a contagem; quem filtra é a lista.
  Sem provedor, segue filtrando o DOM por atributos como nas demais telas.
- A página corrente fica guardada junto do termo que a produziu, então busca nova
  recomeça da primeira página sem efeito nem setState em cascata.

## Painel do Dono — extras

- **Aba Produção**: gestão operacional dos status.
- **Aba Relatórios** (a construir): Faturamento, Pedidos, Por cliente, Metragem
  produzida, Retrabalho, Ajustes de quantidade, Cancelamentos, Artes mais pedidas.
  Filtro por período (com atalhos) e por cliente, exportação CSV/PDF, exclusivo do Dono.
  Pedidos cancelados ficam fora dos totais de faturamento.
- **Configurações** (a construir): tabela `configuracoes` (uma linha por chave), lida
  pelo servidor, alterações logadas em auditoria. Segurança: sessões ativas, histórico
  de acessos, exportação de dados (LGPD).

## Integração com o Bling — o que já existe

- **Cliente do portal espelha no Bling** (`src/lib/bling/contato.ts`), no cadastro **e
  em toda edição**. O portal guarda os campos fiscais necessários para nota fiscal
  (`inscricao_estadual`, `indicador_ie`, endereço completo — `docs/sql/005`), então ele é
  a fonte desses dados.
  - Atualização faz **GET, mescla e PUT**: o PUT do Bling substitui o contato inteiro, e
    o ERP tem campos que o portal não conhece (vendedor, código, extras). Sem mesclar,
    eles se perderiam. O bloco `endereco` é mesclado à parte, senão o endereço de
    cobrança sumiria.
  - Endereço só é enviado quando há CEP **e** logradouro: mandar bloco vazio apagaria
    endereço existente.
  - `indicador_ie` 1 = contribuinte, 2 = isento, 9 = não contribuinte (padrão). Sem ele
    o Bling recusa pessoa jurídica.
  - Os 4 clientes reais tiveram os dados fiscais **importados do Bling em 12/09/2026**
    (IE, indicador, endereço completo) e já estão vinculados por `bling_contato_id`.
    Foi uma importação pontual, feita por script; não existe tela para isso.
- **Limite de crédito não é alterável por fora.** Há trava no banco exigindo
  `atualizar_limite_credito()`, e a função identifica quem chama pela sessão — chave de
  serviço não passa. Só pelo portal, logado como admin/financeiro, e com motivo, que vai
  para `cliente_limite_historico`. Confirmado em 13/09/2026: a alteração pelo portal
  funciona.
- **Pedido de venda criado ao lançar "Pedido pronto"** (`src/lib/bling/pedido.ts`), não
  na confirmação: o valor é metragem × preço/metro e a metragem só existe depois da
  estampa. Vai com **uma linha de metragem** (produto genérico `ESTAMPA`, unidade `m`),
  não uma por arte — no portal a quantidade de peças serve à produção, não ao preço, e
  somar peças não fecharia com o total nem com os boletos. A taxa da forma de pagamento
  entra em `outrasDespesas`.
- Configuração em `configuracoes.bling` (JSON): `produtoEstampaCodigo`,
  `formaPagamentoId` (11079000 = "Boleto - Bling Conta") e `formaPagamentoPixId`
  (11079001 = "Pix - Bling Conta"). **É a forma de pagamento da parcela que faz o Bling
  gerar boleto ou Pix.**
- **Os links de pagamento não ficam no pedido de venda.** Nascem nas contas a receber
  que o Bling cria a partir dele, em `linkQRCodePix` e `linkBoleto`
  (`src/lib/bling/cobranca.ts`). A busca é por contato e casa parcela por
  **vencimento + valor**, porque o vínculo com o pedido não é exposto de forma
  confiável — a conta que inspecionei tinha `origem` zerado.
- **Boleto à vista com vencimento escolhido** (08/10/2026): no Faturar o campo
  "Vencimento" vem com o padrão de 4 dias úteis e pode ser alterado até **30 dias
  corridos** (`PRAZO_MAXIMO_BOLETO_AVISTA_DIAS` em `config.ts`, espelhado na RPC
  `admin_definir_forma_pagamento_faturamento`, migration `20261008180000`). A RPC grava
  `pedidos.vencimento_avista`, que `criarPedidoNoBling` e a cobrança já usavam.
- **Teto de parcelas é 4** (decidido em 13/09/2026), em três lugares que precisam
  concordar: `MAX_PARCELAS` em `src/lib/pagamento/config.ts`, os schemas zod das
  actions, e o CHECK `pedidos_parcelas_solicitadas_check` no banco. Já houve
  descompasso: o CHECK estava em 3 enquanto a tela oferecia mais, e o pedido seria
  recusado só na hora de gravar.
- `pedidos.forma_pagamento` é `text` com CHECK (`pedidos_forma_pagamento_check`), não
  enum — valor novo exige recriar a restrição (`docs/sql/006`).
- **A API limita 3 requisições por segundo** — daí as pausas entre chamadas.
- Falha de sincronia **nunca** derruba a operação do portal: fica em
  `pedidos.bling_erro` / `bling_sync_status` e aparece na tela do pedido, com botão
  **tentar de novo** (`reenviarPedidoAoBling`) — antes só dava para relançar a etapa de
  produção, mexendo no histórico por causa de falha de integração. No cadastro e na
  edição de cliente, aparece como aviso no próprio formulário.
- Já verificado nesta conta: os SKUs do portal **são** os códigos de produto do Bling
  (`D10409` etc.).

**Validação contra o ERP, em ordem de custo de reverter:**

1. ~~Editar cliente que já existe no Bling~~ — **funcionou em 13/09/2026**: alterar o
   e-mail de um cliente no portal atualizou o contato no Bling. O caminho
   `GET` + mescla + `PUT` está provado.
2. Cadastrar cliente novo (`POST /contatos`) — **não testado**. Será feito depois da
   limpeza dos dados de teste, junto do fluxo completo.
3. Levar um pedido até "Pedido pronto" (`POST /pedidos/vendas`, e-mail de cobrança e
   parcelas com taxa de uma vez) — **não testado**.

Os dois que faltam estão escritos a partir do formato observado em leitura e podem
esbarrar em campo obrigatório não previsto. O erro do Bling aparece na própria tela.

## Integração com o Bling

- API v3, OAuth 2.0. Credenciais na área de aplicativos do painel Bling.
- Pedido confirmado no portal → criado no Bling como pedido de venda.
- Sincronização de volta: Nota fiscal emitida, Expedido, Entregue, baixa financeira
  (gatilho de "Pedido fechado").
- Desligar o envio automático de NF no painel do Bling (o portal controla isso).

## Pendências conhecidas (checar status atual antes de assumir resolvido)

- ~~Registrar e configurar `bestcolortecidos.com.br`~~ — **feito em 12/09/2026**.
  A zona é hospedada no próprio Registro.br (`d.sec.dns.br` / `e.sec.dns.br`, SOA
  `hostmaster.registro.br`), com DNSSEC ativo. Registros criados: `portal` CNAME para o
  alvo específico do projeto na Vercel (`e9f1570091ff32a5.vercel-dns-017.com`, **não** o
  genérico `cname.vercel-dns.com`), mais `send`/`rsend` CNAME e `resend._domainkey` TXT
  do Resend e `_dmarc`.
  - **E-mail validado ponta a ponta em 12/09/2026**: domínio verificado no Resend, envio
    real de `pedidos@bestcolortecidos.com.br` chegou na **caixa de entrada** (não spam),
    e a resposta do cliente voltou para `bestcolortecidos@gmail.com` via `Reply-To`.
    O DMARC está em `p=none` (só monitora) — se um dia cair em spam, é o primeiro lugar
    a apertar.
  - A `RESEND_API_KEY` é restrita a envio: consultas à API de domínios são recusadas com
    `restricted_api_key`. Para ver status de domínio, só pelo painel.
  - **O domínio raiz e o `www` continuam sem registro** — quem digita
    `bestcolortecidos.com.br` não chega a lugar nenhum. O site institucional não está
    nessa zona.
  - **Site institucional a fazer** (anotado em 13/09/2026): não existe nada em
    `bestcolortecidos.com.br`. O portal fica no subdomínio e não muda de lugar; o site
    é projeto separado, e quando existir é ele que ocupa a raiz e o `www`.
- ~~Migrar do `.vercel.app` para o domínio próprio~~ — **feito em 12/09/2026**. O portal
  está em `https://portal.bestcolortecidos.com.br`, com certificado emitido. As
  variáveis na Vercel (`SITE_URL`, `BLING_REDIRECT_URI`, `RESEND_FROM`,
  `RESEND_REPLY_TO`) e a URL de redirecionamento no painel do Bling apontam para o
  endereço novo, e a conexão com o Bling foi testada com HTTP 200 depois da troca.
  O refresh do token **não** usa `redirect_uri` (só `grant_type=refresh_token` com
  Basic auth), então trocar o endereço não invalida o token existente.
- **Portal ficará em `portal.bestcolortecidos.com.br`** (subdomínio, não subpasta).
  Subpasta exigiria proxy reverso no servidor do site institucional, com risco conhecido
  em cookie de sessão, além de `basePath` no Next.
- ~~Conectar o Bling~~ — **feito em 09/09/2026**. OAuth concluído, token gravado em
  `integracao_bling`, teste de conexão retornando HTTP 200. Configurações mostra o
  status e permite testar. Falta tudo o que vem depois do OAuth (ver abaixo).
- **Bling usa dois hosts** — `www.bling.com.br` só para OAuth (authorize/token) e
  `api.bling.com.br` para as chamadas de recurso. Chamar recurso em `www` devolve
  403 FORBIDDEN. Separado em `src/lib/bling/cliente.ts` (`BASE_OAUTH` / `BASE_API`).
- ~~Migração JWT do Bling~~ — **feito em 08/10/2026** (aviso do Bling: tokens opacos
  desligados em 15/10/2026). `CABECALHO_JWT` (`enable-jwt: 1`) vai no POST
  `/oauth/token` no callback e no refresh (`src/lib/bling/cliente.ts`). Configurações
  mostra "Formato do token: JWT / opaco"; o opaco vira JWT na próxima renovação ou ao
  reconectar. Nas chamadas de recurso o cabeçalho não é enviado: token JWT funciona
  sem ele, e token opaco com ele devolve 401.
- Abrir Bling Conta / habilitar boletos.
- Definir prazo padrão de vencimento do boleto.
- Criar produto genérico de estampa no Bling.
- Definir gateway de pagamento para cartão de crédito/débito.
- **Limpeza dos anexos de envio de arte não existe.** O campo
  `envios_arte.arquivos_expiram_em` já é preenchido com hoje + 25 dias ao marcar como
  cadastrado, mas nada apaga os arquivos do bucket `envios-arte` depois disso. Falta uma
  rotina agendada (Vercel Cron → rota protegida por segredo, diária). Sem ela o
  armazenamento cresce indefinidamente.
- **Integração com o Bling existe só no OAuth** (`/api/bling/conectar` e `/callback`).
  Não cria pedido de venda, nem sincroniza NF, expedição, entrega ou baixa financeira.
  Consequência: o pedido não passa de "Pedido pronto" — `admin_lancar_status` só aceita
  impressao/estampando/corte_costura/pronto, e o único caminho para "fechado" é dar baixa
  em todas as parcelas.
- **E-mails: 4 dos 14 gatilhos** implementados (`convite_acesso`, `pedido_recebido`,
  `em_producao`, `pedido_pronto`). Falta NF emitida, cancelamentos, ajuste de
  quantidade, artes rejeitadas, recuperação de senha e todos os avisos internos à
  equipe.
  - `pedido_pronto` é a **cobrança**, disparada em `lancarStatus` quando a etapa
    "Pedido pronto" é lançada. Traz metragem, mercadoria, taxa da forma de pagamento,
    total e as parcelas com vencimento. Falhar no e-mail **não** derruba o lançamento da
    etapa — produção não pode travar porque a mensagem não saiu, e `email_log` garante
    que o reenvio não duplica.
  - Enquanto os boletos não são emitidos pelo Bling, a linha digitável vem nula e o
    e-mail avisa que os boletos chegam em seguida, em vez de mostrar espaço vazio.
- Pedidos estampados antes da migração de custos não têm custo gravado e aparecem na
  Apuração com lucro igual à receita inteira.
- **Limpar os dados de teste do banco** (anotado em 12/09/2026). Situação em 12/09:
  9 clientes, dos quais **5 são de teste** — "Cliente Top", "Cliente Numero Dois",
  "Cliente Tres", "cliente quatri", "cliente estampa", criados entre 14 e 24/08. Os de
  26/08 (ROSA D'COR, Mirela Tramare, Ju Decor, Influence) são reais e existem no Bling.
  Volume total: 19 pedidos, 41 itens, 17 parcelas, 63 lançamentos de status, 20 linhas
  de `email_log`, 412 produtos, 6 catálogos, 12 profiles.
  - **Não é um `delete` simples.** Apagar cliente atinge `profiles` **e o usuário em
    `auth.users`** (que o cascade do banco não alcança — tem que ir pela Admin API),
    além de `catalogos`, `produtos`, `envios_arte` e todos os pedidos com seus itens,
    parcelas, histórico e `email_log`.
  - **Fazer isso antes de a integração começar a escrever no Bling.** Hoje nenhum
    pedido tem `bling_pedido_id` e nenhum cliente tem `bling_contato_id`, então apagar
    não deixa órfão no ERP. Depois do primeiro pedido sincronizado, cada exclusão no
    portal passa a exigir decidir o que fazer com o correspondente no Bling.
  - Conferir também se algum produto/catálogo pertence só a cliente de teste antes de
    apagar — 412 produtos é catálogo real de cliente real na maior parte.
- ~~Aviso interno de pedido novo~~ — **feito em 13/09/2026**. Configurações → Notificações
  ("Avisos para a equipe"): lista de e-mails por tipo, em `configuracoes.notificacoes`
  (JSON, `docs/sql/014` cria a linha já com `bestcolortecidos@gmail.com`). Tipos hoje:
  `pedido_novo` (dispara em `criarPedido`, depois de o pedido existir),
  `pedido_cancelado` (em `clienteCancelar` — cliente cancela pedido ainda aguardando
  confirmação; não exige resposta) e `cancelamento_solicitado` (em
  `solicitarCancelamento` — pedido já confirmado; exige resposta). São dois eventos
  distintos no banco (`cliente_cancelar_pedido` × `cliente_solicitar_cancelamento`), por
  isso dois avisos. Regras em
  `src/lib/notificacoes/config.ts` (puro) e envio em `src/lib/notificacoes/enviar.ts`.
  - **Um e-mail só, com todos os destinatários no "para"**: assim `email_log` fica com uma
    linha por pedido + tipo e a trava de duplicidade continua valendo. `enviarEmail`
    passou a aceitar lista em `destinatario`.
  - **Nunca derruba a operação.** Falha de aviso vai para o log do servidor.
  - Quem não está na lista não recebe — inclusive o administrador. Tipo novo = adicionar
    em `TIPOS`/`ROTULOS` e chamar `notificarEquipe` no ponto certo; a tela se ajusta.
- **Setup de automação / editor de etapas (a construir)** — decidido em 12/09/2026:
  área dentro de Configurações para **incluir, excluir e editar os status/estágios** do
  pedido. Hoje as etapas são constantes espalhadas pelo código
  (`src/app/admin/pedidos/estagios.ts`, `ETAPAS_MANUAIS` em `app/actions/producao.ts` e
  o enum aceito pela RPC `admin_lancar_status`); tornar isso configurável exige mover as
  etapas para o banco e ajustar essas três pontas juntas.

## Painel de crédito (08/10/2026)

Financeiro → **Crédito** (`src/app/admin/financeiro/credito`; **card próprio** abaixo dos
cards de abas, não uma aba — pedido do dono em 08/10/2026; as abas vivem no grupo de rota
`financeiro/(abas)`). Desde 08/10/2026 as abas ficam em dois cards (`financeiro/abas.tsx`):
**Contas** — A receber (o antigo Boletos, rota `a-receber`; `/admin/financeiro/boletos`
redireciona) e A pagar — e **Custos e resultados** — Custos, Apuração, Relatórios. O card
da aba aberta mostra o conteúdo; o outro fica só com as abas. Painel de crédito: por cliente, limite,
crédito em uso (`credito_em_uso`), histórico de boletos (parcelas + boleto à vista de
`pedidos`), **score 0–100** e sugestão de limite, com CSV. A regra é pura em
`src/lib/credito/score.ts` (pontualidade de −50 a +50 — pago com atraso ou vencido
**desconta**, decidido em 08/10/2026 — + volume 30 + frequência 20 − 10 por vencido
aberto, score preso entre 0 e 100); os pesos estão em `decisoes-atualizadas.md`. A sugestão nunca grava sozinha: o
botão "Aplicar sugestão" só pré-preenche o ajuste, que segue pela
`atualizarLimiteCredito` com motivo. Mudanças de limite são lidas de `auditoria`
(campo "Limite de crédito"). Sem migration. A ficha lista os boletos em três blocos —
em aberto (vencidos primeiro), **a emitir** (pedidos em boleto sem parcela nem cobrança
gerada, `carregarPrevistos`, espelho da 2ª metade de `credito_em_uso`) e pagos — para o
"em boletos hoje" fechar com o que está listado.

## Despesas por nota e estoque de suprimentos (08/10/2026)

Pedido do dono: fotografar ou anexar a nota de compra, a IA lê e pré-preenche, a equipe
confere e salva; controle de gastos por categoria e estoque de suprimentos (tinta, papel)
com consumo manual ou automático por metro estampado. Migration `20261008150000`.

- **Onde**: Estoque ganhou divisões — Tecido dos clientes (o que existia), **Suprimentos**
  (`/admin/estoque/suprimentos`, equipe inteira; custo só para quem vê valores) e
  **Despesas e notas** (`/admin/estoque/despesas`, só admin/financeiro).
- **Leitura por IA** em `src/lib/despesas/ler-documento.ts` (`messages.parse` com saída
  estruturada por zod): dois modelos — **rápido** = `claude-haiku-5-5`, padrão, esforço
  baixo, ~R$ 0,01 por página (o dono pediu a opção mais barata em 08/10/2026; as
  alternativas de outros fornecedores ficam na mesma fração de centavo); **preciso** =
  `claude-opus-5-5`, esforço alto, ~R$ 0,40, acionado pelo botão "Reler com o modelo
  preciso" sobre o mesmo arquivo já guardado (`relerDespesa`). O modelo usado fica em
  `despesas.modelo_ia` para comparar a taxa de acerto. A instrução fixa (em cache) é
  longa de propósito: emitente × destinatário, vírgula decimal, desconto/frete em linha
  própria, nº × COO, impostos inclusos × destacados, regras de categoria para
  suprimentos de sublimação. Exige `ANTHROPIC_API_KEY`; sem ela a tela só aceita à mão.
  `src/lib/despesas/validar.ts` confere dígito verificador de CNPJ/CPF e da chave de
  acesso antes de gravar. **A IA nunca grava**: `lerDespesa` guarda o arquivo no bucket
  `despesas` e devolve um rascunho; a tela de conferência (`despesas/nova/captura.tsx`)
  é a mesma com ou sem IA, campo com confiança < 0,7 fica amarelo, e `salvarDespesa`
  grava documento + itens.
- **Câmera com moldura** (`despesas/nova/camera-nota.tsx`): "Tirar foto" abre a câmera
  traseira dentro do portal (`getUserMedia`, tela cheia) com moldura Nota (A4) ou Cupom,
  fora dela escurecido, lanterna quando o aparelho deixa, e prévia "tirar outra / usar
  esta foto". A foto sai recortada na moldura (+4% de margem), convertendo a moldura da
  tela para pixels do vídeo em `object-cover`. Sem permissão ou suporte, botão "usar a
  câmera do celular" cai no input de arquivo de antes.
- **Compressão no aparelho**: a foto é reduzida no navegador (lado maior 1600 px,
  JPEG 82%, `createImageBitmap` com orientação do EXIF) antes de subir. O original não
  sobe. `next.config.ts` tem `serverActions.bodySizeLimit: 12mb` por isso.
- **Tabelas**: `categorias_despesa` (semeadas: Tinta, Papel sublimático…), `despesas`
  (chave de acesso única entre as não excluídas; exclusão lógica com motivo pela RPC
  `admin_excluir_despesa`), `despesa_itens` (categoria + `suprimento_id` opcional),
  `suprimentos` (unidade, mínimo, `consumo_por_metro`), `suprimento_movimentos`
  (entrada | consumo | ajuste) e a view `suprimento_saldos`.
- **Item sem suprimento na conferência** (08/10/2026): o seletor "Entra no estoque como"
  vincula a um suprimento existente ou abre "+ cadastrar novo suprimento…", um cadastro
  rápido no próprio item (nome da descrição, unidade da nota traduzida — LT→L, RL→rolo,
  MTS→m —, categoria, consumo por metro) que chama `criarSuprimento` e já vincula. Item de
  categoria de estoque (tinta, papel, embalagem) sem vínculo fica amarelo com o aviso, e
  unidade da nota diferente da do suprimento avisa que a QTD entra na unidade do estoque.
- **Sugestão de vínculo** (`src/lib/suprimentos/sugerir-vinculo.ts`, puro): para item sem
  suprimento, procura primeiro no histórico de notas salvas (mesmo código do mesmo
  fornecedor, ou mesma descrição — aprende a cada nota) e depois pelo nome do suprimento
  dentro da descrição, com sinônimos de nota (SUBLIM, LT, MTS, GR…) e números pesando em
  dobro (1 L × 5 L). Certeza alta vincula sozinho com o aviso verde "vinculado sozinho…
  confira"; média mostra "Parece ser X · vincular · não é este". Empate entre dois
  candidatos não sugere. O cadastro rápido avisa "já existe parecido" antes de duplicar.
- **Item de nota com suprimento vira entrada no estoque** (gatilho
  `despesa_item_entrada_suprimento`, com o custo). Excluir a nota lança o ajuste inverso.
- **Custos pelas compras** (08/10/2026): Financeiro → Custos mostra a média
  ponderada das entradas de suprimento com custo (notas) nos últimos 30/60/90 dias
  (`src/lib/custos/sugestao.ts`, puro; leitura em `src/lib/custos/compras.ts`).
  Papel = suprimento de categoria "papel" em **metros**: só o custo médio do metro
  comprado, sem fator de consumo (decisão do dono em 08/10/2026). Tinta = categoria "tinta" em
  **L ou mL**: R$/L médio; o coeficiente (mL/m) é a **soma** do `consumo_por_metro` de
  cada tinta (uma por cor), e sem cadastro fica o valor atual. Calandra nunca muda.
  "Usar estes valores" só preenche o formulário. O modo automático
  (`configuracoes.custos_automaticos` = `{ativo, janelaDias}`, desligado por padrão) faz
  `salvarDespesa` chamar `atualizar_custos_producao` quando a nota tem item ligado a
  suprimento. Custo continua congelado por pedido no romaneio: apuração passada não muda.
- **Consumo automático**: `pedidos_sincronizar_consumo_suprimentos`, espelho do consumo
  de tecido — para cada suprimento com `consumo_por_metro`, mantém o consumo do pedido
  igual a `metragem_impressa × fator`; roda no mesmo UPDATE do romaneio e do ajuste de
  metragem. Suprimento sem fator é só manual (`registrar_movimento_suprimento`, equipe).
- Não existe XML/SEFAZ nem QR code de NFC-e ainda (está na especificação do dono como
  caminho preferencial); hoje é só imagem/PDF + IA ou digitação.

## Contas a pagar (08/10/2026, migration `20261008190000`)

Financeiro → **A pagar** (`src/app/admin/financeiro/(abas)/a-pagar`), só admin/financeiro.

- **Toda nota exige a condição de pagamento** na conferência (`despesas.condicao_pagamento`):
  `pago` (dinheiro/Pix/transferência), `debito`, `credito`, `boleto`, `a_pagar`. Regras puras
  em `src/lib/contas-pagar/condicoes.ts` (`gerarParcelas` divide o total mês a mês com os
  centavos na 1ª; `validarParcelas` espelha `contas_pagar_validar_parcelas` no banco).
- A IA lê `condicao_pagamento` e as **duplicatas** da DANFE ("Fatura/Duplicatas"), que
  viram as parcelas já preenchidas. Sem duplicatas, 1 parcela com vencimento padrão
  (crédito: +1 mês; demais: +30 dias).
- `salvarDespesa`: grava a nota → `admin_gerar_contas_despesa` → itens. As contas vêm
  **antes dos itens** de propósito: se falharem, a nota é apagada sem ter gerado entrada de
  estoque. Pago e débito entram já quitados na emissão; os demais, uma linha por parcela,
  com soma igual ao total (tolerância de 1 centavo).
- **Conta a pagar só nasce de nota ou recibo** (decisão do dono, 08/10/2026, migration
  `20261008200000`): `admin_criar_conta_pagar` (conta avulsa) foi removida. A nota **pode**
  ir sem foto/PDF ("Não tenho a nota agora — lançar sem arquivo"), mas a conferência mostra
  o aviso com "Anexar agora" (guarda o arquivo sem mexer nos campos) e salvar abre o
  pop-up "Salvar a nota sem foto ou PDF?". A conta aparece com a etiqueta
  "sem comprovante" em A pagar (e no CSV). O atalho do dashboard e o botão da aba A pagar
  levam a Nova nota.
- **Comprovante depois**: na conta a pagar, "📎 Anexar comprovante" (`anexarComprovanteDespesa`
  → RPC `admin_anexar_arquivo_despesa`, que só preenche nota **sem** arquivo e não
  excluída; se a RPC recusa, o arquivo sai do bucket). Nota sem arquivo há mais de
  `PRAZO_COMPROVANTE_DIAS` (2) desde o lançamento gera **aviso vermelho no dashboard**
  (admin/financeiro) com quantidade e valor, que abre A pagar filtrada em
  `?comprovante=pendente`. Só conta notas com `condicao_pagamento` (as anteriores ao
  contas a pagar ficam de fora). Compressão da foto em `src/lib/despesas/comprimir.ts`.
- **Avisos do dashboard padronizados** (08/10/2026): `src/app/admin/dashboard/avisos.tsx`
  recebe uma lista `{nivel: urgente|atencao|info, titulo, detalhe, href}` e mostra todos
  no mesmo formato — linha compacta, tarja lateral na cor do nível, duas colunas no
  computador, ordenados por urgência. Urgente: pedido travado por atraso, nota sem
  comprovante, conta a pagar vencida, solicitação de cancelamento. Atenção: bloqueado por
  crédito. Info: aguardando confirmação. Aviso novo = mais um `avisos.push` na página. O
  atalho "Lançar nota" fica na linha do título.
- **E-mail diário de pendências** (migration `20261008210000`): `/api/cron/avisos-diarios`,
  chamada às 07:47 (Brasília) por `.github/workflows/avisos-diarios.yml` com os mesmos
  secrets da baixa de pagamentos. Manda, só quando há pendência, um resumo (notas sem
  comprovante há mais de 2 dias + contas vencidas) para o tipo `contas_pagar_pendencias`
  de Configurações → Notificações, que a migration semeia com a lista de `pedido_novo`.
  Um envio por dia: a data fica em `configuracoes.avisos_diarios` (`?forcar=1` ignora).
- Tabela `contas_pagar` (uma linha por parcela; `despesa_id` nulo só nas avulsas criadas
  antes da regra). Escrita só por RPC: `admin_baixar_conta_pagar` (data ≤ hoje, valor pago pode diferir — juros/desconto),
  `admin_estornar_conta_pagar`, `admin_cancelar_conta_pagar`, `admin_alterar_conta_pagar`
  (vencimento/valor); as três últimas exigem motivo ≥ 10 e anotam em `observacao`. Tudo
  também vai para `auditoria` (entidade `conta_pagar`).
- Excluir a nota (`admin_excluir_despesa`) cancela as parcelas em aberto pelo gatilho
  `trg_despesas_cancelar_contas`; as pagas ficam.
- A tela: quadros (vencidas, próximos 7 dias, até o fim do mês, pago no mês), filtro por
  situação e período, grupos Vencidas / 7 dias / Depois e CSV.

## Ajuste de metragem (13/09/2026, `docs/sql/016`)

Em **Estampando** e **Corte/costura** o botão "Ajustar quantidades" dá lugar a
**Ajustar metragem**: com o romaneio lançado, peça não muda mais nada — o valor é
metragem × preço, e o que pode mudar é a metragem (quebra na estamparia). A RPC
`admin_ajustar_metragem` repete o cálculo de `confirmar_romaneio` (total, custos por
metro, `regenerar_parcelas_pedido`) e grava em `pedido_metragem_historico`, que aparece
em Alterações no pedido. Portão `is_admin_producao()`, o mesmo do romaneio: quem sabe da
quebra é a produção. Antes de Estampando continua sendo quantidade; de Pronto em diante,
nada.

## "Pedido pronto": o que acontece e o que trava (13/09/2026)

- **Boleto abaixo do mínimo por documento bloqueia** a etapa — no servidor
  (`lancarStatus` → `boletoAbaixoDoMinimo`) e no modal, que desativa o botão. Compara a
  **menor parcela** (parcelado) ou o valor cobrado inteiro (à vista) com
  `valorMinimoParcela` do boleto. Antes comparava o total do pedido, e por isso o 1006
  (3 × R$ 127,50, total R$ 375) passou sem aviso. A saída é trocar forma ou parcelas
  em "Forma de pagamento" e voltar.
- **Bling e cobrança rodam em `after()`**, depois de a resposta sair, e as duas telas
  de pedidos têm `maxDuration = 60`. Esperar dentro da requisição estourava o tempo da
  função: o 1006 ficou `pendente` sem nunca ser enviado e sem e-mail de cobrança. A
  cobrança mora em `src/lib/cobranca/enviar.ts` (chave de serviço: em `after()` não há
  cookies) — não em `actions/producao.ts`, porque exportar de um `'use server'` viraria
  endpoint público.
- **Primeiro vencimento do boleto = hoje + intervalo configurado.** Estava fixo em 30
  dias no painel (`dataPadrao(30)`), e a configuração de 15 dias só valia entre o 1º e o
  2º boleto — o 1006 saiu com 30/15/15. O intervalo entre parcelas continua vindo de
  `parcelar_pedido` no banco; o painel só sugere o primeiro, e quem confirma pode mudar.
- **`bling_sync` é `pendente | enviado | erro`** — não existe `ok`. O código gravava
  `'ok'`, o Postgres recusava (22P02) e, como o erro do update não era lido, o pedido
  ficava sem vínculo mesmo com a venda criada no Bling. Foi a causa real dos
  "pendentes" de 13/09, não o tempo da função. Lição de método: testar o enum com um
  `PATCH` em id inexistente devolve 204 — o cast só acontece quando há linha; ler o
  `enum` no OpenAPI do PostgREST é o jeito confiável.
- **"Pendente" depois de pronto é falha**: a tela do pedido mostra o bloco de reenvio
  sempre que `bling_sync_status !== 'ok'` a partir de "pronto", em amarelo quando não há
  erro registrado. "Tentar de novo" reenvia ao Bling **e** a cobrança (`email_log`
  impede duplicar).

## Faturamento pelo portal: NF-e e cobrança (13/09/2026, `docs/sql/015`)

A partir de "Pedido pronto" (e com o pedido já no Bling), a tela do pedido mostra o
bloco **Faturamento** com dois botões, cada um repetível:

- **Emitir NF** (`emitirNotaFiscal`): `POST /pedidos/vendas/{id}/gerar-nfe` → guarda
  `bling_nf_id` na hora → `POST /nfe/{id}/enviar?enviarEmail=false` → consulta
  `GET /nfe/{id}` até `situacao` 5/6/7 (autorizada) ou 4/9 (rejeitada/denegada) → baixa
  `linkPDF` e `xml` para o bucket `documentos` (`pedidos/{id}/nfe-{n}.pdf|.xml`) →
  `admin_registrar_nf` (grava nº, chave, caminhos e lança a etapa `nf_emitida` com
  origem `bling`) → e-mail `nf_emitida` ao cliente com os dois anexos. Se a SEFAZ ainda
  não respondeu em ~12 s, devolve "aguarde e clique de novo" — a nota já existe, o
  segundo clique só consulta.
- **Gerar cobrança** (`gerarCobranca`): **não existe endpoint para gerar boleto**. O que
  há é `POST /pedidos/vendas/{id}/lancar-contas`, que vira as parcelas em contas a
  receber; com forma de pagamento do Bling Conta, o próprio Bling emite boleto/Pix e expõe
  `linkBoleto` / `linkQRCodePix` em `GET /contas/receber`. O portal lança, relê as
  contas (casa por `origem.id`, senão vencimento + valor), guarda links e PDF em
  `pedido_parcelas` (ou em `pedidos` no à vista) e manda o e-mail `cobranca` com
  anexos. Cartão não tem botão: é cobrado fora.
- **Hipótese a validar no primeiro teste**: que o Bling Conta emite o boleto sozinho
  logo após `lancar-contas`. Se exigir ação no painel do Bling, o botão vai lançar as
  contas e voltar "sem link" — aí a emissão se faz lá e "Completar" relê os links.
- Ninguém fora de admin/financeiro chama nada disso (`exigirAdmin` nas duas ações).

## O que o portal muda, o Bling acompanha (13/09/2026)

- **Cancelar propaga**: `cancelarPedido` (painel) e `responderSolicitacao` (aceitar pedido
  do cliente) chamam `cancelarPedidoNoBling`, que muda a situação do pedido de venda para
  "Cancelado" (id resolvido pelo nome em `/situacoes/modulos`, porque é por conta) — ou
  apaga, se a conta não tiver essa situação. Falha vira texto em `bling_erro`, mostrado
  no bloco de cancelado. **NF emitida não tem endpoint de cancelamento**: o portal avisa
  que ela precisa ser cancelada no Bling.
- **Depois de "pronto" nada diverge**: quantidade, preço e forma de pagamento congelam
  (tela e servidor). O pedido de venda nasce ali, com metragem, valor e parcelas; a única
  mudança possível depois é cancelar — e essa propaga.
- **"Nova senha" do cliente** deixou de gerar senha provisória: manda um link de
  redefinição por e-mail (`generateLink` do Supabase + `token_hash` no mesmo
  `/auth/confirmar` que "esqueci minha senha" usa). Ninguém da equipe vê a senha. A
  tela mostra para qual e-mail o link foi. Vale igual para a equipe (Configurações).
  O convite de cadastro continua com senha provisória + primeiro acesso.

## Nota fiscal — com ou sem, por pedido

Decidido em 13/09/2026. Nem toda venda sai com nota, então cada pedido carrega
`pedidos.emitir_nf` (`docs/sql/008`), que nasce `true`.

- **Quem decide é a equipe, não o cliente.** É decisão fiscal da empresa; o carrinho não
  tem essa escolha. Aparece na tela do pedido, em "Nota fiscal", ao lado da forma de
  pagamento — a mesma conversa comercial.
- **Dispensar a nota exige motivo** (mín. 10 caracteres, guardado em
  `emitir_nf_motivo`); emitir não exige. Emitir é o caminho normal — cobrar
  justificativa para o normal seria atrito sem propósito. Quem mudou por último fica em
  `emitir_nf_definido_por` / `_em`; não há tabela de histórico, porque o que importa é a
  decisão vigente.
- **Vale até "Pedido pronto".** É a etapa que cria o pedido de venda no Bling, de onde
  sai o faturamento. Depois de `nf_emitida` o banco recusa a troca
  (`admin_definir_emissao_nf`): mudar viraria divergência com o que já foi para a SEFAZ.
- **O Bling recebe o aviso na observação do pedido** (`*** SEM NOTA FISCAL ***`, antes de
  tudo), porque não há campo próprio para isso no pedido de venda. É o que quem fatura
  lê antes de emitir.
- Na lista de pedidos só a exceção aparece (etiqueta `sem nf`), e o modal de confirmação
  de "Pedido pronto" repete o aviso — último momento em que dá para desfazer.
- **Toda troca vira linha em `pedido_nf_historico`** (`docs/sql/009`), como já acontecia
  com quantidade, preço e forma de pagamento. As colunas `emitir_nf_*` em `pedidos`
  continuam guardando a decisão vigente, que é o que a tela lê; a tabela guarda o
  caminho até ela.

## Papéis: `admin` e `financeiro` são o mesmo acesso

Decidido em 13/09/2026: os dois papéis têm exatamente as mesmas permissões. Conferido
nas duas camadas:

- **Banco**: `is_admin()` testa `role in ('admin', 'financeiro') and ativo`, e é o portão
  de todas as RPCs e políticas. As funções `admin_lancar_status`, `admin_reimprimir` e
  `confirmar_pedido` citam `'admin'`, mas como **origem** do registro em
  `pedido_status_historico` (`sistema` / `admin` / `bling`), não como teste de papel.
- **App**: toda checagem faz `papel === 'admin' || papel === 'financeiro'`, e
  `veValores` é verdadeiro para os dois. A única exceção era a trava contra rebaixar a si
  mesmo em `atualizarMembro`, que exigia `admin` — corrigida para barrar só `funcionario`.
- `funcionario` (rótulo "Produção") é o único papel restrito: sem valores, sem clientes,
  sem configurações.

Em 13/09/2026 as três contas ativas da equipe são `financeiro`; nenhuma é `admin`. Não
faz diferença funcional.

## Primeiro acesso: senha provisória

Decidido em 13/09/2026. Vale para **equipe e cliente**: a senha do convite entra uma vez
e o portal não abre até a pessoa criar a dela.

- A marca é `app_metadata.senha_provisoria`, **não** `user_metadata`: o usuário escreve
  no segundo pela API do Supabase e poderia limpar a marca sozinho, ficando com a senha
  que está na caixa de entrada. Em `app_metadata` só a chave de serviço escreve.
- **Fica no token, não numa tabela.** O proxy já recebe o usuário a cada requisição;
  consultar uma coluna ali custaria uma ida ao banco em toda navegação do site.
- Quem marca: `criarCliente`, `criarMembro` e as duas redefinições de senha do painel —
  senha que o admin gera e manda por e-mail nasce provisória, sempre. Quem limpa é só
  `definirPrimeiraSenha`, depois de a senha nova já estar valendo.
- `/api` fica fora do desvio: redirecionar chamada de dados devolveria HTML onde o
  cliente espera JSON.
- Usuários que já existiam **não** têm a marca e seguem entrando direto. Para forçar a
  troca em alguém, use "redefinir senha" no painel.
- **Redefinir senha pelo painel também manda e-mail** (mesmo template do convite, com a
  primeira frase trocada — `redefinida: true`). A tela continua mostrando a senha, e
  quando o envio falha aparece um aviso amarelo com o motivo: a pessoa que cadastrou é
  quem precisa saber que o e-mail não saiu, senão o convidado fica esperando.
- **Em 13/09/2026 o `RESEND_API_KEY` da Vercel estava inválido**: `email_log` mostra
  `API key is invalid` no convite da conta Best Color (14:16) e num "em produção" de
  madrugada. O envio local funcionava, então a chave do `.env.local` é outra — a da
  Vercel foi perdida ou colada errada na troca de variáveis de 12/09. Sem isso, nenhum
  e-mail do portal sai, e até este dia a tela não avisava.

## Quem fez cada alteração

Todas as tabelas de histórico do pedido já gravavam o autor — `criado_por` em
`pedido_ajustes`, `pedido_precos`, `pedido_status_historico` e `pedido_nf_historico`,
`autor_id` em `pedido_forma_pagamento_historico`, `cancelado_por` em `pedidos`. O que
faltava era mostrar: a tela do pedido resolve os nomes numa consulta só a `profiles` e
exibe "por Fulano" em **Alterações no pedido**, em cada etapa do **Andamento** e no aviso
de cancelamento.

- O nome **degrada para nada** se o perfil foi arquivado ou a política não deixa ler.
  Nome é informação extra; não pode derrubar a tela do pedido.
- Item adicionado entra em `pedido_ajustes` como `0 → N` e aparece como
  **Item adicionado**, não como mudança de quantidade.
- A consulta do pedido tem `const campos: string` de propósito: sem a anotação o
  TypeScript monta o tipo do retorno a partir do texto do `select`, e com esta
  quantidade de tabelas embutidas estoura com *union type too complex*.
### Tabela nova precisa de `GRANT` explícito (aprendido em 13/09/2026)

Este banco **não** usa os grants padrão do Supabase: `anon` não lê nem `pedidos`, e cada
tabela tem `grant select ... to authenticated` próprio. Tabela criada pelo SQL Editor nasce
sem isso. O sintoma é traiçoeiro: com a chave de serviço tudo funciona, mas a sessão do
usuário recebe `permission denied` — e se a tabela está **embutida** num select
(`pedidos(..., pedido_nf_historico(...))`), o PostgREST recusa a consulta inteira. Foi o que
transformou a tela do pedido em 404 por algumas horas. Toda migração que cria tabela leva
o grant junto (`docs/sql/011` corrigiu 009 e 010). A tela do pedido agora lança erro em
qualquer falha que não seja "nenhuma linha", em vez de traduzir tudo em 404.

### Fora do pedido: tabela `auditoria` (`docs/sql/010`)

Cadastro de cliente, equipe e configurações não tinham rastro nenhum. Agora têm, numa
tabela genérica — `entidade` + `entidade_id` + `acao` + `campos` (JSON
`[{campo, de, para}]`) + `motivo` + `criado_por`.

- **Uma tabela só, não uma por entidade.** São mudanças de cadastro, sem cálculo em cima
  delas; a pergunta é sempre "o que houve com este cliente / este usuário". Um cadastro
  de cliente tem 15 campos — coluna por campo não se sustentaria.
- **O autor vem da sessão, não do banco.** Estas ações gravam com chave de serviço, onde
  `auth.uid()` não existe. `src/lib/auditoria.ts` lê o usuário logado e grava junto.
- **`registrar()` nunca lança e nunca desfaz nada.** Quando ela roda, a mudança já foi
  salva — devolver erro seria mentir sobre o que aconteceu. Falha vai para o log do
  servidor. Edição que não mudou campo nenhum não vira linha.
- **Limite de crédito grava duas vezes** de propósito: a RPC do banco continua
  alimentando `cliente_limite_historico` (auditoria de verdade) e a ação repete em
  `auditoria` para a tela do cliente mostrar uma lista só.
- Coberto: criar/editar/ativar/desativar/arquivar cliente, preço por metro, limite de
  crédito, criar/editar/ativar/desativar/arquivar/restaurar membro da equipe, redefinir
  senha (só o fato, nunca a senha) e as formas de pagamento — estas com diferença
  legível ("Boleto · máximo de parcelas: 3 → 4").
- **Não coberto de propósito**: catálogo e produtos. São 412 produtos com importação em
  lote; registrar cada um afogaria o resto do histórico. Se precisar, é melhor tabela
  própria com a operação em lote como unidade, não linha por produto.
- Aparece em `src/components/historico-alteracoes.tsx`, usado na tela do cliente
  (filtrada por ele) e em Configurações (equipe + pagamento, sem filtro de registro).

## `criar_pedido` (carrinho) — o que ela valida e o que não valida

Reescrita em `supabase/migrations/20261007120000_forma_pagamento_no_faturamento.sql`
(07/10/2026): só recebe `p_itens` e `p_notas`.

- **Não recebe forma nem parcelas.** O pedido nasce com `forma_pagamento` nulo e
  **nunca** com `bloqueado_credito = true`. Forma ativa, forma permitida ao cliente, teto
  e mínimo de parcelas e limite de crédito passaram para
  `admin_definir_forma_pagamento_faturamento`, chamada pelo Faturar — onde há valor real.
- **Não checa valor.** O `total` só existe depois da estampa.
- Continua validando: cliente ativo com preço, itens do próprio catálogo e ativos,
  anti-duplicidade de 30 s. **Boleto atrasado não barra mais a criação** (08/10/2026):
  o cliente com boleto vencido há mais de 5 dias úteis envia o pedido, mas o gatilho
  `status_bloquear_por_atraso` em `pedido_status_historico` recusa qualquer lançamento
  de etapa com origem `admin` até o pagamento ou a liberação pelo dono
  (`admin_liberar_atraso_boleto`). Origem `sistema`/`bling` passa. A conta dos dias
  úteis é de `cliente_boletos_atraso` (`proximo_dia_util`, feriados incluídos); o app
  não espelha a regra, só lê o resultado (`situacaoAtraso` em `actions/pedidos.ts`).
- Roda com `search_path = ''`: tudo o que ela chama vem com `public.`. Foi esse contexto
  que expôs o gatilho `pedidos_congelar_taxa` sem qualificação (`docs/sql/012`).
- Os gatilhos `pedidos_forma_permitida` e `trg_pedidos_congelar_taxa` só agem com forma
  não nula e rodam em `insert or update of forma_pagamento`: a taxa congela no UPDATE do
  Faturar.

## Formas de pagamento — configuráveis

Decidido em 12/09/2026. Em Configurações → Pagamento, o dono define por forma
(boleto, cartão de crédito, cartão de débito): se está **ativa**, **máximo de parcelas**,
**valor mínimo por parcela**, **intervalo entre boletos** (15 ou 30 dias), **percentual**
e **taxa fixa** somados ao pedido.

- Tudo vive numa chave só de `configuracoes` (`formas_pagamento`), em JSON — são cinco
  ajustes por forma, e em linhas chave/valor cada leitura viraria uma consulta. A
  gravação usa `upsert`, porque a chave pode não existir ainda.
- O cálculo está em `src/lib/pagamento/config.ts`, puro de propósito (sem Supabase),
  para rodar também no navegador. **Taxa fixa do boleto é por documento** (multiplica
  pelas parcelas); no cartão é por transação (cobra uma vez).
- Cartão de crédito **não tem gateway**: o portal registra a escolha e o valor, a
  cobrança sai por fora e alguém marca como pago. Decidido assim para não travar a
  configuração esperando a definição do gateway.
- **O carrinho não conhece o valor do pedido** — a cobrança é por metragem impressa, que
  só existe depois da estampa. Por isso (e por decisão do dono em 07/10/2026) o carrinho
  não oferece forma nenhuma: forma, parcelas, mínimo e taxa são aplicados no Faturar,
  quando o valor existe. O espelho em TypeScript do que a RPC valida está em
  `src/lib/pagamento/faturar.ts` (`avaliarFatura`), usado pelo bloco Faturar e pelo
  pop-up de confirmação.

As chaves antigas `max_parcelas` e `valor_minimo_boleto` **não têm mais tela própria** —
quem edita é a de Pagamento, que grava as duas como ponte, porque `parcelar_pedido` no
Postgres ainda valida por elas. `buscarMaxParcelas()` e `buscarValorMinimoBoleto()`
continuam existindo, mas agora leem do JSON.

**Onde a taxa entra.** `pedidos.total` continua sendo a **mercadoria** (metragem ×
preço) — é o que o Faturamento e a Apuração comparam com o custo por metro. A taxa fica
congelada no pedido (`taxa_pagamento_percentual`, `taxa_pagamento_fixa`, preenchidas por
gatilho quando a forma é escolhida) e entra só no **valor cobrado**:

- No Postgres: `valor_cobranca_pedido()` e `parcelar_pedido`, que divide o valor com
  taxa e usa o intervalo configurado (`docs/sql/001` e `002`).
- No app: `taxaDoPedido()` / `valorCobranca()` em `src/lib/pagamento/config.ts`.
  **Espelham a função SQL — mexeu em um, mexa no outro.**

O cliente vê valores a partir de **Pedido pronto** (não da NF), que é quando sai o
e-mail de cobrança — confirmado em 12/09/2026. Nas telas dele, quando há taxa, aparece
mercadoria + acréscimo + total cobrado.

## Custo estimado

Supabase Pro (~US$25) + Vercel Pro (~US$20) + Resend (grátis até 3.000 e-mails/mês) ≈
**US$45/mês**, fixo, independente do nº de clientes.

## Variáveis de ambiente — o que é público e o que não é

- `SITE_URL` é lida **só no servidor** (`src/lib/site.ts`, usada pelas Server Actions
  para montar links dentro dos e-mails). Não leva `NEXT_PUBLIC_`. O código ainda aceita
  `NEXT_PUBLIC_SITE_URL` como ponte enquanto a variável antiga existir na Vercel.
- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **precisam** do
  prefixo: `src/lib/supabase/client.ts` é importado pela tela de login e pelo envio de
  artes, que rodam no navegador. Tirar o prefixo quebra o login. São públicas por
  natureza — quem protege os dados é o RLS.
- `SUPABASE_SECRET_KEY`, `RESEND_API_KEY` e `BLING_CLIENT_SECRET` nunca levam prefixo.

## Desempenho — o que se sabe

- Cada navegação no painel faz 3 a 4 idas **sequenciais** ao Supabase antes de
  renderizar: `getUser()` no proxy, depois `lerPerfil()` (getUser + `profiles`), depois
  as consultas da página. `lerPerfil()` está em `cache()` do React para layout e página
  compartilharem a mesma chamada na requisição.
- A latência entre a região da função na Vercel e a região do projeto Supabase
  multiplica esse custo. Se o carregamento estiver lento, conferir primeiro em
  Vercel → Settings → Functions → Region e escolher a região mais próxima do Supabase.
- `sharp` (binário nativo) é importado sob demanda dentro de `buscarDadosRomaneio`, não
  no topo de `app/actions/romaneio.ts`: esse módulo é importado pela listagem de
  pedidos (via `confirmarRomaneio`), e no topo fazia a rota `/admin/pedidos` carregar o
  binário a cada início frio.

## Datas e números (09/10/2026)

- **"Hoje" é sempre o de Brasília**: `hojeBrasilia()` em `src/lib/datas.ts` no app e
  `public.hoje_brasilia()` no banco (migration `20261009110000`). Servidor e banco rodam em
  UTC; `new Date().toISOString().slice(0, 10)` e `current_date` viram o dia às 21h.
  As validações do Faturar (vencimento) e da baixa de conta a pagar já usam a função.
- **Número digitado**: `paraNumeroBr()` em `src/lib/numero.ts` ("1.234,56", "10.000",
  "1,5" e "1.5" saem certos; inválido = NaN). Não usar `Number(x.replace(',', '.'))`.

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


---

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
