-- ============================================================================
-- "Pedido fechado" sem depender da baixa financeira (item 13)
--
-- A regra antiga só aceitava 'fechado' com baixa no Bling (à vista) ou todas
-- as parcelas pagas (parcelado). Na prática a baixa chega por fora do portal
-- e o pedido ficava "aguardando o Bling" para sempre. A partir daqui, fechar
-- exige o que o portal controla:
--
--   1. a cobrança existe — boleto/Pix gerados, link do cartão enviado, ou o
--      pagamento já identificado;
--   2. a nota fiscal está definida — emitida, ou dispensada (emitir_nf=false).
--
-- O pagamento continua sendo registrado em pedidos.pago_em / parcelas pela
-- sincronização automática; fechar não marca nada como pago.
--
-- Quem fecha é a equipe, pela RPC admin_fechar_pedido (origem 'admin').
-- ============================================================================

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

  -- Reimpressão só pode voltar para a etapa de impressão
  if new.reimpressao_motivo is not null and new.status <> 'impressao' then
    raise exception 'Reimpressão só retorna o pedido para a etapa Impressão';
  end if;

  return new;
end;
$function$;

-- Fechamento pela equipe. O gatilho acima faz a validação; aqui só o portão
-- e a etapa de origem.
create or replace function public.admin_fechar_pedido(
  p_pedido_id  uuid,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_atual pedido_status;
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  v_atual := status_atual(p_pedido_id);
  if v_atual is null then
    raise exception 'Pedido não encontrado';
  end if;
  if v_atual = 'fechado' then
    raise exception 'Este pedido já está fechado';
  end if;
  if v_atual not in ('faturado', 'nf_emitida', 'expedido', 'entregue') then
    raise exception 'O pedido só pode ser fechado depois de faturado';
  end if;

  insert into pedido_status_historico (pedido_id, status, origem, observacao, criado_por)
  values (p_pedido_id, 'fechado', 'admin', nullif(trim(p_observacao), ''), auth.uid());
end;
$$;

revoke all on function public.admin_fechar_pedido(uuid, text) from public;
grant execute on function public.admin_fechar_pedido(uuid, text) to authenticated;
