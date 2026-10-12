-- Conciliação de extratos bancários e faturas de cartão (pedido do dono,
-- 12/10/2026). O financeiro importa o extrato (OFX lido direto; PDF, imagem
-- ou CSV lidos pela IA), o portal sugere o vínculo de cada lançamento com
-- uma conta a pagar (saída) ou uma cobrança de pedido (entrada), a equipe
-- confirma — com baixa opcional — e fecha o extrato quando não sobra nada
-- pendente. Assim dá para provar que tudo o que passou na conta e no cartão
-- está lançado.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('extratos', 'extratos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv', 'text/plain', 'application/x-ofx'])
on conflict (id) do nothing;

create table if not exists public.extratos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('banco', 'cartao')),
  -- Fatura de cartão: de qual cartão
  cartao_id       uuid references public.cartoes_credito(id),
  -- Banco/instituição como veio no arquivo (ou digitado)
  origem          text,
  periodo_inicio  date,
  periodo_fim     date,
  arquivo_path    text not null,
  modo            text not null check (modo in ('ia', 'ofx')),
  modelo_ia       text,
  fechado_em      timestamptz,
  fechado_por     uuid,
  criado_por      uuid not null,
  criado_em       timestamptz not null default now(),
  check (tipo <> 'cartao' or cartao_id is not null)
);

create table if not exists public.extrato_lancamentos (
  id               uuid primary key default gen_random_uuid(),
  extrato_id       uuid not null references public.extratos(id) on delete cascade,
  linha            integer not null,
  data             date not null,
  descricao        text not null,
  valor            numeric(12,2) not null check (valor > 0),
  tipo             text not null check (tipo in ('entrada', 'saida')),
  -- Nº do documento / FITID do OFX, quando há
  documento        text,
  situacao         text not null default 'pendente' check (situacao in ('pendente', 'conciliado', 'ignorado')),
  -- Vínculo: saída → conta a pagar; entrada → cobrança do pedido (parcela ou à vista)
  conta_pagar_id   uuid references public.contas_pagar(id),
  pedido_id        uuid references public.pedidos(id),
  numero_parcela   integer,
  observacao       text,
  conciliado_em    timestamptz,
  conciliado_por   uuid,
  unique (extrato_id, linha)
);

-- Uma conta a pagar ou uma cobrança só casa com um lançamento
create unique index if not exists extrato_lanc_conta_pagar_key
  on public.extrato_lancamentos (conta_pagar_id) where situacao = 'conciliado' and conta_pagar_id is not null;
create unique index if not exists extrato_lanc_cobranca_key
  on public.extrato_lancamentos (pedido_id, coalesce(numero_parcela, 0)) where situacao = 'conciliado' and pedido_id is not null;
create index if not exists extrato_lanc_extrato_idx on public.extrato_lancamentos (extrato_id, situacao);

alter table public.extratos            enable row level security;
alter table public.extrato_lancamentos enable row level security;
drop policy if exists "dono le extratos" on public.extratos;
create policy "dono le extratos" on public.extratos for select to authenticated using (is_admin());
drop policy if exists "dono le lancamentos de extrato" on public.extrato_lancamentos;
create policy "dono le lancamentos de extrato" on public.extrato_lancamentos for select to authenticated using (is_admin());
grant select on public.extratos, public.extrato_lancamentos to authenticated;
grant all on public.extratos, public.extrato_lancamentos to service_role;

