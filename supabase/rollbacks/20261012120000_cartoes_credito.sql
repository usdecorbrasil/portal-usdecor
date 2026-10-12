-- Desfaz 20261012120000_cartoes_credito: volta a função sem cartão
-- (a versão de 20261012110000_condicao_pix) e remove tabela e colunas.

drop function if exists public.admin_gerar_contas_despesa(uuid, text, jsonb, uuid, uuid);

drop function if exists public.contas_pagar_validar_parcelas(jsonb, numeric);
create or replace function public.contas_pagar_validar_parcelas(p_parcelas jsonb, p_total numeric)
returns table (n integer, vencimento date, valor numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_qtd   integer;
  v_soma  numeric;
begin
  if p_parcelas is null or jsonb_typeof(p_parcelas) <> 'array' then
    raise exception 'Informe as parcelas (vencimento e valor)';
  end if;
  v_qtd := jsonb_array_length(p_parcelas);
  if v_qtd < 1 or v_qtd > 36 then
    raise exception 'Informe de 1 a 36 parcelas';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_parcelas) e
     where nullif(e->>'vencimento', '') is null
        or nullif(e->>'valor', '') is null
        or (e->>'valor')::numeric <= 0
  ) then
    raise exception 'Cada parcela precisa de vencimento e valor maior que zero';
  end if;

  select round(sum((e->>'valor')::numeric), 2) into v_soma from jsonb_array_elements(p_parcelas) e;
  if p_total is not null and abs(v_soma - round(p_total, 2)) > 0.01 then
    raise exception 'A soma das parcelas (R$ %) não confere com o total da nota (R$ %)',
      replace(to_char(v_soma, 'FM999999990.00'), '.', ','), replace(to_char(p_total, 'FM999999990.00'), '.', ',');
  end if;

  return query
    select (row_number() over (order by (e->>'vencimento')::date, ord))::integer,
           (e->>'vencimento')::date,
           round((e->>'valor')::numeric, 2)
      from jsonb_array_elements(p_parcelas) with ordinality as t(e, ord);
end;
$$;
grant execute on function public.contas_pagar_validar_parcelas(jsonb, numeric) to authenticated, service_role;

create or replace function public.admin_gerar_contas_despesa(
  p_despesa_id   uuid,
  p_condicao     text,
  p_parcelas     jsonb default null,
  p_categoria_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  d        despesas%rowtype;
  v_desc   text;
  v_cat    uuid;
  v_qtd    integer;
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_condicao is null or p_condicao not in ('pago', 'pix', 'debito', 'credito', 'boleto', 'a_pagar') then
    raise exception 'Escolha como a nota foi paga';
  end if;

  select * into d from despesas where id = p_despesa_id and excluido_em is null for update;
  if not found then
    raise exception 'Nota não encontrada ou excluída';
  end if;
  if exists (select 1 from contas_pagar where despesa_id = p_despesa_id) then
    raise exception 'Esta nota já tem contas a pagar';
  end if;

  v_desc := coalesce(nullif(btrim(d.fornecedor_nome), ''), 'Despesa')
            || coalesce(' · nota ' || nullif(btrim(d.numero), ''), '');
  v_cat := p_categoria_id;
  if v_cat is null then
    select categoria_id into v_cat
      from despesa_itens where despesa_id = p_despesa_id and categoria_id is not null
     order by valor_total desc limit 1;
  end if;

  if p_condicao in ('pago', 'pix', 'debito') then
    insert into contas_pagar (despesa_id, descricao, fornecedor_nome, fornecedor_doc, categoria_id,
                              forma, valor, vencimento, pago_em, valor_pago, pago_por, baixa_obs, criado_por)
    values (d.id, v_desc, d.fornecedor_nome, d.fornecedor_doc, v_cat,
            p_condicao, d.total, d.emissao, d.emissao, d.total, auth.uid(),
            case p_condicao when 'pago' then 'Pago na compra'
                            when 'pix'  then 'Pago por Pix'
                            else 'Pago no cartão de débito' end,
            auth.uid());
    v_qtd := 1;
  else
    select count(*) into v_qtd from public.contas_pagar_validar_parcelas(p_parcelas, d.total);
    insert into contas_pagar (despesa_id, descricao, fornecedor_nome, fornecedor_doc, categoria_id,
                              forma, parcela, parcelas, valor, vencimento, criado_por)
    select d.id, v_desc, d.fornecedor_nome, d.fornecedor_doc, v_cat,
           p_condicao, p.n, v_qtd, p.valor, p.vencimento, auth.uid()
      from public.contas_pagar_validar_parcelas(p_parcelas, d.total) p;
  end if;

  update despesas set condicao_pagamento = p_condicao where id = d.id;
  return v_qtd;
end;
$$;

grant execute on function public.admin_gerar_contas_despesa(uuid, text, jsonb, uuid) to authenticated, service_role;

drop index if exists public.contas_pagar_cartao_idx;
drop index if exists public.contas_pagar_data_compra_idx;
alter table public.contas_pagar drop column if exists vencimento_original;
alter table public.contas_pagar drop column if exists data_compra;
alter table public.contas_pagar drop column if exists cartao_id;
alter table public.despesas     drop column if exists cartao_id;
drop policy if exists "dono le cartoes" on public.cartoes_credito;
drop policy if exists "dono edita cartoes" on public.cartoes_credito;
drop table if exists public.cartoes_credito;
