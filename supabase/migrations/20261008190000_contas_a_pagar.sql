-- Contas a pagar (08/10/2026)
--
-- Pedido do dono: toda nota lançada em Despesas informa como foi paga
-- (já pago, cartão de débito, cartão de crédito, boleto ou a pagar) e isso
-- gera as contas a pagar, que o Financeiro acompanha e baixa.
--
--   - despesas.condicao_pagamento: a condição escolhida na conferência.
--     Nula só nas notas lançadas antes desta migration.
--   - contas_pagar: uma linha por parcela/vencimento. Vem da nota
--     (despesa_id) ou é lançada à mão (aluguel, energia sem nota).
--     "Já pago" e "cartão de débito" geram a conta já quitada na emissão,
--     para o histórico do que saiu ficar completo.
--   - Só se escreve por função (security definer, is_admin()); a tela lê.
--   - Excluir a nota cancela as parcelas em aberto dela. As pagas ficam.

-- ------------------------------------------------------- condição na nota
alter table public.despesas
  add column if not exists condicao_pagamento text
  check (condicao_pagamento in ('pago', 'debito', 'credito', 'boleto', 'a_pagar'));

-- --------------------------------------------------------- contas a pagar
create table if not exists public.contas_pagar (
  id                uuid primary key default gen_random_uuid(),
  despesa_id        uuid references public.despesas(id) on delete cascade,
  descricao         text not null,
  fornecedor_nome   text,
  fornecedor_doc    text,
  categoria_id      uuid references public.categorias_despesa(id),
  forma             text not null check (forma in ('pago', 'debito', 'credito', 'boleto', 'a_pagar')),
  parcela           integer not null default 1 check (parcela >= 1),
  parcelas          integer not null default 1 check (parcelas >= 1 and parcela <= parcelas),
  valor             numeric(12,2) not null check (valor > 0),
  vencimento        date not null,
  pago_em           date,
  valor_pago        numeric(12,2) check (valor_pago is null or valor_pago > 0),
  pago_por          uuid,
  baixa_obs         text,
  cancelada_em      timestamptz,
  cancelada_por     uuid,
  cancelada_motivo  text,
  observacao        text,
  criado_por        uuid,
  criado_em         timestamptz not null default now(),
  check ((pago_em is null) = (valor_pago is null))
);

create index if not exists contas_pagar_vencimento_idx on public.contas_pagar (vencimento)
  where pago_em is null and cancelada_em is null;
create index if not exists contas_pagar_despesa_idx on public.contas_pagar (despesa_id);
create index if not exists contas_pagar_pago_em_idx on public.contas_pagar (pago_em) where pago_em is not null;

alter table public.contas_pagar enable row level security;

drop policy if exists contas_pagar_select on public.contas_pagar;
create policy contas_pagar_select on public.contas_pagar
  for select to authenticated using (public.is_admin());

grant select on public.contas_pagar to authenticated;
grant all on public.contas_pagar to service_role;

-- --------------------------------------------- parcelas: validação comum
-- p_parcelas = [{ "vencimento": "AAAA-MM-DD", "valor": 123.45 }, ...]
-- Devolve as parcelas validadas, na ordem do vencimento.
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

-- --------------------------------------- contas a partir de uma nota salva
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
  if p_condicao is null or p_condicao not in ('pago', 'debito', 'credito', 'boleto', 'a_pagar') then
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
  -- Categoria da conta: a informada (o app manda a do item de maior valor,
  -- porque as contas nascem antes dos itens) ou, sem ela, a do maior item já gravado
  v_cat := p_categoria_id;
  if v_cat is null then
    select categoria_id into v_cat
      from despesa_itens where despesa_id = p_despesa_id and categoria_id is not null
     order by valor_total desc limit 1;
  end if;

  if p_condicao in ('pago', 'debito') then
    insert into contas_pagar (despesa_id, descricao, fornecedor_nome, fornecedor_doc, categoria_id,
                              forma, valor, vencimento, pago_em, valor_pago, pago_por, baixa_obs, criado_por)
    values (d.id, v_desc, d.fornecedor_nome, d.fornecedor_doc, v_cat,
            p_condicao, d.total, d.emissao, d.emissao, d.total, auth.uid(),
            case p_condicao when 'pago' then 'Pago na compra' else 'Pago no cartão de débito' end, auth.uid());
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

