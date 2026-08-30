Escopo — Portal de Pedidos | Estamparia por Sublimação
1. Visão geral

Portal web B2B para clientes de uma empresa brasileira de estamparia por sublimação. Cada cliente acessa uma área restrita, visualiza apenas o catálogo de artes exclusivo dele, monta o pedido em formato de carrinho, envia, e acompanha o status até a entrega.

Stack definida:

Camada	Tecnologia
Front-end e back-end	Next.js (App Router)
Banco de dados e autenticação	Supabase
E-mails transacionais	Resend (domínio próprio)
ERP / gestão de pedidos	Bling (API v3, OAuth)
Hospedagem	Vercel
2. Perfis de acesso

Cliente (externo)

Acesso apenas por login e senha
Sem auto-cadastro — conta criada pelo administrador
Vê somente o próprio catálogo, os próprios preços e os próprios pedidos

Administrador (interno)

Painel administrativo próprio
Cadastra clientes, catálogos e tabelas de preço
Atualiza status de produção
Visualiza todos os pedidos
3. Cadastro de clientes
Administrador cadastra o cliente no painel (razão social, CNPJ, e-mail, contato)
Administrador vincula ao cliente:
o catálogo de artes exclusivo
a tabela de preços individual
Sistema envia e-mail automático ao cliente com o link de acesso e definição de senha
4. Catálogo

Visual em grade, estilo marketplace. Limpo e funcional.

Campos de cada item:

Imagem da arte (visual do produto)
SKU
Nome do desenho
Tecido a ser estampado (fixo por produto — sem seleção pelo cliente)
Quantidade (o campo de quantidade é a quantidade de repetições — mesmo campo, não são atributos separados)
Preço (conforme tabela do cliente logado)

Comportamento:

Campo de quantidade editável direto na página principal, sem entrar no produto
Botão "adicionar ao carrinho" no próprio card
Isolamento total: um cliente nunca enxerga itens de outro cliente
5. Carrinho e envio do pedido
Listagem dos itens selecionados com quantidade e subtotal
Total do pedido calculado com a tabela de preços individual do cliente
Campo de notas do pedido (texto livre, preenchido pelo cliente)
Ao confirmar: pedido gravado no banco e enviado à API do Bling
E-mail automático de confirmação ao cliente
6. Status do pedido

Fluxo em oito etapas:

Pedido recebido
Impressão
Estampando
Em corte / costura
Pedido pronto
Expedido
Entregue
Pedido fechado

Modelo misto de atualização:

Status	Origem
Pedido recebido	Automático (na criação do pedido)
Impressão, Estampando, Em corte / costura, Pedido pronto	Manual, pelo painel administrativo
Expedido, Entregue	Sincronizado do Bling
Pedido fechado	Sincronizado do Bling — depende da baixa financeira. O pedido só é fechado após a baixa registrada no Bling

E-mails de notificação: disparar em apenas três momentos —

Gatilho	Status correspondente
Pedido recebido	1. Pedido recebido
Em produção	2. Impressão
Pedido pronto	5. Pedido pronto

Todos os demais status ficam visíveis somente no acompanhamento dentro do portal, sem envio de e-mail.

7. Acompanhamento pelo cliente
Lista dos pedidos do cliente na área logada
Detalhe do pedido com itens, quantidades, notas e histórico de status com data/hora
Indicação visual da etapa atual dentro do fluxo de oito status
8. Integração com o Bling
Conta Bling ativa: sim
API v3, autenticação OAuth 2.0
Credenciais a serem geradas na área de aplicativos do painel Bling
Envio: criação do pedido no Bling quando o cliente confirma no portal, como pedido de venda (não orçamento)
Retorno: sincronização dos status de expedição, entrega e baixa financeira para o portal. A baixa é o gatilho do status "Pedido fechado"
9. Envio de artes pelo cliente

Importante: este fluxo é separado do pedido e acontece antes dele. O cliente não envia arquivos junto com o pedido.

Localização: aba própria dentro da área do cliente, ao lado do catálogo — não dentro da tela de pedido.

Como funciona:

O cliente acessa a aba de envio de artes
Preenche um campo de link de pasta compartilhada (Google Drive, Dropbox ou similar) contendo os arquivos das artes
Aviso visível na tela e no formulário: o link deve ser enviado com acesso já liberado, permitindo download sem solicitação de permissão
Aviso obrigatório: todos os arquivos de arte/imagem devem estar salvos com o nome igual ao SKU do produto correspondente (ex.: ABC-1234.png). Arquivos fora desse padrão não são processados e o cliente é orientado a reenviar
Campo de observações opcional (nome das artes, instruções)
O envio gera uma notificação ao administrador

Fluxo interno subsequente:

Administrador recebe o link e baixa os arquivos
Administrador cadastra as artes no catálogo daquele cliente (imagem, SKU, nome do desenho, tecido, preço)
Somente após esse cadastro o produto fica ativo e disponível para o cliente adicionar ao pedido

Implicação técnica: todo item de catálogo precisa de um campo de status — ativo ou inativo — controlado pelo administrador. Itens inativos não aparecem, ou aparecem bloqueados, para o cliente.

Histórico: o cliente visualiza os envios anteriores e a situação de cada um (recebido / cadastrado no catálogo).

10. Pendências a definir
 Domínio que será usado para o envio dos e-mails via Resend
Resolvidas
✅ Tecido é fixo por produto, sem seleção pelo cliente
✅ Quantidade de repetições é o campo de quantidade — mesmo campo
✅ Pedido entra no Bling como pedido de venda
✅ Envio de artes por link de pasta compartilhada, em aba separada, antes do pedido
✅ Arquivos de arte nomeados com o SKU correspondente
✅ E-mail "Em produção" dispara no status Impressão
✅ Status "Finalizado" removido do fluxo
✅ "Pedido fechado" depende da baixa financeira no Bling
11. Custo estimado mensal
Item	Valor
Supabase (plano Pro)	~US$ 25
Vercel (plano Pro)	~US$ 20
Resend	Grátis até 3.000 e-mails/mês
Total aproximado	~US$ 45/mês

Custo fixo, independente do número de clientes cadastrados — diferente do modelo por usuário do AppSheet.