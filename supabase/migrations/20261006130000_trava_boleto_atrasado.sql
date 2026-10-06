-- ============================================================================
-- Boleto atrasado: trava de novos pedidos e liberação manual
--
-- Cliente com boleto vencido e não pago não envia pedido novo. A regra vive
-- no banco (gatilho em pedidos) para valer por qualquer caminho; a tela e a
-- Server Action só antecipam a mensagem.
--
-- O dono pode liberar um cliente à mão, com motivo. A liberação vale "até o
-- próximo boleto vencer": fica guardada a hora em que foi dada, e só contam
-- como bloqueio os boletos cujo vencimento é posterior a ela. Boletos que já
-- estavam vencidos na hora da liberação deixam de travar; o próximo que
-- vencer depois dela trava de novo.
--
-- Só o cliente é travado: pedido criado pela equipe (novo pedido no painel,
-- agrupador) não passa pelo gatilho, porque quem decide esse caso é a equipe.
-- ============================================================================

alter table public.clientes
  add column if not exists atraso_liberado_em     timestamptz,
  add column if not exists atraso_liberado_por    uuid,
  add column if not exists atraso_liberado_motivo text;

comment on column public.clientes.atraso_liberado_em is
  'Liberação manual da trava por boleto vencido. Vale para boletos vencidos até esta data; o próximo a vencer trava de novo.';

-- Quantos boletos vencidos e não pagos travam o cliente hoje.
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

create or replace function public.cliente_bloqueado_por_atraso(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select public.cliente_boletos_vencidos(p_cliente_id) > 0;
$$;

-- Gatilho: cliente com boleto vencido não cria pedido. Testa o papel de quem
-- está logado, não a coluna do pedido: a equipe cria pedidos em nome do
-- cliente e não pode ser travada por isso.
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

-- Liberação manual, só admin/financeiro, com motivo.
create or replace function public.admin_liberar_atraso_boleto(
  p_cliente_id uuid,
  p_motivo     text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Descreva o motivo da liberação (mín. 10 caracteres)';
  end if;

  update clientes
     set atraso_liberado_em     = now(),
         atraso_liberado_por    = auth.uid(),
         atraso_liberado_motivo = v_motivo
   where id = p_cliente_id;

  if not found then
    raise exception 'Cliente não encontrado';
  end if;
end;
$$;

revoke all on function public.cliente_boletos_vencidos(uuid) from public;
revoke all on function public.cliente_bloqueado_por_atraso(uuid) from public;
revoke all on function public.admin_liberar_atraso_boleto(uuid, text) from public;
grant execute on function public.cliente_boletos_vencidos(uuid) to authenticated, service_role;
grant execute on function public.cliente_bloqueado_por_atraso(uuid) to authenticated, service_role;
grant execute on function public.admin_liberar_atraso_boleto(uuid, text) to authenticated;
