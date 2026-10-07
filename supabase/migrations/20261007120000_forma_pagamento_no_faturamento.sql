-- ============================================================================
-- Forma de pagamento definida no faturamento, não pelo cliente
--
-- Decidido pelo dono em 07/10/2026: o cliente não escolhe mais forma de
-- pagamento nem parcelas no carrinho. Quem decide é admin/financeiro, no
-- botão Faturar, com o valor real do pedido (metragem × preço) em mãos — no
-- pedido individual ou no agrupador.
--
-- O que muda aqui:
--   1. `pedidos.forma_pagamento` e `parcelas_solicitadas` aceitam NULL e
--      perdem o default: pedido novo nasce sem forma. Os CHECKs continuam
--      valendo para valores não nulos (CHECK com NULL é verdadeiro em SQL).
--   2. `criar_pedido` perde os parâmetros de forma e parcelas e toda a
--      validação que dependia deles (forma ativa, teto, parcela mínima,
--      limite de crédito). O pedido nunca mais nasce bloqueado por crédito.
--      O retorno muda (sem `bloqueado_credito`): DROP + CREATE.
--   3. Gatilhos `pedidos_forma_permitida` e `pedidos_congelar_taxa` só agem
--      com forma não nula e rodam também no UPDATE que define a forma no
--      Faturar — é nesse momento que a taxa congela.
--   4. Nova RPC `admin_definir_forma_pagamento_faturamento`: valida forma
--      ativa, permitida ao cliente, parcelas, parcela mínima pelo valor real
--      e limite de crédito (boleto), grava forma e parcelas, regenera as
--      parcelas e registra em `pedido_forma_pagamento_historico`.
--   5. `admin_liberar_bloqueio_credito` passa a servir também ao Faturar:
--      libera um pedido que não nasceu marcado como bloqueado.
--   6. `pedido_forma_pagamento_historico.forma_anterior` aceita NULL: a
--      primeira definição não tem "de".
-- ============================================================================

-- 1. Colunas ------------------------------------------------------------------

alter table public.pedidos
  alter column forma_pagamento drop not null,
  alter column forma_pagamento drop default;

alter table public.pedidos
  alter column parcelas_solicitadas drop not null,
  alter column parcelas_solicitadas drop default;

comment on column public.pedidos.forma_pagamento is
  'Forma de pagamento definida por admin/financeiro no faturamento (admin_definir_forma_pagamento_faturamento). NULL até lá.';

comment on column public.pedidos.parcelas_solicitadas is
  'Parcelas definidas no faturamento (boleto parcelado ou cartão de crédito). NULL = à vista ou ainda não definido.';

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'pedido_forma_pagamento_historico'
       and column_name  = 'forma_anterior'
       and is_nullable  = 'NO'
  ) then
    alter table public.pedido_forma_pagamento_historico
      alter column forma_anterior drop not null;
  end if;
end;
$$;

-- 2. criar_pedido sem forma de pagamento ---------------------------------------

drop function if exists public.criar_pedido(jsonb, text, text, integer);

CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_itens jsonb,
  p_notas text DEFAULT NULL::text
)
 RETURNS TABLE(pedido_id uuid, numero bigint, total numeric)
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

  -- Sem forma de pagamento e sem parcelas: isso e decidido pela equipe no
  -- faturamento, com o valor real em maos. E nunca nasce bloqueado por
  -- credito — o limite e conferido quando a forma e escolhida
  insert into public.pedidos (cliente_id, criado_por, notas, forma_pagamento, parcelas_solicitadas)
  values (v_cliente, v_uid, nullif(btrim(coalesce(p_notas, '')), ''), null, null)
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

  return query
    select p.id, p.numero, p.total
      from public.pedidos p
     where p.id = v_pedido;
end;
$function$;

revoke all on function public.criar_pedido(jsonb, text) from public;
grant execute on function public.criar_pedido(jsonb, text) to authenticated;

-- 3. Gatilhos: só com forma não nula, também no UPDATE -----------------------

