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
- **Arrastar e soltar em `/admin/pedidos`**: o cartão tem um punho à esquerda; arrastar
  até outra seção lança a etapa. Funciona com mouse e com o dedo (Pointer Events, com
  rolagem automática perto das bordas). Destinos permitidos vêm de `destinosPermitidos()`
  em `src/app/admin/pedidos/estagios.ts` e espelham a regra do painel do pedido: uma
  etapa por vez, exceto saindo de Estampando, onde a costura pode ser pulada. Soltar
  num destino inválido não faz nada e explica o porquê.
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

- **Registrar `bestcolortecidos.com.br`** — domínio já registrado no Registro.br.
  Falta o acesso de edição de zona DNS (solicitado em 09/09/2026), que trava:
  - **E-mails**: sem domínio verificado no Resend, só é possível enviar para o próprio
    endereço cadastrado. Nenhum cliente recebe confirmação, aviso de produção ou boleto.
  - **Domínio do portal**: o CNAME `portal` → `cname.vercel-dns.com` não pode ser criado
    enquanto o acesso à zona não sair.
- **PENDÊNCIA ABERTA — migrar do `.vercel.app` para o domínio próprio.** Decidido em
  09/09/2026 não esperar o DNS: o Bling foi configurado com o endereço provisório
  `https://portal-bello-tecido.vercel.app/api/bling/callback` (o `.vercel.app` manteve
  o nome antigo mesmo após o projeto ser renomeado para `portal-bestcolortecidos`).
  Quando a zona DNS liberar, revisar **na ordem**:
  1. Criar o CNAME `portal` no Registro.br e adicionar o domínio no Vercel.
  2. Atualizar `NEXT_PUBLIC_SITE_URL` e `BLING_REDIRECT_URI` no Vercel para
     `https://portal.bestcolortecidos.com.br...`.
  3. Atualizar a URL de redirecionamento **no painel do Bling** — os dois textos
     precisam ser idênticos, senão o OAuth falha com `token_falhou`
     (a rota envia o valor na troca de token, `src/app/api/bling/callback/route.ts`).
  4. Reconectar o Bling (o token atual continua válido, mas o fluxo de reconexão vai
     usar o endereço novo).
  5. Redeploy — variável de ambiente só passa a valer em build novo.
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
- **E-mails: 3 dos 14 gatilhos** implementados (`convite_acesso`, `pedido_recebido`,
  `em_producao`). Falta o de "Pedido pronto" com a cobrança, que é o que fecha o ciclo
  comercial, além de NF emitida, cancelamentos, ajuste de quantidade, artes rejeitadas,
  recuperação de senha e todos os avisos internos à equipe.
- Pedidos estampados antes da migração de custos não têm custo gravado e aparecem na
  Apuração com lucro igual à receita inteira.
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
