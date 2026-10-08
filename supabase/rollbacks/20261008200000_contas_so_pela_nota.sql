-- Desfaz 20261008200000_contas_so_pela_nota.sql: volta a conta avulsa,
-- exatamente como em 20261008190000, e tira a função de anexar comprovante.

drop function if exists public.admin_anexar_arquivo_despesa(uuid, text);

create or replace function public.admin_criar_conta_pagar(
  p_descricao     text,
  p_fornecedor    text,
  p_categoria_id  uuid,
  p_forma         text,
  p_parcelas      jsonb,
  p_observacao    text default null
)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_desc text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_qtd  integer;
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if v_desc is null or length(v_desc) < 3 then
    raise exception 'Descreva a conta (mín. 3 caracteres)';
  end if;
  if p_forma is null or p_forma not in ('credito', 'boleto', 'a_pagar') then
    raise exception 'Forma inválida para conta a pagar';
  end if;

  select count(*) into v_qtd from public.contas_pagar_validar_parcelas(p_parcelas, null);
  insert into contas_pagar (descricao, fornecedor_nome, categoria_id, forma, parcela, parcelas,
                            valor, vencimento, observacao, criado_por)
  select v_desc, nullif(btrim(coalesce(p_fornecedor, '')), ''), p_categoria_id, p_forma, p.n, v_qtd,
         p.valor, p.vencimento, nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid()
    from public.contas_pagar_validar_parcelas(p_parcelas, null) p;
  return v_qtd;
end;
$$;

revoke all on function public.admin_criar_conta_pagar(text, text, uuid, text, jsonb, text) from public;
grant execute on function public.admin_criar_conta_pagar(text, text, uuid, text, jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';
