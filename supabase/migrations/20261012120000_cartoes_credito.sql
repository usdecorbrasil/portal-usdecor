-- Cartões de crédito da empresa, com dia de fechamento e de vencimento da
-- fatura (pedido do dono, 12/10/2026).
--
-- Compra no crédito paga na fatura do cartão, não na data que a nota diz:
-- o que importa é em que fatura a compra cai (antes ou depois do fechamento)
-- e o dia em que essa fatura vence. A conferência da nota escolhe o cartão e
-- sugere os vencimentos pela regra do cartão; a conta a pagar guarda o cartão
-- para dar o controle de compras por período e por fatura.

create table if not exists public.cartoes_credito (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  -- Últimos 4 dígitos, só para distinguir cartões de mesmo nome
  final           text check (final is null or final ~ '^[0-9]{4}$'),
  dia_fechamento  integer not null check (dia_fechamento between 1 and 31),
  dia_vencimento  integer not null check (dia_vencimento between 1 and 31),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

create unique index if not exists cartoes_credito_nome_key on public.cartoes_credito (lower(nome)) where ativo;

comment on table public.cartoes_credito is
  'Cartões de crédito da empresa. Compra no crédito cai na fatura que fecha em dia_fechamento e vence em dia_vencimento.';

alter table public.cartoes_credito enable row level security;
drop policy if exists "dono le cartoes" on public.cartoes_credito;
create policy "dono le cartoes" on public.cartoes_credito for select to authenticated using (is_admin());
drop policy if exists "dono edita cartoes" on public.cartoes_credito;
create policy "dono edita cartoes" on public.cartoes_credito for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update on public.cartoes_credito to authenticated;
grant all on public.cartoes_credito to service_role;

alter table public.despesas     add column if not exists cartao_id uuid references public.cartoes_credito(id);
alter table public.contas_pagar add column if not exists cartao_id uuid references public.cartoes_credito(id);
create index if not exists contas_pagar_cartao_idx on public.contas_pagar (cartao_id) where cartao_id is not null;

-- A função ganha o cartão. A assinatura muda, então a antiga sai (duas
-- versões com nome igual deixariam a chamada por nome ambígua no PostgREST).
drop function if exists public.admin_gerar_contas_despesa(uuid, text, jsonb, uuid);

create or replace function public.admin_gerar_contas_despesa(
  p_despesa_id   uuid,
  p_condicao     text,
  p_parcelas     jsonb default null,
  p_categoria_id uuid default null,
  p_cartao_id    uuid default null
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

  -- Cartão: só no crédito, e obrigatório quando há cartão cadastrado
  if p_cartao_id is not null then
    if p_condicao <> 'credito' then
      raise exception 'Cartão de crédito só vale para compra no crédito';
    end if;
    if not exists (select 1 from cartoes_credito where id = p_cartao_id and ativo) then
      raise exception 'Cartão de crédito não encontrado ou inativo';
    end if;
  elsif p_condicao = 'credito' and exists (select 1 from cartoes_credito where ativo) then
    raise exception 'Escolha em qual cartão de crédito a compra foi feita';
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
                              forma, parcela, parcelas, valor, vencimento, cartao_id, criado_por)
    select d.id, v_desc, d.fornecedor_nome, d.fornecedor_doc, v_cat,
           p_condicao, p.n, v_qtd, p.valor, p.vencimento, p_cartao_id, auth.uid()
      from public.contas_pagar_validar_parcelas(p_parcelas, d.total) p;
  end if;

  update despesas set condicao_pagamento = p_condicao, cartao_id = p_cartao_id where id = d.id;
  return v_qtd;
end;
$$;

grant execute on function public.admin_gerar_contas_despesa(uuid, text, jsonb, uuid, uuid) to authenticated, service_role;
