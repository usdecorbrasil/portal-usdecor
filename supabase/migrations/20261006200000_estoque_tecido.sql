-- ============================================================================
-- Estoque de tecido do cliente — base (18A)
--
-- O cliente manda tecido para a estamparia; o portal passa a saber quanto
-- de cada tecido cada cliente tem na casa. Regras fixas:
--   - saldo em metros, separado por tecido e por cliente;
--   - vale sempre a metragem conferida pela equipe;
--   - o saldo é calculado a partir das movimentações, nunca editado à mão.
--
-- `tecidos` é o cadastro padronizado (só o dono mexe). `tecido_movimentos`
-- é o livro: entrada (tecido que chegou), consumo (metragem estampada),
-- quebra (perda na produção) e ajuste (acerto de inventário, positivo ou
-- negativo). `tecido_saldos` é a soma — uma view, para não haver duas
-- verdades.
--
-- Acesso: cliente lê os próprios saldos e movimentos; equipe inteira lê
-- tudo; só equipe (dono e produção) insere, pela RPC. Mesmo portão do
-- romaneio (`is_admin_producao()`): quem recebe e mede tecido é a produção.
-- ============================================================================

create table if not exists public.tecidos (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint tecidos_nome_unico unique (nome)
);

create table if not exists public.tecido_movimentos (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  tecido_id  uuid not null references public.tecidos(id) on delete restrict,
  pedido_id  uuid references public.pedidos(id) on delete set null,
  tipo       text not null check (tipo in ('entrada', 'consumo', 'quebra', 'ajuste')),
  -- Ajuste pode ser para mais ou para menos; o resto é sempre positivo e o
  -- sinal vem do tipo
  metros     numeric(10,3) not null check (
    (tipo = 'ajuste' and metros <> 0) or (tipo <> 'ajuste' and metros > 0)
  ),
  observacao text,
  autor_id   uuid,
  criado_em  timestamptz not null default now()
);

create index if not exists tecido_movimentos_cliente_tecido_idx
  on public.tecido_movimentos (cliente_id, tecido_id, criado_em desc);
create index if not exists tecido_movimentos_pedido_idx
  on public.tecido_movimentos (pedido_id);

-- Saldo = entradas + ajustes (com sinal) − consumos − quebras.
-- security_invoker: a view respeita as políticas de tecido_movimentos, então
-- o cliente só vê os próprios saldos sem precisar de política própria.
create or replace view public.tecido_saldos
with (security_invoker = true) as
  select m.cliente_id,
         m.tecido_id,
         round(sum(case m.tipo
                     when 'entrada' then m.metros
                     when 'ajuste'  then m.metros
                     else -m.metros
                   end), 3) as saldo_metros,
         max(m.criado_em) as ultimo_movimento
    from public.tecido_movimentos m
   group by m.cliente_id, m.tecido_id;

alter table public.tecidos enable row level security;
alter table public.tecido_movimentos enable row level security;

drop policy if exists "todos leem tecidos" on public.tecidos;
create policy "todos leem tecidos"
  on public.tecidos for select to authenticated
  using (true);

drop policy if exists "dono escreve tecidos" on public.tecidos;
create policy "dono escreve tecidos"
  on public.tecidos for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "cliente le proprios movimentos" on public.tecido_movimentos;
create policy "cliente le proprios movimentos"
  on public.tecido_movimentos for select to authenticated
  using (
    is_admin_producao()
    or cliente_id = (select p.cliente_id from public.profiles p where p.id = auth.uid())
  );

-- Inserção só pela RPC (abaixo), que roda como definer; a política fica
-- fechada para escrita direta
drop policy if exists "equipe insere movimentos" on public.tecido_movimentos;
create policy "equipe insere movimentos"
  on public.tecido_movimentos for insert to authenticated
  with check (is_admin_producao());

-- Este banco não usa os grants padrão (lição do docs/sql/011)
grant select on public.tecidos to authenticated;
grant select, insert, update on public.tecidos to service_role;
grant select on public.tecido_movimentos to authenticated;
grant select, insert on public.tecido_movimentos to service_role;
grant select on public.tecido_saldos to authenticated, service_role;

-- Lançamento de movimento, com o autor da sessão. Consumo e quebra
-- ligados a pedido chegam nos passos seguintes (18C/18D) por aqui também.
create or replace function public.registrar_movimento_tecido(
  p_cliente_id uuid,
  p_tecido_id  uuid,
  p_tipo       text,
  p_metros     numeric,
  p_observacao text default null,
  p_pedido_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_id uuid;
begin
  if not is_admin_producao() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_tipo not in ('entrada', 'consumo', 'quebra', 'ajuste') then
    raise exception 'Tipo de movimento inválido';
  end if;

  if p_metros is null or (p_tipo <> 'ajuste' and p_metros <= 0) or (p_tipo = 'ajuste' and p_metros = 0) then
    raise exception 'Informe a metragem';
  end if;

  if not exists (select 1 from tecidos t where t.id = p_tecido_id and t.ativo) then
    raise exception 'Tecido inativo ou inexistente';
  end if;

  if not exists (select 1 from clientes c where c.id = p_cliente_id) then
    raise exception 'Cliente não encontrado';
  end if;

  insert into tecido_movimentos (cliente_id, tecido_id, pedido_id, tipo, metros, observacao, autor_id)
  values (
    p_cliente_id, p_tecido_id, p_pedido_id, p_tipo, round(p_metros, 3),
    nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.registrar_movimento_tecido(uuid, uuid, text, numeric, text, uuid) from public;
grant execute on function public.registrar_movimento_tecido(uuid, uuid, text, numeric, text, uuid) to authenticated, service_role;