-- ------------------------------------------------------------ vincular
-- Saída casa com conta a pagar; entrada com cobrança de pedido. Com
-- p_baixar, a conta/cobrança em aberto é baixada na data e valor do extrato.
create or replace function public.admin_conciliar_lancamento(
  p_id              uuid,
  p_conta_pagar_id  uuid default null,
  p_pedido_id       uuid default null,
  p_numero_parcela  integer default null,
  p_baixar          boolean default false,
  p_obs             text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  l       extrato_lancamentos%rowtype;
  v_conta contas_pagar%rowtype;
  v_obs   text := nullif(btrim(coalesce(p_obs, '')), '');
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into l from extrato_lancamentos where id = p_id for update;
  if not found then
    raise exception 'Lançamento não encontrado';
  end if;
  if l.situacao = 'conciliado' then
    raise exception 'Este lançamento já está conciliado';
  end if;
  if exists (select 1 from extratos where id = l.extrato_id and fechado_em is not null) then
    raise exception 'Extrato já fechado';
  end if;

  if l.tipo = 'saida' then
    if p_conta_pagar_id is null or p_pedido_id is not null then
      raise exception 'Saída do extrato casa com uma conta a pagar';
    end if;
    select * into v_conta from contas_pagar where id = p_conta_pagar_id for update;
    if not found or v_conta.cancelada_em is not null then
      raise exception 'Conta a pagar não encontrada ou cancelada';
    end if;
    if p_baixar and v_conta.pago_em is null then
      perform admin_baixar_conta_pagar(p_conta_pagar_id, l.data, l.valor, 'Conciliação do extrato' || coalesce(': ' || v_obs, ''));
    end if;
  else
    if p_pedido_id is null or p_conta_pagar_id is not null then
      raise exception 'Entrada do extrato casa com uma cobrança de pedido';
    end if;
    if not exists (select 1 from pedidos where id = p_pedido_id) then
      raise exception 'Pedido não encontrado';
    end if;
    if p_baixar then
      if p_numero_parcela is not null then
        if exists (select 1 from pedido_parcelas where pedido_id = p_pedido_id and numero = p_numero_parcela and pago_em is null) then
          perform admin_registrar_recebimento(p_pedido_id, p_numero_parcela, l.data, l.valor, 'Conciliação do extrato' || coalesce(': ' || v_obs, ''));
        end if;
      elsif exists (select 1 from pedidos where id = p_pedido_id and pago_em is null)
            and not exists (select 1 from pedido_parcelas where pedido_id = p_pedido_id) then
        perform admin_registrar_recebimento(p_pedido_id, null, l.data, l.valor, 'Conciliação do extrato' || coalesce(': ' || v_obs, ''));
      end if;
    end if;
  end if;

  update extrato_lancamentos
     set situacao = 'conciliado', conta_pagar_id = p_conta_pagar_id, pedido_id = p_pedido_id,
         numero_parcela = p_numero_parcela, observacao = v_obs,
         conciliado_em = now(), conciliado_por = auth.uid()
   where id = p_id;
exception
  when unique_violation then
    raise exception 'Essa conta ou cobrança já está conciliada com outro lançamento';
end;
$$;

-- Ignorar: tarifa, transferência entre contas, lançamento que não é da empresa…
create or replace function public.admin_ignorar_lancamento(p_id uuid, p_motivo text)
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
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Diga por que este lançamento não entra (ex.: tarifa, transferência entre contas)';
  end if;
  update extrato_lancamentos
     set situacao = 'ignorado', observacao = v_motivo, conta_pagar_id = null, pedido_id = null, numero_parcela = null,
         conciliado_em = now(), conciliado_por = auth.uid()
   where id = p_id and situacao = 'pendente'
     and not exists (select 1 from extratos e where e.id = extrato_id and e.fechado_em is not null);
  if not found then
    raise exception 'Lançamento não encontrado, já tratado ou extrato fechado';
  end if;
end;
$$;

-- Desfazer volta o lançamento a pendente. A baixa feita na conta/cobrança
-- fica (estorna-se em A pagar / pelo pedido, com motivo).
create or replace function public.admin_desfazer_conciliacao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  update extrato_lancamentos
     set situacao = 'pendente', conta_pagar_id = null, pedido_id = null, numero_parcela = null,
         observacao = null, conciliado_em = null, conciliado_por = null
   where id = p_id and situacao <> 'pendente'
     and not exists (select 1 from extratos e where e.id = extrato_id and e.fechado_em is not null);
  if not found then
    raise exception 'Lançamento não encontrado, já pendente ou extrato fechado';
  end if;
end;
$$;

-- Fechar: só sem pendência. Reabrir volta a aceitar mudanças.
create or replace function public.admin_fechar_extrato(p_id uuid, p_fechar boolean default true)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_fechar and exists (select 1 from extrato_lancamentos where extrato_id = p_id and situacao = 'pendente') then
    raise exception 'Ainda há lançamentos pendentes neste extrato';
  end if;
  update extratos
     set fechado_em = case when p_fechar then now() end,
         fechado_por = case when p_fechar then auth.uid() end
   where id = p_id;
  if not found then
    raise exception 'Extrato não encontrado';
  end if;
end;
$$;

-- Excluir um extrato importado errado: só sem nada conciliado
create or replace function public.admin_excluir_extrato(p_id uuid)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_path text;
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if exists (select 1 from extrato_lancamentos where extrato_id = p_id and situacao = 'conciliado') then
    raise exception 'Este extrato já tem lançamentos conciliados: desfaça-os antes de excluir';
  end if;
  delete from extratos where id = p_id returning arquivo_path into v_path;
  if not found then
    raise exception 'Extrato não encontrado';
  end if;
  return v_path;
end;
$$;

revoke all on function public.admin_conciliar_lancamento(uuid, uuid, uuid, integer, boolean, text) from public;
revoke all on function public.admin_ignorar_lancamento(uuid, text) from public;
revoke all on function public.admin_desfazer_conciliacao(uuid) from public;
revoke all on function public.admin_fechar_extrato(uuid, boolean) from public;
revoke all on function public.admin_excluir_extrato(uuid) from public;
grant execute on function public.admin_conciliar_lancamento(uuid, uuid, uuid, integer, boolean, text) to authenticated, service_role;
grant execute on function public.admin_ignorar_lancamento(uuid, text) to authenticated, service_role;
grant execute on function public.admin_desfazer_conciliacao(uuid) to authenticated, service_role;
grant execute on function public.admin_fechar_extrato(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_excluir_extrato(uuid) to authenticated, service_role;
