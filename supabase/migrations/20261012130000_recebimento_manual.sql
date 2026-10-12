-- Baixa manual de recebimento pelo financeiro (pedido do dono, 12/10/2026).
--
-- A baixa automática (cron do Bling) continua; isto é para o financeiro
-- confirmar na tela um recebimento que já conferiu (Pix na conta, cartão,
-- dinheiro, ou boleto que o Bling ainda não refletiu). Parcelado: uma
-- parcela por vez; com a última, o pedido fica recebido por inteiro. À vista:
-- o pedido. Fica no andamento com origem 'sistema' e observação com quem
-- confirmou — origem 'admin' é barrada pelo gatilho de boleto atrasado, e
-- receber é justamente o que destrava.

create or replace function public.admin_registrar_recebimento(
  p_pedido_id      uuid,
  p_numero_parcela integer default null,
  p_recebido_em    date default null,
  p_valor          numeric default null,
  p_obs            text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_ped     pedidos%rowtype;
  v_hoje    date := hoje_brasilia();
  v_em      date := coalesce(p_recebido_em, hoje_brasilia());
  v_quando  timestamptz;
  v_obs     text := nullif(btrim(coalesce(p_obs, '')), '');
  v_nome    text;
  v_valor   numeric;
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if v_em > v_hoje then
    raise exception 'A data do recebimento não pode ser futura';
  end if;
  -- Meio-dia de Brasília, para o dia ficar certo em qualquer fuso
  v_quando := (v_em::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo';

  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado';
  end if;
  if v_ped.cancelado_em is not null then
    raise exception 'Pedido cancelado não recebe baixa';
  end if;

  select nome into v_nome from profiles where id = auth.uid();

  if p_numero_parcela is not null then
    update pedido_parcelas
       set pago_em = v_quando
     where pedido_id = p_pedido_id and numero = p_numero_parcela and pago_em is null;
    if not found then
      raise exception 'Parcela não encontrada ou já recebida';
    end if;

    -- Última parcela: o pedido fica recebido por inteiro
    if v_ped.pago_em is null
       and not exists (select 1 from pedido_parcelas where pedido_id = p_pedido_id and pago_em is null) then
      select sum(valor) into v_valor from pedido_parcelas where pedido_id = p_pedido_id;
      update pedidos set pago_em = v_quando, valor_pago = v_valor where id = p_pedido_id;
    end if;
  else
    if exists (select 1 from pedido_parcelas where pedido_id = p_pedido_id) then
      raise exception 'Este pedido é parcelado: confirme o recebimento parcela por parcela';
    end if;
    if v_ped.pago_em is not null then
      raise exception 'Este pedido já está recebido';
    end if;
    v_valor := coalesce(p_valor, valor_cobranca_pedido(p_pedido_id), v_ped.total);
    update pedidos set pago_em = v_quando, valor_pago = round(v_valor, 2) where id = p_pedido_id;
  end if;

  -- Rastro no andamento (a etapa não muda: repete a atual com a observação)
  begin
    insert into pedido_status_historico (pedido_id, status, origem, observacao, criado_por)
    values (
      p_pedido_id,
      status_atual(p_pedido_id),
      'sistema',
      'Recebimento confirmado pelo financeiro'
        || case when p_numero_parcela is not null then ' (parcela ' || p_numero_parcela || ')' else '' end
        || case when v_nome is not null then ' por ' || v_nome else '' end
        || case when v_obs is not null then ': ' || v_obs else '' end,
      auth.uid()
    );
  exception
    when unique_violation then null;
  end;
end;
$$;

revoke all on function public.admin_registrar_recebimento(uuid, integer, date, numeric, text) from public;
grant execute on function public.admin_registrar_recebimento(uuid, integer, date, numeric, text) to authenticated, service_role;
