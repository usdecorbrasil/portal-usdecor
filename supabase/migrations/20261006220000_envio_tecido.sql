-- ============================================================================
-- Envio de tecido pelo cliente (18B) e conferência na chegada (18C)
--
-- O envio é separado do pedido: o cliente (ou a equipe, em nome dele) avisa
-- que mandou tecido — qual, quantos metros, com ou sem a NF de remessa. A NF
-- pode ser anexada depois. Nada disso mexe no saldo: o saldo só muda quando a
-- equipe confere o que chegou, e a conferência é quem cria a entrada em
-- `tecido_movimentos`, com a metragem medida (não a informada).
--
-- Situações: enviado → conferido | recusado. Não há mais etapas: a dúvida que
-- importa é "já conferiram?".
-- ============================================================================

create table if not exists public.tecido_envios (
  id                     uuid primary key default gen_random_uuid(),
  cliente_id             uuid not null references public.clientes(id) on delete cascade,
  tecido_id              uuid not null references public.tecidos(id) on delete restrict,
  metros_informados      numeric(12,3) not null check (metros_informados > 0),
  nf_numero              text,
  nf_caminho             text,
  observacao             text,
  situacao               text not null default 'enviado'
                           check (situacao in ('enviado', 'conferido', 'recusado')),
  criado_por             uuid,
  criado_em              timestamptz not null default now(),
  conferido_por          uuid,
  conferido_em           timestamptz,
  metros_conferidos      numeric(12,3) check (metros_conferidos is null or metros_conferidos > 0),
  observacao_conferencia text,
  movimento_id           uuid references public.tecido_movimentos(id) on delete set null
);

create index if not exists tecido_envios_cliente_idx on public.tecido_envios (cliente_id, criado_em desc);
create index if not exists tecido_envios_situacao_idx on public.tecido_envios (situacao) where situacao = 'enviado';

comment on table public.tecido_envios is
  'Aviso de tecido enviado à estamparia. O saldo só muda na conferência (movimento de entrada).';

alter table public.tecido_envios enable row level security;

drop policy if exists "cliente le proprios envios" on public.tecido_envios;
create policy "cliente le proprios envios"
  on public.tecido_envios for select to authenticated
  using (
    is_admin_producao()
    or cliente_id = (select p.cliente_id from public.profiles p where p.id = auth.uid())
  );

-- O cliente só abre envio para si, como "enviado"; a equipe abre para qualquer um
drop policy if exists "cliente abre envio" on public.tecido_envios;
create policy "cliente abre envio"
  on public.tecido_envios for insert to authenticated
  with check (
    situacao = 'enviado'
    and criado_por = auth.uid()
    and (
      is_admin_producao()
      or cliente_id = (select p.cliente_id from public.profiles p where p.id = auth.uid())
    )
  );

-- Alterações só pelas RPCs abaixo (definer): nada de update direto
grant select, insert on public.tecido_envios to authenticated;

-- Anexar a NF depois: dono do envio ou equipe, só enquanto não conferido
create or replace function public.anexar_nf_envio_tecido(
  p_envio_id  uuid,
  p_nf_numero text,
  p_nf_caminho text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_envio tecido_envios%rowtype;
begin
  select * into v_envio from tecido_envios where id = p_envio_id;
  if v_envio.id is null then
    raise exception 'Envio não encontrado';
  end if;

  if not (
    is_admin_producao()
    or v_envio.cliente_id = (select p.cliente_id from profiles p where p.id = auth.uid())
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_envio.situacao <> 'enviado' then
    raise exception 'Este envio já foi conferido; a nota não pode mais ser trocada.';
  end if;

  update tecido_envios
     set nf_numero  = coalesce(nullif(trim(p_nf_numero), ''), nf_numero),
         nf_caminho = coalesce(p_nf_caminho, nf_caminho)
   where id = p_envio_id;
end;
$$;

-- Conferência: a equipe mede o que chegou e isso vira a entrada no estoque.
-- A metragem conferida pode diferir da informada — vale a medida.
create or replace function public.conferir_envio_tecido(
  p_envio_id   uuid,
  p_metros     numeric,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_envio     tecido_envios%rowtype;
  v_movimento uuid;
  v_obs       text;
begin
  if not is_admin_producao() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select * into v_envio from tecido_envios where id = p_envio_id for update;
  if v_envio.id is null then
    raise exception 'Envio não encontrado';
  end if;
  if v_envio.situacao <> 'enviado' then
    raise exception 'Este envio já foi conferido.';
  end if;
  if p_metros is null or p_metros <= 0 then
    raise exception 'Informe a metragem conferida.';
  end if;

  v_obs := 'Envio de ' || to_char(v_envio.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
        || case when v_envio.nf_numero is not null then ' — NF ' || v_envio.nf_numero else ' — sem NF' end
        || case when round(p_metros, 3) <> v_envio.metros_informados
                then ' (informados ' || to_char(v_envio.metros_informados, 'FM999G999G990D00') || ' m)'
                else '' end
        || case when nullif(trim(p_observacao), '') is not null then ' · ' || trim(p_observacao) else '' end;

  insert into tecido_movimentos (cliente_id, tecido_id, pedido_id, tipo, metros, observacao, autor_id)
  values (v_envio.cliente_id, v_envio.tecido_id, null, 'entrada', round(p_metros, 3), v_obs, auth.uid())
  returning id into v_movimento;

  update tecido_envios
     set situacao               = 'conferido',
         conferido_por          = auth.uid(),
         conferido_em           = now(),
         metros_conferidos      = round(p_metros, 3),
         observacao_conferencia = nullif(trim(p_observacao), ''),
         movimento_id           = v_movimento
   where id = p_envio_id;

  return v_movimento;
end;
$$;

-- Recusa: nada chegou, ou chegou outra coisa. Motivo obrigatório; saldo não muda.
create or replace function public.recusar_envio_tecido(
  p_envio_id uuid,
  p_motivo   text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_situacao text;
begin
  if not is_admin_producao() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Descreva o motivo com pelo menos 10 caracteres.';
  end if;

  select situacao into v_situacao from tecido_envios where id = p_envio_id for update;
  if v_situacao is null then
    raise exception 'Envio não encontrado';
  end if;
  if v_situacao <> 'enviado' then
    raise exception 'Este envio já foi conferido.';
  end if;

  update tecido_envios
     set situacao               = 'recusado',
         conferido_por          = auth.uid(),
         conferido_em           = now(),
         observacao_conferencia = trim(p_motivo)
   where id = p_envio_id;
end;
$$;

revoke all on function public.anexar_nf_envio_tecido(uuid, text, text) from public;
revoke all on function public.conferir_envio_tecido(uuid, numeric, text) from public;
revoke all on function public.recusar_envio_tecido(uuid, text) from public;
grant execute on function public.anexar_nf_envio_tecido(uuid, text, text) to authenticated, service_role;
grant execute on function public.conferir_envio_tecido(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.recusar_envio_tecido(uuid, text) to authenticated, service_role;
