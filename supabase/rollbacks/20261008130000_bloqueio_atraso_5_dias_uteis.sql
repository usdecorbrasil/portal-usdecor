-- Desfaz 20261008130000_bloqueio_atraso_5_dias_uteis: volta a trava de
-- criação (qualquer boleto vencido) e tira o gatilho de andamento.

drop trigger if exists status_bloquear_por_atraso on public.pedido_status_historico;
drop function if exists public.status_bloquear_por_atraso();
drop function if exists public.clientes_bloqueados_por_atraso();

-- Contagem original: qualquer boleto (parcela) vencido e não pago.
create or replace function public.cliente_boletos_vencidos(p_cliente_id uuid)
returns integer
language sql
stable
security definer
set search_path = 'public'
as $$
  select count(*)::integer
    from pedido_parcelas pp
    join pedidos p on p.id = pp.pedido_id
    left join clientes c on c.id = p.cliente_id
   where p.cliente_id = p_cliente_id
     and p.cancelado_em is null
     and pp.pago_em is null
     and pp.vencimento < current_date
     and (c.atraso_liberado_em is null or pp.vencimento > c.atraso_liberado_em::date);
$$;

drop function if exists public.cliente_boletos_atraso(uuid);

create or replace function public.pedidos_bloquear_por_atraso()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return new;
  end if;

  if exists (select 1 from profiles where id = v_uid and role = 'cliente')
     and public.cliente_bloqueado_por_atraso(new.cliente_id) then
    raise exception 'Há boleto em atraso. Regularize para enviar novos pedidos.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists pedidos_bloquear_por_atraso on public.pedidos;
create trigger pedidos_bloquear_por_atraso
  before insert on public.pedidos
  for each row
  execute function public.pedidos_bloquear_por_atraso();
