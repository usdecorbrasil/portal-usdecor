-- ============================================================================
-- agrupar_pedidos sem preço médio (09/10/2026, pedido do dono)
--
-- Antes, o agrupador recebia em todos os itens o preço médio do metro
-- (soma dos valores ÷ soma das metragens). Agora:
--   - cada arte leva o preço do metro do pedido original de onde veio;
--   - a mesma arte pode ter preços diferentes: vira uma linha por preço.
--     Para isso a chave única de pedido_itens passa de (pedido, arte) para
--     (pedido, arte, preço). Num pedido comum todos os itens têm o mesmo
--     preço (o do cliente, congelado), então lá nada muda: a mesma arte
--     continua não podendo entrar duas vezes;
--   - o total do agrupador é a soma exata dos originais;
--   - o histórico deixa de citar "preço médio".
-- No Bling o agrupador já vai com uma linha por pedido original.
-- O resto da função é igual a 20261008160000.
-- ============================================================================

-- Trava: nenhuma função do banco pode depender da chave antiga num
-- ON CONFLICT — sem a restrição, ela quebraria na hora de rodar
do $$
declare
  v_funcoes text;
begin
  select string_agg(p.proname, ', ')
    into v_funcoes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ilike '%pedido_itens%'
     and p.prosrc ~* 'on\s+conflict\s*\(\s*pedido_id\s*,\s*produto_id\s*\)';
  if v_funcoes is not null then
    raise exception 'Funções usam ON CONFLICT (pedido_id, produto_id) em pedido_itens: %', v_funcoes;
  end if;
end;
$$;

alter table public.pedido_itens
  drop constraint pedido_itens_pedido_id_produto_id_key;

alter table public.pedido_itens
  add constraint pedido_itens_pedido_produto_preco_key
  unique (pedido_id, produto_id, preco_unitario);

create or replace function public.agrupar_pedidos(p_pedido_ids uuid[], p_notas text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_qtd         integer;
  v_clientes    integer;
  v_cliente     uuid;
  v_valor       numeric(12,2);
  v_metragem    numeric;
  v_novo        uuid;
  v_numero      bigint;
  v_lista       text;
  v_rastreio    text;
  v_problemas   text;
  v_ref         public.pedidos%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if coalesce(array_length(p_pedido_ids, 1), 0) < 2 then
    raise exception 'Selecione ao menos dois pedidos para agrupar';
  end if;

  perform 1 from public.pedidos where id = any(p_pedido_ids) for update;

  -- Quem não pode entrar, e por quê — para a mensagem apontar o pedido
  select string_agg('#' || p.numero || ' (' || motivo || ')', ', ' order by p.numero)
    into v_problemas
    from public.pedidos p
    cross join lateral (
      select case
               when p.cancelado_em is not null then 'cancelado'
               when p.agrupado_em is not null then 'já agrupado'
               when p.cobranca_gerada_em is not null or p.boleto_id is not null then 'cobrança já gerada — fature este sozinho'
               when p.nf_numero is not null then 'nota já emitida'
               when public.status_atual(p.id) <> 'pronto' then 'não está em Estampa pronta'
             end as motivo
    ) m
   where p.id = any(p_pedido_ids)
     and m.motivo is not null;

  if v_problemas is not null then
    raise exception 'Não dá para agrupar: %', v_problemas;
  end if;

  select count(*), count(distinct p.cliente_id), min(p.cliente_id::text)::uuid
    into v_qtd, v_clientes, v_cliente
    from public.pedidos p
   where p.id = any(p_pedido_ids);

  if v_qtd <> array_length(p_pedido_ids, 1) then
    raise exception 'Pedido não encontrado';
  end if;
  if v_clientes <> 1 then
    raise exception 'Só é possível agrupar pedidos do mesmo cliente';
  end if;

  with base as (
    select p.id, p.numero,
           coalesce(p.metragem_impressa, (select sum(i.metros_total) from public.pedido_itens i where i.pedido_id = p.id)) as metros,
           coalesce(nullif(p.total, 0),   (select sum(i.subtotal)     from public.pedido_itens i where i.pedido_id = p.id)) as valor
      from public.pedidos p where p.id = any(p_pedido_ids)
  )
  select sum(metros),
         sum(valor),
         'Pedidos agrupados: ' || string_agg('#' || numero || ' (' ||
            to_char(metros, 'FM999G999G990D00') || ' m · R$ ' ||
            to_char(valor,  'FM999G999G990D00') || ')', ', ' order by numero)
    into v_metragem, v_valor, v_rastreio
    from base;

  if v_metragem is null or v_metragem <= 0 then
    raise exception 'Pedidos sem metragem não podem ser agrupados';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'Pedidos sem valor não podem ser agrupados';
  end if;

  select * into v_ref from public.pedidos where id = p_pedido_ids[1];

  select string_agg('#' || numero, ', ' order by numero) into v_lista
    from public.pedidos where id = any(p_pedido_ids);

  insert into public.pedidos (
    cliente_id, criado_por, notas, forma_pagamento,
    metragem_impressa, romaneio_rolos, romaneio_saldo, romaneio_gerado_em,
    custo_papel_por_metro, custo_tinta_por_metro, custo_calandra_por_metro
  )
  select
    v_cliente, auth.uid(),
    left(coalesce(p_notas || E'\n\n', '') || v_rastreio, 2000),
    v_ref.forma_pagamento,
    v_metragem, sum(p.romaneio_rolos),
    left(string_agg('#' || p.numero || ': ' || p.romaneio_saldo, ' | ' order by p.numero)
         filter (where p.romaneio_saldo is not null), 500),
    now(),
    v_ref.custo_papel_por_metro, v_ref.custo_tinta_por_metro, v_ref.custo_calandra_por_metro
  from public.pedidos p where p.id = any(p_pedido_ids)
  returning id, numero into v_novo, v_numero;

  -- Uma linha por arte e preço: cada arte leva o preço do metro do pedido de
  -- onde veio. A mesma arte em dois pedidos com o mesmo preço vira quantidade
  -- somada; com preços diferentes, uma linha para cada preço
  insert into public.pedido_itens
    (pedido_id, produto_id, sku, nome, preco_unitario,
     quantidade_pedida, quantidade_faturada, metros_por_unidade)
  select v_novo, i.produto_id,
         min(i.sku), min(i.nome), i.preco_unitario,
         sum(i.quantidade_pedida), sum(i.quantidade_faturada), max(i.metros_por_unidade)
    from public.pedido_itens i
   where i.pedido_id = any(p_pedido_ids)
   group by i.produto_id, i.preco_unitario;

  -- O valor é a soma exata dos originais, cada um com o seu preço — nunca
  -- metragem × um preço médio
  update public.pedidos set total = v_valor where id = v_novo;

  -- "pronto" um segundo depois do "recebido" gravado pelo trigger, senão
  -- os dois ficam com o mesmo horário e o status atual fica ambíguo
  insert into public.pedido_status_historico (pedido_id, status, origem, observacao, criado_por, created_at)
  values (v_novo, 'pronto', 'sistema',
          left('Agrupamento dos pedidos ' || v_lista || ' — R$ ' || to_char(v_valor, 'FM999G999G990D00'), 500),
          auth.uid(), now() + interval '1 second');

  update public.pedidos set agrupado_em = v_novo where id = any(p_pedido_ids);

  insert into public.pedido_status_historico (pedido_id, status, origem, observacao, criado_por)
  select id, 'faturado', 'admin', 'Agrupado no pedido #' || v_numero, auth.uid()
    from public.pedidos where id = any(p_pedido_ids);

  return v_novo;
end;
$function$;
