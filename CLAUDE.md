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
  criação do pedido — a data de criação está na coluna "Entrou" (escondida no celular).
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
  (`D10409` etc.), e o token já vem em **JWT** (a nota de migração abaixo está vencida).

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
- **Migração JWT do Bling (a fazer)**: o portal recebe hoje token opaco, modelo que o
  Bling está descontinuando. Para migrar, enviar o cabeçalho `enable-jwt: 1` no POST
  para `/oauth/token` (tanto no callback quanto no refresh).
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
- **Aviso interno de pedido novo (a construir)** — decidido em 12/09/2026: quando entrar
  pedido de qualquer cliente, o administrador recebe e-mail de aviso. Quem recebe e quais
  tipos de e-mail cada um recebe ficam num **setup de notificações dentro de
  Configurações** (lista de destinatários × tipo de gatilho), não no código.
- **Setup de automação / editor de etapas (a construir)** — decidido em 12/09/2026:
  área dentro de Configurações para **incluir, excluir e editar os status/estágios** do
  pedido. Hoje as etapas são constantes espalhadas pelo código
  (`src/app/admin/pedidos/estagios.ts`, `ETAPAS_MANUAIS` em `app/actions/producao.ts` e
  o enum aceito pela RPC `admin_lancar_status`); tornar isso configurável exige mover as
  etapas para o banco e ajustar essas três pontas juntas.

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
  só existe depois da estampa. Então o carrinho só aplica: formas ativas, parcelas por
  forma e o aviso do acréscimo. Valor mínimo por parcela e a taxa em si só podem ser
  aplicados quando o valor existe.

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
