-- Excluir cartão de crédito nunca usado (pedido do dono, 12/10/2026).
--
-- Cartão que já aparece em nota (despesas.cartao_id) ou em conta a pagar
-- (contas_pagar.cartao_id) — ou em qualquer outra tabela que venha a
-- referenciá-lo — não sai: é histórico, e o caminho continua sendo desativar.
-- Cartão cadastrado por engano, sem uso nenhum, pode sumir de vez. A tabela
-- não dá DELETE a `authenticated`; só esta função apaga.

create or replace function public.admin_excluir_cartao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_nome text;
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select nome into v_nome from cartoes_credito where id = p_id;
  if v_nome is null then
    raise exception 'Cartão não encontrado';
  end if;
  if exists (select 1 from despesas where cartao_id = p_id)
     or exists (select 1 from contas_pagar where cartao_id = p_id) then
    raise exception 'O cartão % já foi usado em notas ou contas a pagar. Desative-o em vez de excluir.', v_nome
      using errcode = '23503', hint = 'cartao_usado';
  end if;
  begin
    delete from cartoes_credito where id = p_id;
  exception when foreign_key_violation then
    -- Alguma outra tabela (extratos, por exemplo) aponta para ele
    raise exception 'O cartão % já está vinculado a outros registros. Desative-o em vez de excluir.', v_nome
      using errcode = '23503', hint = 'cartao_usado';
  end;
end;
$$;

revoke all on function public.admin_excluir_cartao(uuid) from public;
grant execute on function public.admin_excluir_cartao(uuid) to authenticated, service_role;
