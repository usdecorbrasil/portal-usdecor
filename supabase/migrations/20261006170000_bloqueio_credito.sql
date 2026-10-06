-- ============================================================================
-- Bloqueio por limite de crédito
--
-- Pedido em boleto que, somado ao que o cliente já tem em boleto, passa do
-- limite não é mais recusado: nasce em "aguardando" com
-- `pedidos.bloqueado_credito = true`. A equipe vê em destaque no dashboard e
-- recebe aviso; só admin/financeiro libera, com motivo, e só então o pedido
-- pode ser confirmado (gatilho em pedido_status_historico).
--
-- `criar_pedido` muda o retorno (ganha a coluna bloqueado_credito), e o
-- Postgres não deixa trocar o retorno com CREATE OR REPLACE — por isso o
-- DROP antes. O resto do corpo é o de docs/sql/013.
-- ============================================================================

alter table public.pedidos
  add column if not exists bloqueado_credito        boolean not null default false,
  add column if not exists bloqueio_liberado_em     timestamptz,
  add column if not exists bloqueio_liberado_por    uuid,
  add column if not exists bloqueio_liberado_motivo text;

comment on column public.pedidos.bloqueado_credito is
  'Nasceu em boleto acima do limite de crédito do cliente. Confirmação exige liberação com motivo (admin_liberar_bloqueio_credito).';

drop function if exists public.criar_pedido(jsonb, text, text, integer);

CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_itens jsonb,
  p_notas text DEFAULT NULL::text,
  p_forma_pagamento text DEFAULT 'boleto_avista'::text,
  p_parcelas integer DEFAULT NULL::integer
)
 RETURNS TABLE(pedido_id uuid, numero bigint, total numeric, bloqueado_credito boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid       uuid := (select auth.uid());
  v_cliente   uuid;
  v_preco     numeric;
  v_pedido    uuid;
  v_inseridos integer;
  v_esperados integer;
  v_cfg       jsonb;
  v_max       integer;
  v_limite    numeric;
  v_total     numeric;
  v_bloqueado boolean := false;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select p.cliente_id into v_cliente
    from public.profiles p
   where p.id = v_uid and p.ativo and p.role = 'cliente';

  if v_cliente is null then
    raise exception 'Usuário sem cliente vinculado' using errcode = '42501';
  end if;

  if p_forma_pagamento not in
     ('boleto_avista', 'boleto_parcelado', 'pix', 'cartao_credito', 'cartao_debito') then
    raise exception 'Forma de pagamento inválida';
  end if;

  -- Forma desligada em Configuracoes nao entra, mesmo que o carrinho tenha
  -- ficado aberto de antes da mudanca
  v_cfg := public.config_forma_pagamento(p_forma_pagamento);

  if v_cfg <> '{}'::jsonb and coalesce((v_cfg ->> 'ativa')::boolean, true) = false then
    raise exception 'Esta forma de pagamento não está disponível no momento.';
  end if;

  -- Parcelas: boleto parcelado exige; cartao de credito aceita; o resto recusa
  -- Parcelado sem credito nao e mais recusado aqui: o pedido nasce
  -- bloqueado (ver o fim da funcao) e a equipe decide
  if p_forma_pagamento = 'boleto_parcelado' then
    if p_parcelas is null then
      raise exception 'Escolha a quantidade de parcelas';
    end if;

  elsif p_forma_pagamento <> 'cartao_credito' and p_parcelas is not null then
    raise exception 'Quantidade de parcelas só se aplica a boleto parcelado ou cartão de crédito';
  end if;

  if p_parcelas is not null then
    -- O teto e por forma. A chave antiga fica de rede enquanto a tela de
    -- Pagamento nao for salva pela primeira vez
    v_max := coalesce(
      (v_cfg ->> 'maxParcelas')::integer,
      (select valor::integer from public.configuracoes where chave = 'max_parcelas'),
      4
    );

    if p_parcelas < 2 or p_parcelas > v_max then
      raise exception 'Escolha entre 2 e % parcelas', v_max;
    end if;
  end if;

  select c.preco_metro into v_preco
    from public.clientes c
   where c.id = v_cliente and c.ativo;

  if v_preco is null then
    raise exception 'Cadastro inativo. Fale com o suporte.' using errcode = '42501';
  end if;

  if v_preco <= 0 then
    raise exception 'Preço não definido para este cadastro. Fale com a Best Color Tecidos.';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Formato de itens inválido';
  end if;

  v_esperados := jsonb_array_length(p_itens);

  if v_esperados = 0 then
    raise exception 'O pedido precisa ter ao menos um item';
  end if;

  if v_esperados > 200 then
    raise exception 'Máximo de 200 artes diferentes por pedido';
  end if;

  if exists (select 1 from public.pedidos p
              where p.criado_por = v_uid
                and p.created_at > now() - interval '30 seconds') then
    raise exception 'Um pedido acabou de ser enviado. Aguarde alguns segundos.';
  end if;

  insert into public.pedidos (cliente_id, criado_por, notas, forma_pagamento, parcelas_solicitadas)
  values (v_cliente, v_uid, nullif(btrim(coalesce(p_notas, '')), ''), p_forma_pagamento, p_parcelas)
  returning id into v_pedido;

  with entrada as (
    select (i ->> 'produto_id')::uuid    as produto_id,
           (i ->> 'quantidade')::integer as quantidade
      from jsonb_array_elements(p_itens) as i
  )
  insert into public.pedido_itens
    (pedido_id, produto_id, sku, nome,
     preco_unitario, metros_por_unidade,
     quantidade_pedida, quantidade_faturada)
  select v_pedido, pr.id, pr.sku, pr.nome,
         v_preco, pr.metros_por_unidade,
         e.quantidade, e.quantidade
    from entrada e
    join public.produtos pr on pr.id = e.produto_id
    join public.catalogos k on k.id = pr.catalogo_id
   where pr.cliente_id = v_cliente
     and pr.ativo
     and k.ativo
     and e.quantidade between 1 and 100000;

  get diagnostics v_inseridos = row_count;

  if v_inseridos <> v_esperados then
    raise exception
      'Um ou mais itens estão indisponíveis ou fora do seu catálogo. Atualize a página e tente novamente.';
  end if;

  -- Limite de credito: boleto que, somado ao que ja esta em boleto, passa do
  -- limite nao e recusado — nasce bloqueado, para a equipe decidir. O total
  -- aqui e a estimativa pelos itens (o real vem da metragem); e o que ha.
  -- Limite zero significa "sem controle de credito": nao bloqueia.
  if p_forma_pagamento like 'boleto%' then
    select c.limite_credito into v_limite from public.clientes c where c.id = v_cliente;
    select coalesce(sum(i.subtotal), 0) into v_total
      from public.pedido_itens i where i.pedido_id = v_pedido;

    if coalesce(v_limite, 0) > 0
       and public.credito_em_uso(v_cliente) + v_total > v_limite then
      v_bloqueado := true;
      update public.pedidos set bloqueado_credito = true where id = v_pedido;
    end if;
  end if;

  return query
    select p.id, p.numero, p.total, p.bloqueado_credito
      from public.pedidos p
     where p.id = v_pedido;
end;
$function$;


grant execute on function public.criar_pedido(jsonb, text, text, integer) to authenticated;

-- Confirmar um pedido bloqueado exige liberar antes. Vale por qualquer caminho
-- que lance a etapa "recebido" (confirmar_pedido, chave de serviço, SQL).
create or replace function public.pedidos_confirmar_exige_liberacao()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.status = 'recebido'
     and exists (select 1 from pedidos p where p.id = new.pedido_id and p.bloqueado_credito) then
    raise exception 'Pedido bloqueado por limite de crédito. Libere com motivo antes de confirmar.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_confirmar_exige_liberacao on public.pedido_status_historico;
create trigger pedidos_confirmar_exige_liberacao
  before insert on public.pedido_status_historico
  for each row
  execute function public.pedidos_confirmar_exige_liberacao();

-- Liberação, só admin/financeiro, com motivo. Depois dela confirmar_pedido
-- segue o caminho normal.
create or replace function public.admin_liberar_bloqueio_credito(
  p_pedido_id uuid,
  p_motivo    text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Descreva o motivo da liberação (mín. 10 caracteres)';
  end if;

  update pedidos
     set bloqueado_credito        = false,
         bloqueio_liberado_em     = now(),
         bloqueio_liberado_por    = auth.uid(),
         bloqueio_liberado_motivo = v_motivo
   where id = p_pedido_id
     and bloqueado_credito;

  if not found then
    raise exception 'Pedido não está bloqueado por crédito';
  end if;
end;
$$;

revoke all on function public.admin_liberar_bloqueio_credito(uuid, text) from public;
grant execute on function public.admin_liberar_bloqueio_credito(uuid, text) to authenticated;
