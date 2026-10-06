-- ============================================================================
-- Consumo de tecido do cliente pelo pedido (18D, parte A)
--
-- Ao sair da Impressão para Estampando — o momento do romaneio, quando a
-- metragem existe — o pedido precisa dizer de qual tecido do cliente saiu.
-- O tecido fica em `pedidos.tecido_id`; a baixa no estoque é um movimento
-- de consumo ligado ao pedido, com a metragem impressa.
--
-- A baixa é feita por gatilho em `pedidos`, não pela tela: assim o ajuste de
-- metragem (admin_ajustar_metragem) e qualquer outro caminho que mude a
-- metragem impressa mantêm o estoque fiel sem código a mais. O gatilho acerta
-- a diferença: metragem a mais vira consumo; a menos, devolução (ajuste
-- positivo ligado ao pedido).
--
-- Saldo insuficiente bloqueia (decisão de 06/10/2026): estoque negativo é
-- estoque de mentira. Quem precisa estampar lança a entrada antes.
--
-- Cancelar depois de Estampando não devolve tecido — ele já foi estampado.
-- ============================================================================

alter table public.pedidos
  add column if not exists tecido_id uuid references public.tecidos(id) on delete restrict;

create index if not exists pedidos_tecido_idx on public.pedidos (tecido_id);

comment on column public.pedidos.tecido_id is
  'Tecido do cliente de onde este pedido consome. Obrigatório para lançar Estampando; a baixa é por gatilho.';

-- Saldo atual de um tecido de um cliente (0 quando nunca houve movimento)
create or replace function public.saldo_tecido(p_cliente_id uuid, p_tecido_id uuid)
returns numeric
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce((
    select s.saldo_metros from tecido_saldos s
     where s.cliente_id = p_cliente_id and s.tecido_id = p_tecido_id
  ), 0);
$$;

-- Escolhe o tecido do pedido antes do romaneio, conferindo que o saldo cobre
-- a metragem prevista. Mensagem já legível para a tela.
create or replace function public.definir_tecido_pedido(
  p_pedido_id uuid,
  p_tecido_id uuid,
  p_metragem  numeric
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_cliente uuid;
  v_atual   pedido_status;
  v_saldo   numeric;
  v_nome    text;
begin
  if not is_admin_producao() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select cliente_id into v_cliente from pedidos where id = p_pedido_id;
  if v_cliente is null then
    raise exception 'Pedido não encontrado';
  end if;

  v_atual := status_atual(p_pedido_id);
  if v_atual not in ('recebido', 'impressao') then
    raise exception 'O tecido só pode ser escolhido antes de Estampando';
  end if;

  select nome into v_nome from tecidos where id = p_tecido_id and ativo;
  if v_nome is null then
    raise exception 'Tecido inativo ou inexistente';
  end if;

  v_saldo := public.saldo_tecido(v_cliente, p_tecido_id);
  if p_metragem is not null and v_saldo < p_metragem then
    raise exception
      'Saldo insuficiente de %: % m disponíveis para % m. Lance a entrada do tecido antes de estampar.',
      v_nome, to_char(v_saldo, 'FM999G999G990D00'), to_char(p_metragem, 'FM999G999G990D00');
  end if;

  update pedidos set tecido_id = p_tecido_id where id = p_pedido_id;
end;
$$;

-- Estampando exige tecido escolhido
create or replace function public.pedidos_estampando_exige_tecido()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.status = 'estampando'
     and exists (select 1 from pedidos p where p.id = new.pedido_id and p.tecido_id is null) then
    raise exception 'Escolha o tecido do cliente antes de lançar Estampando.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_estampando_exige_tecido on public.pedido_status_historico;
create trigger pedidos_estampando_exige_tecido
  before insert on public.pedido_status_historico
  for each row
  execute function public.pedidos_estampando_exige_tecido();

-- Mantém o consumo do pedido igual à metragem impressa. Roda quando a
-- metragem ou o tecido mudam; a diferença vira movimento ligado ao pedido.
create or replace function public.pedidos_sincronizar_consumo_tecido()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_consumido numeric;
  v_delta     numeric;
  v_saldo     numeric;
  v_nome      text;
begin
  if new.tecido_id is null or new.metragem_impressa is null then
    return new;
  end if;

  -- Consumo líquido já lançado para este pedido neste tecido
  select coalesce(sum(case m.tipo when 'consumo' then m.metros
                                  when 'ajuste'  then -m.metros
                                  else 0 end), 0)
    into v_consumido
    from tecido_movimentos m
   where m.pedido_id = new.id and m.tecido_id = new.tecido_id;

  v_delta := round(new.metragem_impressa - v_consumido, 3);
  if v_delta = 0 then
    return new;
  end if;

  if v_delta > 0 then
    v_saldo := public.saldo_tecido(new.cliente_id, new.tecido_id);
    if v_saldo < v_delta then
      select nome into v_nome from tecidos where id = new.tecido_id;
      raise exception
        'Saldo insuficiente de %: % m disponíveis para % m. Lance a entrada do tecido antes.',
        coalesce(v_nome, 'tecido'), to_char(v_saldo, 'FM999G999G990D00'), to_char(v_delta, 'FM999G999G990D00');
    end if;

    insert into tecido_movimentos (cliente_id, tecido_id, pedido_id, tipo, metros, observacao, autor_id)
    values (new.cliente_id, new.tecido_id, new.id, 'consumo', v_delta,
            case when v_consumido = 0 then 'Romaneio do pedido #' || new.numero
                 else 'Ajuste de metragem do pedido #' || new.numero end,
            auth.uid());
  else
    insert into tecido_movimentos (cliente_id, tecido_id, pedido_id, tipo, metros, observacao, autor_id)
    values (new.cliente_id, new.tecido_id, new.id, 'ajuste', -v_delta,
            'Devolução por ajuste de metragem do pedido #' || new.numero,
            auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists pedidos_sincronizar_consumo_tecido on public.pedidos;
create trigger pedidos_sincronizar_consumo_tecido
  after update of metragem_impressa, tecido_id on public.pedidos
  for each row
  execute function public.pedidos_sincronizar_consumo_tecido();

revoke all on function public.saldo_tecido(uuid, uuid) from public;
revoke all on function public.definir_tecido_pedido(uuid, uuid, numeric) from public;
grant execute on function public.saldo_tecido(uuid, uuid) to authenticated, service_role;
grant execute on function public.definir_tecido_pedido(uuid, uuid, numeric) to authenticated, service_role;
