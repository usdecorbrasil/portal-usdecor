-- Edição geral de contas a pagar e cobranças a receber pelo financeiro
-- (pedido do dono, 12/10/2026): erro de cadastro ou de conferência se
-- corrige na própria lista, com motivo e rastro.

-- ---------------------------------------------- conta a pagar: tudo editável
-- Assinatura muda (campos novos), então a antiga sai para não deixar a
-- chamada por nome ambígua no PostgREST. Campo nulo = mantém.
drop function if exists public.admin_alterar_conta_pagar(uuid, date, numeric, text);

create or replace function public.admin_alterar_conta_pagar(
  p_id            uuid,
  p_vencimento    date,
  p_valor         numeric,
  p_motivo        text,
  p_descricao     text default null,
  p_categoria_id  uuid default null,
  p_forma         text default null,
  p_cartao_id     uuid default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
  c         contas_pagar%rowtype;
  v_forma   text;
  v_cartao  uuid;
  v_desc    text;
  v_mudou   text[] := '{}';
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Descreva o motivo (mín. 10 caracteres)';
  end if;
  if p_vencimento is null or p_valor is null or p_valor <= 0 then
    raise exception 'Informe vencimento e valor maior que zero';
  end if;

  select * into c from contas_pagar where id = p_id and pago_em is null and cancelada_em is null for update;
  if not found then
    raise exception 'Conta não encontrada, paga ou cancelada';
  end if;

  v_forma := coalesce(p_forma, c.forma);
  if v_forma not in ('credito', 'boleto', 'a_pagar') then
    raise exception 'Conta em aberto só pode ser crédito, boleto ou a pagar (pago/Pix/débito entram já quitados: registre o pagamento)';
  end if;
  -- Cartão: obrigatório no crédito, proibido fora dele
  if v_forma = 'credito' then
    v_cartao := coalesce(p_cartao_id, c.cartao_id);
    if v_cartao is null then
      raise exception 'Compra no crédito exige o cartão';
    end if;
    if not exists (select 1 from cartoes_credito where id = v_cartao and ativo) then
      raise exception 'Cartão de crédito não encontrado ou inativo';
    end if;
  else
    v_cartao := null;
  end if;
  v_desc := coalesce(nullif(btrim(p_descricao), ''), c.descricao);
  if p_categoria_id is not null and not exists (select 1 from categorias_despesa where id = p_categoria_id) then
    raise exception 'Categoria não encontrada';
  end if;

  if c.vencimento <> p_vencimento then v_mudou := v_mudou || ('vencimento ' || to_char(c.vencimento, 'DD/MM/YYYY')); end if;
  if c.valor <> round(p_valor, 2) then v_mudou := v_mudou || ('R$ ' || replace(to_char(c.valor, 'FM999999990.00'), '.', ',')); end if;
  if c.forma <> v_forma then v_mudou := v_mudou || ('forma ' || c.forma); end if;
  if c.cartao_id is distinct from v_cartao then v_mudou := v_mudou || 'cartão'::text; end if;
  if c.descricao <> v_desc then v_mudou := v_mudou || ('descrição "' || c.descricao || '"'); end if;
  if p_categoria_id is not null and c.categoria_id is distinct from p_categoria_id then v_mudou := v_mudou || 'categoria'::text; end if;

  update contas_pagar
     set vencimento   = p_vencimento,
         valor        = round(p_valor, 2),
         forma        = v_forma,
         cartao_id    = v_cartao,
         descricao    = v_desc,
         categoria_id = coalesce(p_categoria_id, categoria_id),
         observacao   = left(coalesce(observacao || ' · ', '')
                        || 'Alterada (antes: ' || coalesce(array_to_string(v_mudou, ', '), 'sem mudança') || '): ' || v_motivo, 1000)
   where id = p_id;
end;
$$;

revoke all on function public.admin_alterar_conta_pagar(uuid, date, numeric, text, text, uuid, text, uuid) from public;
grant execute on function public.admin_alterar_conta_pagar(uuid, date, numeric, text, text, uuid, text, uuid) to authenticated, service_role;

-- ------------------------------- cobrança do pedido: vencimento e valor
-- Parcela (numero informado) ou à vista (numero nulo; aí só o vencimento).
-- A cobrança já emitida no Bling NÃO muda aqui — a tela avisa.
create or replace function public.admin_alterar_cobranca_pedido(
  p_pedido_id      uuid,
  p_numero_parcela integer,
  p_vencimento     date,
  p_valor          numeric default null,
  p_motivo         text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_ped    pedidos%rowtype;
  v_parc   pedido_parcelas%rowtype;
  v_nome   text;
  v_texto  text;
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Descreva o motivo (mín. 10 caracteres)';
  end if;
  if p_vencimento is null then
    raise exception 'Informe o vencimento';
  end if;
  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado';
  end if;
  if v_ped.cancelado_em is not null then
    raise exception 'Pedido cancelado';
  end if;
  select nome into v_nome from profiles where id = auth.uid();

  if p_numero_parcela is not null then
    select * into v_parc from pedido_parcelas where pedido_id = p_pedido_id and numero = p_numero_parcela for update;
    if not found then
      raise exception 'Parcela não encontrada';
    end if;
    if v_parc.pago_em is not null then
      raise exception 'Parcela já recebida: estorne antes de alterar';
    end if;
    if p_valor is not null and p_valor <= 0 then
      raise exception 'Valor precisa ser maior que zero';
    end if;
    update pedido_parcelas
       set vencimento = p_vencimento, valor = coalesce(round(p_valor, 2), valor)
     where pedido_id = p_pedido_id and numero = p_numero_parcela;
    v_texto := 'Parcela ' || p_numero_parcela || ' alterada (antes: vence ' || to_char(v_parc.vencimento, 'DD/MM/YYYY')
               || ', R$ ' || replace(to_char(v_parc.valor, 'FM999999990.00'), '.', ',') || ')';
  else
    if v_ped.pago_em is not null then
      raise exception 'Pedido já recebido: estorne antes de alterar';
    end if;
    if exists (select 1 from pedido_parcelas where pedido_id = p_pedido_id) then
      raise exception 'Pedido parcelado: altere parcela por parcela';
    end if;
    update pedidos set vencimento_avista = p_vencimento where id = p_pedido_id;
    v_texto := 'Vencimento à vista alterado (antes: ' || coalesce(to_char(v_ped.vencimento_avista, 'DD/MM/YYYY'), '—') || ')';
  end if;

  begin
    insert into pedido_status_historico (pedido_id, status, origem, observacao, criado_por)
    values (p_pedido_id, status_atual(p_pedido_id), 'sistema',
            v_texto || coalesce(' por ' || v_nome, '') || ': ' || v_motivo, auth.uid());
  exception when unique_violation then null;
  end;
end;
$$;

revoke all on function public.admin_alterar_cobranca_pedido(uuid, integer, date, numeric, text) from public;
grant execute on function public.admin_alterar_cobranca_pedido(uuid, integer, date, numeric, text) to authenticated, service_role;
