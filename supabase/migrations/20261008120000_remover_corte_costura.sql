-- ============================================================================
-- Corte/costura sai do processo (decidido pelo dono em 08/10/2026)
--
-- A etapa deixa de existir. O que se fatura é impressão e estampa; a costura
-- não faz mais parte do fluxo. O valor `corte_costura` continua no enum
-- `pedido_status` (o histórico dos pedidos antigos aponta para ele), mas:
--   1. nenhum lançamento novo é aceito (`validar_status_pedido`);
--   2. os pedidos que estavam em Corte/costura voltam para Estampa pronta,
--      onde serão faturados — um registro 'pronto' com origem 'sistema';
--   3. `credito_em_uso` deixa de citar a etapa.
--
-- Pedido que já tinha 'pronto' no histórico (passou pela ordem antiga, em
-- que a costura vinha antes de Pronto, ou pela ordem de hoje de manhã, em
-- que vinha depois do faturamento) não ganha um segundo 'pronto': se já foi
-- faturado, o próximo passo é fechar; se não foi, o último 'pronto' já é o
-- estado certo depois que a etapa some da tela.
-- ============================================================================

-- 2. Pedidos parados em Corte/costura voltam para Estampa pronta ----------------
insert into public.pedido_status_historico (pedido_id, status, origem, observacao)
select p.id, 'pronto', 'sistema',
       'Etapa Corte/costura descontinuada em 08/10/2026: pedido movido para Estampa pronta'
  from public.pedidos p
 where public.status_atual(p.id) = 'corte_costura'
   and p.cancelado_em is null
   and not exists (
     select 1 from public.pedido_status_historico h
      where h.pedido_id = p.id and h.status = 'pronto'
   );

-- 1. Nada novo entra em Corte/costura -------------------------------------------

create or replace function public.validar_status_pedido()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ped        public.pedidos%rowtype;
  v_cobranca   boolean;
  v_nf         boolean;
begin
  select * into v_ped from public.pedidos p where p.id = new.pedido_id;

  -- Pedido cancelado não avança mais
  if v_ped.cancelado_em is not null then
    raise exception 'Pedido cancelado não aceita novas etapas';
  end if;

  if new.status = 'fechado' then
    -- Cobrança gerada: boleto/Pix, link do cartão ou pagamento identificado
    v_cobranca :=
         v_ped.cobranca_gerada_em is not null
      or v_ped.link_boleto is not null
      or v_ped.link_pix is not null
      or v_ped.link_pagamento is not null
      or v_ped.pago_em is not null
      or v_ped.baixa_financeira_em is not null
      or exists (
           select 1 from public.pedido_parcelas pp
            where pp.pedido_id = new.pedido_id
              and (pp.link_boleto is not null or pp.pago_em is not null)
         );
    if not v_cobranca then
      raise exception 'Pedido só pode ser fechado depois de a cobrança ser gerada (boleto, Pix ou link do cartão)';
    end if;

    -- Nota fiscal emitida ou dispensada
    v_nf :=
         coalesce(v_ped.emitir_nf, true) = false
      or v_ped.bling_nf_id is not null
      or exists (
           select 1 from public.pedido_status_historico h
            where h.pedido_id = new.pedido_id and h.status = 'nf_emitida'
         );
    if not v_nf then
      raise exception 'Pedido só pode ser fechado com a nota fiscal emitida ou dispensada';
    end if;
  end if;

  -- Corte/costura deixou de existir no processo (08/10/2026). O valor segue
  -- no enum por causa do histórico dos pedidos antigos, mas nada novo entra
  if new.status = 'corte_costura' then
    raise exception 'A etapa Corte/costura foi descontinuada.';
  end if;

  -- Reimpressão só pode voltar para a etapa de impressão
  if new.reimpressao_motivo is not null and new.status <> 'impressao' then
    raise exception 'Reimpressão só retorna o pedido para a etapa Impressão';
  end if;

  return new;
end;
$function$;

-- 3. Crédito em uso sem a etapa -----------------------------------------------

create or replace function public.credito_em_uso(p_cliente_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_total numeric(12,2);
begin
  if not is_admin()
     and p_cliente_id is distinct from (select cliente_id from profiles where id = auth.uid()) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select coalesce(sum(x.valor), 0) into v_total
    from (
      select case
               when exists (select 1 from pedido_parcelas pp where pp.pedido_id = p.id)
                 then (select coalesce(sum(pp.valor), 0)
                         from pedido_parcelas pp
                        where pp.pedido_id = p.id and pp.pago_em is null)
               else coalesce(public.valor_cobranca_pedido(p.id), 0)
             end as valor
        from pedidos p
       where p.cliente_id = p_cliente_id
         and p.cancelado_em is null
         and p.agrupado_em is null
         and p.pago_em is null
         and p.forma_pagamento like 'boleto%'
         and public.status_atual(p.id) in ('faturado', 'nf_emitida', 'expedido', 'entregue')

      union all

      select coalesce(public.valor_cobranca_pedido(p.id), 0)
        from pedidos p
       where p.cliente_id = p_cliente_id
         and p.cancelado_em is null
         and p.agrupado_em is null
         and p.forma_pagamento like 'boleto%'
         and public.status_atual(p.id) in ('recebido', 'impressao', 'estampando', 'pronto')
    ) x;

  return v_total;
end;
$$;
