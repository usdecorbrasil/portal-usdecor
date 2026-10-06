-- ============================================================================
-- Limite de crédito consumido por boletos
--
-- O crédito em uso de um cliente é o que ele deve ou vai dever em boleto:
--   1. pedidos faturados (faturado, NF emitida, expedido, entregue) com boleto
--      e ainda não pagos — no parcelado, a soma das parcelas em aberto; no à
--      vista, o valor cobrado inteiro;
--   2. pedidos confirmados e ainda não faturados (recebido até pronto) com
--      boleto — o valor cobrado que já se conhece (antes do romaneio é zero,
--      porque o total nasce da metragem).
-- Cancelados, fechados, aguardando confirmação e as demais formas (Pix,
-- cartão) ficam de fora: não são contas a receber em boleto.
--
-- `cliente_pode_parcelar` passa a usar essa conta. Mesmo nome e assinatura da
-- função que `criar_pedido` e o carrinho já chamam; só o corpo muda.
-- ============================================================================

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
  -- Cliente só consulta o próprio crédito; a equipe, qualquer um
  if not is_admin()
     and p_cliente_id is distinct from (select cliente_id from profiles where id = auth.uid()) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select coalesce(sum(x.valor), 0) into v_total
    from (
      -- 1. faturados com boleto, não pagos
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
         and p.pago_em is null
         and p.forma_pagamento like 'boleto%'
         and public.status_atual(p.id) in ('faturado', 'nf_emitida', 'expedido', 'entregue')

      union all

      -- 2. confirmados, ainda não faturados, com boleto
      select coalesce(public.valor_cobranca_pedido(p.id), 0)
        from pedidos p
       where p.cliente_id = p_cliente_id
         and p.cancelado_em is null
         and p.forma_pagamento like 'boleto%'
         and public.status_atual(p.id) in ('recebido', 'impressao', 'estampando', 'corte_costura', 'pronto')
    ) x;

  return v_total;
end;
$$;

-- Pode parcelar quando há limite definido e sobra crédito depois do que já
-- está em boleto. Limite zero continua significando "sem parcelado".
create or replace function public.cliente_pode_parcelar(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select c.limite_credito > 0
     and (c.limite_credito - public.credito_em_uso(p_cliente_id)) > 0
    from clientes c
   where c.id = p_cliente_id;
$$;

-- Para a lista de clientes do painel, numa chamada só
create or replace function public.clientes_credito_em_uso()
returns table (cliente_id uuid, em_uso numeric)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
    select c.id, public.credito_em_uso(c.id)
      from clientes c
     where c.arquivado is distinct from true;
end;
$$;

revoke all on function public.credito_em_uso(uuid) from public;
revoke all on function public.cliente_pode_parcelar(uuid) from public;
revoke all on function public.clientes_credito_em_uso() from public;
grant execute on function public.credito_em_uso(uuid) to authenticated, service_role;
grant execute on function public.cliente_pode_parcelar(uuid) to authenticated, service_role;
grant execute on function public.clientes_credito_em_uso() to authenticated, service_role;
