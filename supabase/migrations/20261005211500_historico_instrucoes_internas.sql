-- ============================================================================
-- Histórico das instruções internas do pedido
--
-- Toda edição ou exclusão em `pedidos.instrucoes_internas` vira uma linha
-- aqui, preenchida por gatilho no banco — vale para qualquer caminho de
-- escrita, não só para a tela. Nada se perde ao substituir o texto: o
-- anterior fica guardado, com quem alterou e quando.
--
-- O autor vem de `auth.uid()`: a RPC `admin_definir_instrucoes_internas` é
-- chamada com a sessão do usuário, então o id é o dele. Gravação por chave
-- de serviço (sem sessão) fica com autor nulo, e a tela mostra sem nome.
-- ============================================================================

create table if not exists public.pedido_instrucoes_historico (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references public.pedidos(id) on delete cascade,
  texto_anterior text,
  texto_novo     text,
  autor_id       uuid,
  acao           text not null check (acao in ('editado', 'apagado')),
  criado_em      timestamptz not null default now()
);

create index if not exists pedido_instrucoes_historico_pedido_idx
  on public.pedido_instrucoes_historico (pedido_id, criado_em desc);

alter table public.pedido_instrucoes_historico enable row level security;

-- Quem lê é a equipe inteira (mesmo portão de quem escreve a instrução)
drop policy if exists "equipe le historico de instrucoes" on public.pedido_instrucoes_historico;
create policy "equipe le historico de instrucoes"
  on public.pedido_instrucoes_historico
  for select
  to authenticated
  using (is_admin_producao());

-- Este banco não usa os grants padrão: sem isto a tela do pedido, que embute
-- a tabela no select, recebe "permission denied" (lição do docs/sql/011)
grant select on public.pedido_instrucoes_historico to authenticated;
grant select, insert on public.pedido_instrucoes_historico to service_role;

create or replace function public.pedidos_instrucoes_historico()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.instrucoes_internas is distinct from old.instrucoes_internas then
    insert into pedido_instrucoes_historico
      (pedido_id, texto_anterior, texto_novo, autor_id, acao)
    values (
      new.id,
      old.instrucoes_internas,
      new.instrucoes_internas,
      auth.uid(),
      case when new.instrucoes_internas is null then 'apagado' else 'editado' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_instrucoes_historico on public.pedidos;
create trigger pedidos_instrucoes_historico
  after update of instrucoes_internas on public.pedidos
  for each row
  execute function public.pedidos_instrucoes_historico();
