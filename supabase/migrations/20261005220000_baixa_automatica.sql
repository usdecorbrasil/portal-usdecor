-- ============================================================================
-- Baixa automática de pagamento
--
-- A sincronização (GitHub Actions de hora em hora → /api/cron/pagamentos) consulta no Bling as
-- contas a receber dos pedidos faturados e, quando uma está recebida, chama
-- as duas funções abaixo. Elas são idempotentes: só gravam onde ainda não há
-- pagamento, então rodar várias vezes não duplica nada.
--
-- Rodam com a chave de serviço (não há sessão no cron), por isso só o
-- service_role executa. O prefixo "sincronizar_" é de propósito: o banco já
-- tem `registrar_pagamento_parcela` (baixa manual), com outro retorno, e a
-- primeira versão desta migration tentou substituí-la — o Postgres recusou. `pago_em` é a hora em que o portal identificou o
-- recebimento no Bling — o Bling não expõe a data exata da liquidação na
-- conta, só a situação e o saldo.
-- ============================================================================

alter table public.pedidos
  add column if not exists pago_em    timestamptz,
  add column if not exists valor_pago numeric(12,2);

comment on column public.pedidos.pago_em is
  'Quando o portal identificou no Bling que a cobrança do pedido foi recebida por inteiro.';
comment on column public.pedidos.valor_pago is
  'Soma recebida, conforme as contas a receber do Bling.';

-- Parcela recebida. Devolve true quando gravou agora, false quando já estava.
create or replace function public.sincronizar_pagamento_parcela(
  p_parcela_id uuid,
  p_pago_em    timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_ok boolean;
begin
  update pedido_parcelas
     set pago_em = coalesce(p_pago_em, now())
   where id = p_parcela_id
     and pago_em is null;
  get diagnostics v_ok = row_count;
  return v_ok > 0;
end;
$$;

-- Pedido recebido por inteiro: grava o pagamento e deixa o rastro no
-- andamento, com origem 'bling'. A etapa não muda aqui — `status` é derivado
-- do último registro, então repetimos o status atual com a observação.
-- Devolve true quando gravou agora, false quando já estava pago.
create or replace function public.sincronizar_pagamento_pedido(
  p_pedido_id  uuid,
  p_valor_pago numeric,
  p_pago_em    timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_atual pedido_status;
  v_ok    integer;
begin
  update pedidos
     set pago_em    = coalesce(p_pago_em, now()),
         valor_pago = p_valor_pago
   where id = p_pedido_id
     and pago_em is null;
  get diagnostics v_ok = row_count;
  if v_ok = 0 then
    return false;
  end if;

  v_atual := status_atual(p_pedido_id);
  if v_atual is not null then
    begin
      insert into pedido_status_historico (pedido_id, status, origem, observacao)
      values (p_pedido_id, v_atual, 'bling', 'Pagamento identificado');
    exception
      when unique_violation then
        -- Se o histórico não aceita repetir a etapa, o pagamento fica
        -- registrado em pedidos.pago_em mesmo assim
        null;
    end;
  end if;

  return true;
end;
$$;

revoke all on function public.sincronizar_pagamento_parcela(uuid, timestamptz) from public;
revoke all on function public.sincronizar_pagamento_pedido(uuid, numeric, timestamptz) from public;
grant execute on function public.sincronizar_pagamento_parcela(uuid, timestamptz) to service_role;
grant execute on function public.sincronizar_pagamento_pedido(uuid, numeric, timestamptz) to service_role;
