-- Desfaz 20261008160000: volta agrupar_pedidos ao corpo anterior (itens
-- copiados linha a linha, mensagem genérica).

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
  v_preco_medio numeric;
  v_metragem    numeric;
  v_novo        uuid;
  v_numero      bigint;
  v_lista       text;
  v_rastreio    text;
  v_ref         public.pedidos%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if coalesce(array_length(p_pedido_ids, 1), 0) < 2 then
    raise exception 'Selecione ao menos dois pedidos para agrupar';
  end if;

  perform 1 from public.pedidos where id = any(p_pedido_ids) for update;

  select count(*), count(distinct p.cliente_id), min(p.cliente_id::text)::uuid
    into v_qtd, v_clientes, v_cliente
    from public.pedidos p
   where p.id = any(p_pedido_ids)
     and p.cancelado_em is null
     and p.agrupado_em is null
     and p.cobranca_gerada_em is null
     and p.boleto_id is null
     and p.nf_numero is null
     and public.status_atual(p.id) = 'pronto';

  if v_qtd <> array_length(p_pedido_ids, 1) then
    raise exception 'Todos os pedidos precisam estar em "Pedido pronto" e sem cobrança gerada';
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
         round(sum(valor) / nullif(sum(metros), 0), 4),
         'Pedidos agrupados: ' || string_agg('#' || numero || ' (' ||
            to_char(metros, 'FM999G999G990D00') || ' m · R$ ' ||
            to_char(valor,  'FM999G999G990D00') || ')', ', ' order by numero)
    into v_metragem, v_preco_medio, v_rastreio
    from base;

  if v_metragem is null or v_metragem <= 0 then
    raise exception 'Pedidos sem metragem não podem ser agrupados';
  end if;
  if v_preco_medio is null or v_preco_medio <= 0 then
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

  insert into public.pedido_itens
    (pedido_id, produto_id, sku, nome, preco_unitario,
     quantidade_pedida, quantidade_faturada, metros_por_unidade)
  select v_novo, produto_id, sku, nome, v_preco_medio,
         quantidade_pedida, quantidade_faturada, metros_por_unidade
    from public.pedido_itens
   where pedido_id = any(p_pedido_ids);

  insert into public.pedido_status_historico (pedido_id, status, origem, observacao, criado_por, created_at)
  values (v_novo, 'pronto', 'sistema',
          left('Agrupamento dos pedidos ' || v_lista || ' — preço médio R$ ' || v_preco_medio || '/m', 500),
          auth.uid(), now() + interval '1 second');

  update public.pedidos set agrupado_em = v_novo where id = any(p_pedido_ids);

  insert into public.pedido_status_historico (pedido_id, status, origem, observacao, criado_por)
  select id, 'faturado', 'admin', 'Agrupado no pedido #' || v_numero, auth.uid()
    from public.pedidos where id = any(p_pedido_ids);

  return v_novo;
end;
$function$;
