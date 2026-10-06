-- Desfaz 20261006240000_fechar_pedido_sem_baixa.sql
-- Volta validar_status_pedido ao corpo anterior (exigia baixa financeira ou
-- todas as parcelas pagas) e remove admin_fechar_pedido. Etapas 'fechado' já
-- lançadas ficam no histórico.

drop function if exists public.admin_fechar_pedido(uuid, text);

create or replace function public.validar_status_pedido()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_baixa     timestamptz;
  v_canc      timestamptz;
  v_forma     text;
  v_pendentes integer;
begin
  select p.baixa_financeira_em, p.cancelado_em, p.forma_pagamento
    into v_baixa, v_canc, v_forma
    from public.pedidos p
   where p.id = new.pedido_id;

  -- Pedido cancelado não avança mais
  if v_canc is not null then
    raise exception 'Pedido cancelado não aceita novas etapas';
  end if;

  -- "Pedido fechado" exige baixa financeira (à vista) ou todas as parcelas pagas (parcelado)
  if new.status = 'fechado' then
    if v_forma = 'boleto_parcelado' then
      select count(*) into v_pendentes
        from public.pedido_parcelas
       where pedido_id = new.pedido_id
         and pago_em is null;

      if v_pendentes > 0 then
        raise exception 'Pedido parcelado só pode ser fechado após todas as parcelas pagas';
      end if;
    else
      if v_baixa is null then
        raise exception 'Pedido só pode ser fechado após a baixa financeira no Bling';
      end if;
    end if;
  end if;

  -- Reimpressão só pode voltar para a etapa de impressão
  if new.reimpressao_motivo is not null and new.status <> 'impressao' then
    raise exception 'Reimpressão só retorna o pedido para a etapa Impressão';
  end if;

  return new;
end;
$function$;
