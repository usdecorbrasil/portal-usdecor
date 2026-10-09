-- Integridade de notas de despesa, estoque e envio de tecido (auditoria 09/10/2026)
--
-- 1. Escrita direta: o admin podia editar e apagar itens de nota e editar a
--    nota pela API. A entrada no estoque só nasce no INSERT do item, então
--    mudar ou apagar o item deixava o estoque errado, e gravar excluido_em
--    direto pulava o estorno, o motivo e a auditoria. O app só insere; o resto
--    já passa por função (admin_excluir_despesa, admin_anexar_arquivo_despesa,
--    admin_gerar_contas_despesa). Saem as políticas de UPDATE/DELETE.
-- 2. admin_excluir_despesa estorna os movimentos de entrada da nota, não a
--    quantidade do item no momento da exclusão.
-- 3. admin_anexar_arquivo_despesa aceita só caminho no padrão do bucket.
-- 4. contas_pagar.despesa_id: de ON DELETE CASCADE para RESTRICT — apagar a
--    nota fisicamente (só a chave de serviço consegue) não leva mais junto
--    parcelas já pagas. O app, ao desfazer uma nota que falhou no meio,
--    apaga as contas antes (salvarDespesa).
-- 5. tecido_envios: o cliente que abre um envio não pode já gravar os campos
--    da conferência (conferido_por/em, metros_conferidos, movimento_id).

-- 1 ----------------------------------------------------------- escrita direta
drop policy if exists "dono edita despesas" on public.despesas;
drop policy if exists "dono edita itens despesa" on public.despesa_itens;
drop policy if exists "dono apaga itens despesa" on public.despesa_itens;
revoke update on public.despesas from authenticated;
revoke update, delete on public.despesa_itens from authenticated;

-- 2 ------------------------------------------------------------------ estorno
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
  -- Estorna o que de fato entrou (os movimentos de entrada da nota), não a
  -- quantidade atual do item: se o item tivesse sido mudado depois, o
  -- estorno sairia diferente da entrada
  insert into suprimento_movimentos (suprimento_id, tipo, quantidade, despesa_item_id, observacao, autor_id)
  select m.suprimento_id, 'ajuste', -m.quantidade, m.despesa_item_id,
         'Nota excluída: ' || left(v_motivo, 80), auth.uid()
    from suprimento_movimentos m
    join despesa_itens i on i.id = m.despesa_item_id
   where i.despesa_id = p_despesa_id and m.tipo = 'entrada';
end;
$$;


-- 3 ------------------------------------------------------------------- anexo
create or replace function public.admin_anexar_arquivo_despesa(p_despesa_id uuid, p_arquivo_path text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_arquivo_path, '')), '') is null then
    raise exception 'Escolha a foto ou o PDF da nota';
  end if;
  -- Só caminhos que o próprio portal gera no bucket despesas (AAAA-MM/uuid.ext)
  if p_arquivo_path !~ '^[0-9]{4}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$' then
    raise exception 'Arquivo inválido';
  end if;

  update despesas
     set arquivo_path = p_arquivo_path
   where id = p_despesa_id and excluido_em is null and arquivo_path is null;
  if not found then
    raise exception 'Nota não encontrada, excluída ou já com comprovante';
  end if;
end;
$$;


-- 4 ------------------------------------------------------- contas sem cascade
alter table public.contas_pagar drop constraint if exists contas_pagar_despesa_id_fkey;
alter table public.contas_pagar
  add constraint contas_pagar_despesa_id_fkey
  foreign key (despesa_id) references public.despesas(id) on delete restrict;

-- 5 --------------------------------------------------------- envio de tecido
drop policy if exists "cliente abre envio" on public.tecido_envios;
create policy "cliente abre envio"
  on public.tecido_envios for insert to authenticated
  with check (
    situacao = 'enviado'
    and criado_por = auth.uid()
    and conferido_por is null
    and conferido_em is null
    and metros_conferidos is null
    and observacao_conferencia is null
    and movimento_id is null
    and (
      is_admin_producao()
      or cliente_id = (select p.cliente_id from public.profiles p where p.id = auth.uid())
    )
  );

notify pgrst, 'reload schema';