-- Forma permitida ao cliente. Continua travando só o papel cliente (a equipe
-- é validada pela RPC do faturamento, que também lê `clientes.formas_pagamento`).
create or replace function public.pedidos_forma_permitida()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_formas text[];
begin
  if new.forma_pagamento is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.forma_pagamento is not distinct from old.forma_pagamento then
    return new;
  end if;

  if v_uid is null then
    return new;
  end if;

  if not exists (select 1 from profiles where id = v_uid and role = 'cliente') then
    return new;
  end if;

  select formas_pagamento into v_formas from clientes where id = new.cliente_id;

  if v_formas is not null and not (new.forma_pagamento = any(v_formas)) then
    raise exception 'Esta forma de pagamento não está disponível para o seu cadastro. Escolha outra ou fale com a Best Color Tecidos.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists pedidos_forma_permitida on public.pedidos;
create trigger pedidos_forma_permitida
  before insert or update of forma_pagamento on public.pedidos
  for each row
  execute function public.pedidos_forma_permitida();

-- Congela a taxa da forma no pedido. Mesmo corpo de docs/sql/012 (já tratava
-- NULL e UPDATE); recriado aqui para o gatilho ficar documentado junto da
-- regra nova: a taxa congela no UPDATE do Faturar, não no INSERT do carrinho.
create or replace function public.pedidos_congelar_taxa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cfg jsonb;
begin
  if new.forma_pagamento is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.forma_pagamento is not distinct from old.forma_pagamento then
    return new;
  end if;

  v_cfg := public.config_forma_pagamento(new.forma_pagamento);

  new.taxa_pagamento_percentual := coalesce((v_cfg ->> 'percentual')::numeric, 0);
  new.taxa_pagamento_fixa       := coalesce((v_cfg ->> 'taxaFixa')::numeric, 0);

  return new;
end;
$$;

drop trigger if exists trg_pedidos_congelar_taxa on public.pedidos;
create trigger trg_pedidos_congelar_taxa
  before insert or update of forma_pagamento on public.pedidos
  for each row
  execute function public.pedidos_congelar_taxa();

-- 4. Liberação de crédito também no Faturar ------------------------------------
--
-- Antes exigia `bloqueado_credito = true` (pedido que nasceu bloqueado). Agora
-- o bloqueio acontece quando a forma é escolhida, então a liberação precisa
-- valer para qualquer pedido ativo. O motivo continua obrigatório e fica em
-- `bloqueio_liberado_*`, que a RPC do faturamento lê para não barrar de novo.
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
     and cancelado_em is null;

  if not found then
    raise exception 'Pedido não encontrado ou cancelado';
  end if;
end;
$$;

revoke all on function public.admin_liberar_bloqueio_credito(uuid, text) from public;
grant execute on function public.admin_liberar_bloqueio_credito(uuid, text) to authenticated;

-- 5. RPC do faturamento ----------------------------------------------------------

