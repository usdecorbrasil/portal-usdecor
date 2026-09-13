-- ============================================================================
-- Histórico da decisão de nota fiscal
--
-- As colunas `emitir_nf_*` em `pedidos` guardam só a decisão vigente. Isso
-- basta para a tela, mas não para "quem mudou o quê e quando" — que é o que
-- Alterações no pedido mostra para todo o resto (quantidade, preço, forma de
-- pagamento). Sem esta tabela, ligar e desligar a nota passava despercebido.
--
-- Convenção de colunas igual a `pedido_ajustes` / `pedido_precos`
-- (`criado_por` + `created_at`), que é a maioria no banco.
--
-- Rodar depois de 008-emissao-nf.sql.
-- ============================================================================

create table if not exists pedido_nf_historico (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references pedidos(id) on delete cascade,
  emitir_de   boolean,
  emitir_para boolean not null,
  motivo      text,
  criado_por  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists pedido_nf_historico_pedido_idx
  on pedido_nf_historico (pedido_id, created_at desc);

alter table pedido_nf_historico enable row level security;

drop policy if exists "equipe le historico de nf" on pedido_nf_historico;
create policy "equipe le historico de nf"
  on pedido_nf_historico
  for select
  to authenticated
  using (is_admin());


-- A função passa a registrar a troca. O insert vem depois do update: se o
-- update falhar por trava de status, não fica registro de algo que não mudou.
CREATE OR REPLACE FUNCTION public.admin_definir_emissao_nf(
  p_pedido_id uuid,
  p_emitir boolean,
  p_motivo text DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_atual  pedido_status;
  v_antes  boolean;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  v_atual := status_atual(p_pedido_id);

  if v_atual is null then
    raise exception 'Pedido não encontrado';
  end if;

  if v_atual in ('nf_emitida','expedido','entregue','fechado') then
    raise exception 'Nota fiscal já emitida. A decisão não pode mais ser alterada.';
  end if;

  if not p_emitir and (v_motivo is null or length(v_motivo) < 10) then
    raise exception 'Descreva por que o pedido sai sem nota fiscal (mín. 10 caracteres)';
  end if;

  select emitir_nf into v_antes from pedidos where id = p_pedido_id;

  -- Nada mudou de fato: não polui o histórico com repetição
  if v_antes is not distinct from p_emitir
     and coalesce(v_motivo, '') = coalesce(
       (select emitir_nf_motivo from pedidos where id = p_pedido_id), '') then
    return;
  end if;

  update pedidos
     set emitir_nf              = p_emitir,
         emitir_nf_motivo       = case when p_emitir then null else v_motivo end,
         emitir_nf_definido_em  = now(),
         emitir_nf_definido_por = auth.uid()
   where id = p_pedido_id;

  insert into pedido_nf_historico (pedido_id, emitir_de, emitir_para, motivo, criado_por)
  values (p_pedido_id, v_antes, p_emitir, v_motivo, auth.uid());
end;
$function$;
