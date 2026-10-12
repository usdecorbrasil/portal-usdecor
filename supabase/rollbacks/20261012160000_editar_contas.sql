-- Desfaz 20261012160000_editar_contas: volta a alteração só de vencimento/valor.
drop function if exists public.admin_alterar_cobranca_pedido(uuid, integer, date, numeric, text);
drop function if exists public.admin_alterar_conta_pagar(uuid, date, numeric, text, text, uuid, text, uuid);

create or replace function public.admin_alterar_conta_pagar(
  p_id         uuid,
  p_vencimento date,
  p_valor      numeric,
  p_motivo     text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  c        contas_pagar%rowtype;
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

  update contas_pagar
     set vencimento = p_vencimento, valor = round(p_valor, 2),
         observacao = left(coalesce(observacao || ' · ', '')
                      || 'Alterada (' || to_char(c.vencimento, 'DD/MM/YYYY') || ', R$ '
                      || replace(to_char(c.valor, 'FM999999990.00'), '.', ',') || '): ' || v_motivo, 1000)
   where id = p_id;
end;
$$;
revoke all on function public.admin_alterar_conta_pagar(uuid, date, numeric, text) from public;
grant execute on function public.admin_alterar_conta_pagar(uuid, date, numeric, text) to authenticated, service_role;