-- ------------------------------------------- conta lançada à mão (sem nota)
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

-- --------------------------------------------------------------- baixa
create or replace function public.admin_baixar_conta_pagar(
  p_id         uuid,
  p_pago_em    date,
  p_valor_pago numeric,
  p_obs        text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_pago_em is null or p_pago_em > current_date then
    raise exception 'Informe a data do pagamento (hoje ou antes)';
  end if;
  if p_valor_pago is null or p_valor_pago <= 0 then
    raise exception 'Informe o valor pago';
  end if;

  update contas_pagar
     set pago_em = p_pago_em, valor_pago = round(p_valor_pago, 2), pago_por = auth.uid(),
         baixa_obs = nullif(btrim(coalesce(p_obs, '')), '')
   where id = p_id and pago_em is null and cancelada_em is null;
  if not found then
    raise exception 'Conta não encontrada, já paga ou cancelada';
  end if;
end;
$$;

-- ------------------------------------------------------------- estorno
create or replace function public.admin_estornar_conta_pagar(p_id uuid, p_motivo text)
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
    raise exception 'Descreva o motivo (mín. 10 caracteres)';
  end if;

  update contas_pagar
     set pago_em = null, valor_pago = null, pago_por = null,
         baixa_obs = null,
         observacao = left(coalesce(observacao || ' · ', '') || 'Baixa estornada: ' || v_motivo, 1000)
   where id = p_id and pago_em is not null and cancelada_em is null;
  if not found then
    raise exception 'Conta não encontrada ou não está paga';
  end if;
end;
$$;

-- ---------------------------------------------------------- cancelamento
create or replace function public.admin_cancelar_conta_pagar(p_id uuid, p_motivo text)
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
    raise exception 'Descreva o motivo (mín. 10 caracteres)';
  end if;

  update contas_pagar
     set cancelada_em = now(), cancelada_por = auth.uid(), cancelada_motivo = v_motivo
   where id = p_id and pago_em is null and cancelada_em is null;
  if not found then
    raise exception 'Conta não encontrada, paga ou já cancelada';
  end if;
end;
$$;

-- ------------------------------------------------ vencimento e valor
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

-- ------------------------------------- nota excluída cancela o que falta
create or replace function public.despesas_cancelar_contas_ao_excluir()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.excluido_em is not null and old.excluido_em is null then
    update contas_pagar
       set cancelada_em = now(), cancelada_por = new.excluido_por,
           cancelada_motivo = 'Nota excluída: ' || left(coalesce(new.excluido_motivo, ''), 200)
     where despesa_id = new.id and pago_em is null and cancelada_em is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_despesas_cancelar_contas on public.despesas;
create trigger trg_despesas_cancelar_contas
  after update of excluido_em on public.despesas
  for each row execute function public.despesas_cancelar_contas_ao_excluir();

-- ------------------------------------------------------------ permissões
revoke all on function public.contas_pagar_validar_parcelas(jsonb, numeric) from public;
revoke all on function public.admin_gerar_contas_despesa(uuid, text, jsonb, uuid) from public;
revoke all on function public.admin_criar_conta_pagar(text, text, uuid, text, jsonb, text) from public;
revoke all on function public.admin_baixar_conta_pagar(uuid, date, numeric, text) from public;
revoke all on function public.admin_estornar_conta_pagar(uuid, text) from public;
revoke all on function public.admin_cancelar_conta_pagar(uuid, text) from public;
revoke all on function public.admin_alterar_conta_pagar(uuid, date, numeric, text) from public;
revoke all on function public.despesas_cancelar_contas_ao_excluir() from public;

grant execute on function public.contas_pagar_validar_parcelas(jsonb, numeric) to authenticated, service_role;
grant execute on function public.admin_gerar_contas_despesa(uuid, text, jsonb, uuid) to authenticated, service_role;
grant execute on function public.admin_criar_conta_pagar(text, text, uuid, text, jsonb, text) to authenticated, service_role;
grant execute on function public.admin_baixar_conta_pagar(uuid, date, numeric, text) to authenticated, service_role;
grant execute on function public.admin_estornar_conta_pagar(uuid, text) to authenticated, service_role;
grant execute on function public.admin_cancelar_conta_pagar(uuid, text) to authenticated, service_role;
grant execute on function public.admin_alterar_conta_pagar(uuid, date, numeric, text) to authenticated, service_role;

notify pgrst, 'reload schema';