create or replace function public.admin_definir_forma_pagamento_faturamento(
  p_pedido_id          uuid,
  p_forma              text,
  p_parcelas           integer default null,
  p_primeiro_vencimento date   default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid            uuid := auth.uid();
  v_status         text;
  v_cliente        uuid;
  v_forma_atual    text;
  v_parcelas_atual integer;
  v_total          numeric(12,2);
  v_pct_atual      numeric(6,3);
  v_fixa_atual     numeric(12,2);
  v_cancelado      timestamptz;
  v_liberado       timestamptz;
  v_formas         text[];
  v_limite         numeric;
  v_cfg            jsonb;
  v_max            integer;
  v_minimo         numeric;
  v_pct            numeric;
  v_fixa           numeric;
  v_docs           integer;
  v_cobranca       numeric(12,2);
  v_documento      numeric(12,2);
  v_em_uso         numeric;
  v_parcelas       integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_forma is null or p_forma not in
     ('boleto_avista', 'boleto_parcelado', 'pix', 'cartao_credito', 'cartao_debito') then
    raise exception 'Escolha a forma de pagamento.';
  end if;

  select p.cliente_id, p.forma_pagamento, p.parcelas_solicitadas, p.total,
         p.taxa_pagamento_percentual, p.taxa_pagamento_fixa,
         p.cancelado_em, p.bloqueio_liberado_em
    into v_cliente, v_forma_atual, v_parcelas_atual, v_total,
         v_pct_atual, v_fixa_atual, v_cancelado, v_liberado
    from public.pedidos p
   where p.id = p_pedido_id
     for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_cancelado is not null then
    raise exception 'Pedido cancelado';
  end if;

  v_status := public.status_atual(p_pedido_id)::text;

  if v_status <> 'pronto' then
    raise exception
      'A forma de pagamento é definida ao faturar, com o pedido em "Pedido pronto" (atual: %).', v_status;
  end if;

  if v_total is null or v_total <= 0 then
    raise exception 'O pedido ainda não tem valor: a metragem impressa precisa estar confirmada.';
  end if;

  -- Forma ativa em Configurações → Pagamento
  v_cfg := public.config_forma_pagamento(p_forma);

  if v_cfg <> '{}'::jsonb and coalesce((v_cfg ->> 'ativa')::boolean, true) = false then
    raise exception 'Esta forma de pagamento está desativada em Configurações → Pagamento.';
  end if;

  -- Forma permitida ao cliente (lista do cadastro)
  select c.formas_pagamento, c.limite_credito
    into v_formas, v_limite
    from public.clientes c
   where c.id = v_cliente;

  if v_formas is not null and cardinality(v_formas) > 0
     and not (p_forma = any(v_formas)) then
    raise exception
      'Esta forma de pagamento não está permitida para este cliente. Ajuste no cadastro do cliente ou escolha outra.';
  end if;

  -- Parcelas: boleto parcelado exige; cartão de crédito aceita; o resto é à vista
  if p_forma = 'boleto_parcelado' then
    if p_parcelas is null or p_parcelas < 2 then
      raise exception 'Informe a quantidade de parcelas do boleto (mínimo 2).';
    end if;
    if p_primeiro_vencimento is null then
      raise exception 'Informe o primeiro vencimento do boleto parcelado.';
    end if;
    if p_primeiro_vencimento < current_date then
      raise exception 'O primeiro vencimento não pode ser no passado.';
    end if;
    v_parcelas := p_parcelas;
  elsif p_forma = 'cartao_credito' then
    v_parcelas := case when coalesce(p_parcelas, 1) >= 2 then p_parcelas else null end;
  else
    if p_parcelas is not null and p_parcelas > 1 then
      raise exception 'Quantidade de parcelas só se aplica a boleto parcelado ou cartão de crédito.';
    end if;
    v_parcelas := null;
  end if;

  if v_parcelas is not null then
    v_max := coalesce(
      (v_cfg ->> 'maxParcelas')::integer,
      (select valor::integer from public.configuracoes where chave = 'max_parcelas'),
      4
    );
    if v_parcelas > v_max then
      raise exception 'Esta forma permite no máximo %x.', v_max;
    end if;
  end if;

  -- Valor cobrado com a forma escolhida. Se a forma muda, a taxa que vai
  -- congelar é a da configuração atual (gatilho); se não muda, vale a que já
  -- está congelada no pedido — é o que será cobrado de fato
  if v_forma_atual is distinct from p_forma then
    v_pct  := coalesce((v_cfg ->> 'percentual')::numeric, 0);
    v_fixa := coalesce((v_cfg ->> 'taxaFixa')::numeric, 0);
  else
    v_pct  := coalesce(v_pct_atual, 0);
    v_fixa := coalesce(v_fixa_atual, 0);
  end if;

  v_docs := case when p_forma = 'boleto_parcelado' then v_parcelas else 1 end;
  v_cobranca := round(v_total + round(v_total * v_pct / 100, 2) + v_fixa * v_docs, 2);

  -- Parcela mínima, pelo valor real
  v_minimo := coalesce(
    (v_cfg ->> 'valorMinimoParcela')::numeric,
    case when p_forma like 'boleto%'
         then (select valor::numeric from public.configuracoes where chave = 'valor_minimo_boleto')
    end,
    case when p_forma like 'boleto%' then 200 else 0 end
  );

  if p_forma like 'boleto%' and v_minimo > 0 then
    v_documento := case when p_forma = 'boleto_parcelado'
                        then trunc(v_cobranca / v_parcelas, 2)
                        else v_cobranca end;
    if v_documento < v_minimo then
      raise exception
        'Cada boleto ficaria em R$ %, abaixo do mínimo de R$ %. Escolha menos parcelas ou outra forma.',
        to_char(v_documento, 'FM999G999G990D00'), to_char(v_minimo, 'FM999G999G990D00');
    end if;
  end if;

  if p_forma = 'cartao_credito' and v_parcelas is not null and v_minimo > 0
     and trunc(v_cobranca / v_parcelas, 2) < v_minimo then
    raise exception
      'Cada parcela ficaria em R$ %, abaixo do mínimo de R$ % do cartão. Escolha menos parcelas.',
      to_char(trunc(v_cobranca / v_parcelas, 2), 'FM999G999G990D00'), to_char(v_minimo, 'FM999G999G990D00');
  end if;

  -- Limite de crédito: só boleto é conta a receber. A liberação do dono
  -- (bloqueio_liberado_em) dispensa a checagem. O crédito em uso já pode
  -- conter este pedido, se ele estava em boleto: tira para não contar duas vezes
  if p_forma like 'boleto%' and v_liberado is null then
    v_em_uso := public.credito_em_uso(v_cliente)
              - case when v_forma_atual like 'boleto%'
                     then coalesce(public.valor_cobranca_pedido(p_pedido_id), 0)
                     else 0 end;
    v_em_uso := greatest(coalesce(v_em_uso, 0), 0);

    if p_forma = 'boleto_parcelado'
       and not (coalesce(v_limite, 0) > 0 and v_limite - v_em_uso > 0) then
      raise exception
        'Boleto parcelado indisponível: o cliente % (R$ % já em boletos). Libere com motivo ou escolha outra forma.',
        case when coalesce(v_limite, 0) > 0
             then 'está com o limite de crédito de R$ ' || to_char(v_limite, 'FM999G999G990D00') || ' tomado'
             else 'não tem limite de crédito definido' end,
        to_char(v_em_uso, 'FM999G999G990D00')
        using hint = 'limite_credito';
    end if;

    if coalesce(v_limite, 0) > 0 and v_em_uso + v_cobranca > v_limite then
      raise exception
        'Este pedido passa do limite de crédito do cliente: R$ % em boletos + R$ % deste pedido, com limite de R$ %. Libere com motivo ou escolha outra forma.',
        to_char(v_em_uso, 'FM999G999G990D00'),
        to_char(v_cobranca, 'FM999G999G990D00'),
        to_char(v_limite, 'FM999G999G990D00')
        using hint = 'limite_credito';
    end if;
  end if;

  -- Parcela já paga não pode ser refeita (não deveria existir em "pronto")
  if exists (select 1 from public.pedido_parcelas pp
              where pp.pedido_id = p_pedido_id and pp.pago_em is not null) then
    raise exception 'Há parcela paga neste pedido; a forma de pagamento não pode mais mudar.';
  end if;

  -- Grava. O gatilho congela a taxa quando a forma muda. Passou pelas regras,
  -- então qualquer marca de bloqueio por crédito deixa de valer
  update public.pedidos
     set forma_pagamento      = p_forma,
         parcelas_solicitadas = v_parcelas,
         bloqueado_credito    = false
   where id = p_pedido_id;

  if p_forma = 'boleto_parcelado' then
    -- Sempre regenera: em "pronto" nenhum boleto foi emitido ainda, e assim as
    -- parcelas refletem o valor e o vencimento escolhidos agora
    perform public.parcelar_pedido(p_pedido_id, v_parcelas, p_primeiro_vencimento);
  else
    delete from public.pedido_parcelas where pedido_id = p_pedido_id;
  end if;

  if v_forma_atual is distinct from p_forma
     or v_parcelas_atual is distinct from v_parcelas then
    insert into public.pedido_forma_pagamento_historico
      (pedido_id, forma_anterior, forma_nova, parcelas_anterior, parcelas_nova, motivo, autor_id)
    values
      (p_pedido_id, v_forma_atual, p_forma, v_parcelas_atual, v_parcelas, 'Definida no faturamento', v_uid);
  end if;
end;
$$;

revoke all on function public.admin_definir_forma_pagamento_faturamento(uuid, text, integer, date) from public;
grant execute on function public.admin_definir_forma_pagamento_faturamento(uuid, text, integer, date) to authenticated;

comment on function public.admin_definir_forma_pagamento_faturamento(uuid, text, integer, date) is
  'Define forma de pagamento e parcelas de um pedido em "Pedido pronto", no Faturar. Valida forma ativa, permitida ao cliente, teto e mínimo de parcelas pelo valor real e limite de crédito (boleto; dispensado por bloqueio_liberado_em). Registra em pedido_forma_pagamento_historico.';
