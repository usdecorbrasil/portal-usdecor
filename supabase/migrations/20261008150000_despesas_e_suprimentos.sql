-- ============================================================================
-- Despesas por documento (nota, cupom, recibo) e estoque de suprimentos
--
-- Pedido do dono em 08/10/2026: fotografar ou anexar a nota de compra, a IA
-- lê e pré-preenche, a equipe confere e salva. Cada documento vira registro
-- próprio com itens; cada item tem uma categoria de gasto e, quando é
-- suprimento (tinta, papel), entra no estoque de suprimentos. O consumo de
-- suprimento pode ser manual ou automático por metro estampado (romaneio).
--
-- Princípios (vindos da especificação do dono):
--   - a leitura por IA nunca grava sozinha: a tela de conferência é a mesma
--     com ou sem IA, e tudo passa por ela;
--   - documento é entidade própria, não anexo;
--   - exclusão é lógica (excluido_em), com motivo; nada se apaga;
--   - chave de acesso (44 dígitos) é única: a mesma NF não entra duas vezes.
--
-- Só admin/financeiro mexe em despesas (valores). Suprimentos: a produção
-- vê saldos e lança consumo; cadastro e entradas por nota são do dono.
-- ============================================================================

-- ---------------------------------------------------------------- categorias
create table if not exists public.categorias_despesa (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

insert into public.categorias_despesa (nome) values
  ('Tinta'), ('Papel sublimático'), ('Tecido'), ('Energia'), ('Aluguel'),
  ('Manutenção'), ('Transporte e frete'), ('Embalagem'), ('Serviços de terceiros'),
  ('Impostos e taxas'), ('Alimentação'), ('Outros')
on conflict (nome) do nothing;

-- --------------------------------------------------------------- suprimentos
create table if not exists public.suprimentos (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null unique,
  unidade            text not null default 'un',          -- un, L, mL, kg, m, rolo, cx
  categoria_id       uuid references public.categorias_despesa(id),
  minimo             numeric(12,3) not null default 0,    -- alerta de estoque baixo
  -- Consumo automático por metro estampado (romaneio): null = só manual
  consumo_por_metro  numeric(12,4),
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now()
);

comment on column public.suprimentos.consumo_por_metro is
  'Quanto deste suprimento (na unidade dele) cada metro estampado consome. Preenchido, o romaneio baixa do estoque sozinho.';

create table if not exists public.suprimento_movimentos (
  id                 uuid primary key default gen_random_uuid(),
  suprimento_id      uuid not null references public.suprimentos(id),
  tipo               text not null check (tipo in ('entrada', 'consumo', 'ajuste')),
  quantidade         numeric(12,3) not null,                -- ajuste pode ser negativo
  custo_total        numeric(12,2),                         -- só em entrada, vindo da nota
  pedido_id          uuid references public.pedidos(id),    -- consumo automático
  despesa_item_id    uuid,                                   -- entrada por nota
  observacao         text,
  autor_id           uuid,
  criado_em          timestamptz not null default now()
);

create index if not exists suprimento_movimentos_suprimento_idx on public.suprimento_movimentos (suprimento_id, criado_em desc);
create index if not exists suprimento_movimentos_pedido_idx on public.suprimento_movimentos (pedido_id);

-- Saldo = entradas + ajustes − consumos
create or replace view public.suprimento_saldos as
  select s.id as suprimento_id,
         coalesce(sum(case m.tipo when 'entrada' then m.quantidade
                                  when 'ajuste'  then m.quantidade
                                  when 'consumo' then -m.quantidade end), 0)::numeric(12,3) as saldo,
         max(m.criado_em) as ultimo_movimento
    from public.suprimentos s
    left join public.suprimento_movimentos m on m.suprimento_id = s.id
   group by s.id;

-- ------------------------------------------------------------------ despesas
create table if not exists public.despesas (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null default 'outro'
                    check (tipo in ('nfe', 'nfce', 'nfse', 'cupom', 'recibo', 'boleto', 'outro')),
  fornecedor_nome   text,
  fornecedor_doc    text,                                   -- CNPJ/CPF só dígitos
  numero            text,
  serie             text,
  chave_acesso      text,                                   -- 44 dígitos
  emissao           date not null,
  forma_pagamento   text,
  subtotal          numeric(12,2),
  desconto          numeric(12,2) not null default 0,
  frete             numeric(12,2) not null default 0,
  impostos          numeric(12,2) not null default 0,
  total             numeric(12,2) not null,
  impostos_json     jsonb,
  arquivo_path      text,                                   -- bucket despesas
  origem            text not null default 'upload' check (origem in ('camera', 'upload')),
  modo              text not null default 'manual' check (modo in ('manual', 'ia')),
  confianca         jsonb,                                  -- campo → 0..1, quando veio da IA
  observacoes       text,
  criado_por        uuid,
  criado_em         timestamptz not null default now(),
  excluido_em       timestamptz,
  excluido_por      uuid,
  excluido_motivo   text
);

create unique index if not exists despesas_chave_acesso_unq
  on public.despesas (chave_acesso) where chave_acesso is not null and excluido_em is null;
create index if not exists despesas_emissao_idx on public.despesas (emissao desc);

create table if not exists public.despesa_itens (
  id              uuid primary key default gen_random_uuid(),
  despesa_id      uuid not null references public.despesas(id) on delete cascade,
  linha           integer not null default 1,
  descricao       text not null,
  codigo          text,
  quantidade      numeric(12,3) not null default 1,
  unidade         text,
  valor_unitario  numeric(12,4),
  valor_total     numeric(12,2) not null,
  categoria_id    uuid references public.categorias_despesa(id),
  -- Destino: suprimento = entra no estoque; nulo = só despesa
  suprimento_id   uuid references public.suprimentos(id),
  confianca       numeric(4,3)
);

create index if not exists despesa_itens_despesa_idx on public.despesa_itens (despesa_id);

alter table public.suprimento_movimentos
  add constraint suprimento_movimentos_despesa_item_fk
  foreign key (despesa_item_id) references public.despesa_itens(id) on delete set null;

-- Item de nota com suprimento vira entrada no estoque, com o custo
create or replace function public.despesa_item_entrada_suprimento()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_numero text;
begin
  if new.suprimento_id is null then
    return new;
  end if;
  select coalesce(d.numero, to_char(d.emissao, 'DD/MM/YYYY')) into v_numero from despesas d where d.id = new.despesa_id;
  insert into suprimento_movimentos (suprimento_id, tipo, quantidade, custo_total, despesa_item_id, observacao, autor_id)
  values (new.suprimento_id, 'entrada', new.quantidade, new.valor_total, new.id,
          'Nota ' || coalesce(v_numero, '') || ' — ' || left(new.descricao, 80), auth.uid());
  return new;
end;
$$;

drop trigger if exists despesa_item_entrada_suprimento on public.despesa_itens;
create trigger despesa_item_entrada_suprimento
  after insert on public.despesa_itens
  for each row
  execute function public.despesa_item_entrada_suprimento();

-- Consumo automático por metro estampado: espelho do consumo de tecido.
-- Para cada suprimento com consumo_por_metro, mantém o consumo do pedido
-- igual a metragem × fator; a diferença vira movimento ligado ao pedido.
create or replace function public.pedidos_sincronizar_consumo_suprimentos()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  s           record;
  v_alvo      numeric;
  v_lancado   numeric;
  v_delta     numeric;
begin
  if new.metragem_impressa is null then
    return new;
  end if;

  for s in select id, nome, consumo_por_metro from suprimentos
            where ativo and consumo_por_metro is not null and consumo_por_metro > 0
  loop
    v_alvo := round(new.metragem_impressa * s.consumo_por_metro, 3);

    select coalesce(sum(case m.tipo when 'consumo' then m.quantidade
                                    when 'ajuste'  then -m.quantidade
                                    else 0 end), 0)
      into v_lancado
      from suprimento_movimentos m
     where m.pedido_id = new.id and m.suprimento_id = s.id;

    v_delta := round(v_alvo - v_lancado, 3);
    if v_delta = 0 then
      continue;
    end if;

    if v_delta > 0 then
      insert into suprimento_movimentos (suprimento_id, tipo, quantidade, pedido_id, observacao, autor_id)
      values (s.id, 'consumo', v_delta, new.id,
              case when v_lancado = 0 then 'Romaneio do pedido #' || new.numero
                   else 'Ajuste de metragem do pedido #' || new.numero end,
              auth.uid());
    else
      insert into suprimento_movimentos (suprimento_id, tipo, quantidade, pedido_id, observacao, autor_id)
      values (s.id, 'ajuste', -v_delta, new.id,
              'Devolução por ajuste de metragem do pedido #' || new.numero, auth.uid());
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists pedidos_sincronizar_consumo_suprimentos on public.pedidos;
create trigger pedidos_sincronizar_consumo_suprimentos
  after update of metragem_impressa on public.pedidos
  for each row
  execute function public.pedidos_sincronizar_consumo_suprimentos();

-- Movimento manual de suprimento (consumo ou ajuste), pela equipe
create or replace function public.registrar_movimento_suprimento(
  p_suprimento_id uuid,
  p_tipo          text,
  p_quantidade    numeric,
  p_observacao    text default null
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
  if p_tipo not in ('entrada', 'consumo', 'ajuste') then
    raise exception 'Tipo de movimento inválido';
  end if;
  if (p_tipo <> 'ajuste' and coalesce(p_quantidade, 0) <= 0) or (p_tipo = 'ajuste' and coalesce(p_quantidade, 0) = 0) then
    raise exception 'Informe a quantidade';
  end if;
  if p_tipo = 'entrada' and not is_admin() then
    raise exception 'Entrada de suprimento é lançada pela nota de compra (dono/financeiro)' using errcode = '42501';
  end if;

  insert into suprimento_movimentos (suprimento_id, tipo, quantidade, observacao, autor_id)
  values (p_suprimento_id, p_tipo, p_quantidade, nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Exclusão lógica da despesa: desfaz as entradas de estoque que ela gerou
create or replace function public.admin_excluir_despesa(p_despesa_id uuid, p_motivo text)
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

  update despesas
     set excluido_em = now(), excluido_por = auth.uid(), excluido_motivo = v_motivo
   where id = p_despesa_id and excluido_em is null;
  if not found then
    raise exception 'Despesa não encontrada ou já excluída';
  end if;

  -- Entradas de estoque vindas desta nota saem com um ajuste negativo
  insert into suprimento_movimentos (suprimento_id, tipo, quantidade, despesa_item_id, observacao, autor_id)
  select i.suprimento_id, 'ajuste', -i.quantidade, i.id,
         'Nota excluída: ' || left(v_motivo, 80), auth.uid()
    from despesa_itens i
   where i.despesa_id = p_despesa_id and i.suprimento_id is not null;
end;
$$;

-- ------------------------------------------------------------- segurança
alter table public.categorias_despesa    enable row level security;
alter table public.suprimentos           enable row level security;
alter table public.suprimento_movimentos enable row level security;
alter table public.despesas              enable row level security;
alter table public.despesa_itens         enable row level security;

-- Equipe inteira lê categorias, suprimentos e movimentos (sem valores de custo? o custo fica
-- na coluna; a tela da produção não o mostra — regra de tela, como nas demais)
drop policy if exists "equipe le categorias" on public.categorias_despesa;
create policy "equipe le categorias" on public.categorias_despesa for select to authenticated using (is_admin_producao());
drop policy if exists "dono edita categorias" on public.categorias_despesa;
create policy "dono edita categorias" on public.categorias_despesa for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "equipe le suprimentos" on public.suprimentos;
create policy "equipe le suprimentos" on public.suprimentos for select to authenticated using (is_admin_producao());
drop policy if exists "dono edita suprimentos" on public.suprimentos;
create policy "dono edita suprimentos" on public.suprimentos for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "equipe le movimentos suprimento" on public.suprimento_movimentos;
create policy "equipe le movimentos suprimento" on public.suprimento_movimentos for select to authenticated using (is_admin_producao());

-- Despesas: só quem vê valores
drop policy if exists "dono le despesas" on public.despesas;
create policy "dono le despesas" on public.despesas for select to authenticated using (is_admin());
drop policy if exists "dono grava despesas" on public.despesas;
create policy "dono grava despesas" on public.despesas for insert to authenticated with check (is_admin() and criado_por = auth.uid());
drop policy if exists "dono edita despesas" on public.despesas;
create policy "dono edita despesas" on public.despesas for update to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "dono le itens despesa" on public.despesa_itens;
create policy "dono le itens despesa" on public.despesa_itens for select to authenticated using (is_admin());
drop policy if exists "dono grava itens despesa" on public.despesa_itens;
create policy "dono grava itens despesa" on public.despesa_itens for insert to authenticated with check (is_admin());
drop policy if exists "dono edita itens despesa" on public.despesa_itens;
create policy "dono edita itens despesa" on public.despesa_itens for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "dono apaga itens despesa" on public.despesa_itens;
create policy "dono apaga itens despesa" on public.despesa_itens for delete to authenticated using (is_admin());

-- Este banco não usa os grants padrão: toda tabela nova leva os seus
grant select, insert, update, delete on public.categorias_despesa    to authenticated;
grant select, insert, update, delete on public.suprimentos           to authenticated;
grant select                         on public.suprimento_movimentos to authenticated;
grant select, insert, update         on public.despesas              to authenticated;
grant select, insert, update, delete on public.despesa_itens         to authenticated;
grant select                         on public.suprimento_saldos     to authenticated;
grant all on public.categorias_despesa, public.suprimentos, public.suprimento_movimentos,
             public.despesas, public.despesa_itens to service_role;
grant select on public.suprimento_saldos to service_role;

revoke all on function public.registrar_movimento_suprimento(uuid, text, numeric, text) from public;
revoke all on function public.admin_excluir_despesa(uuid, text) from public;
grant execute on function public.registrar_movimento_suprimento(uuid, text, numeric, text) to authenticated, service_role;
grant execute on function public.admin_excluir_despesa(uuid, text) to authenticated, service_role;

-- Bucket privado para a imagem/PDF comprimido da nota. Quem lê recebe link
-- assinado, gerado pelo servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('despesas', 'despesas', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
