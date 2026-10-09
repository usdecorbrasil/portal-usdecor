-- Desfaz 20261009120000_integridade_despesas.sql: volta políticas, funções e
-- chave estrangeira como estavam em 20261008150000, 20261008190000,
-- 20261008200000 e 20261006220000.

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

alter table public.contas_pagar drop constraint if exists contas_pagar_despesa_id_fkey;
alter table public.contas_pagar
  add constraint contas_pagar_despesa_id_fkey
  foreign key (despesa_id) references public.despesas(id) on delete cascade;

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

  update despesas
     set arquivo_path = p_arquivo_path
   where id = p_despesa_id and excluido_em is null and arquivo_path is null;
  if not found then
    raise exception 'Nota não encontrada, excluída ou já com comprovante';
  end if;
end;
$$;


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


grant update on public.despesas to authenticated;
grant update, delete on public.despesa_itens to authenticated;
create policy "dono edita despesas" on public.despesas for update to authenticated using (is_admin()) with check (is_admin());
create policy "dono edita itens despesa" on public.despesa_itens for update to authenticated using (is_admin()) with check (is_admin());
create policy "dono apaga itens despesa" on public.despesa_itens for delete to authenticated using (is_admin());

notify pgrst, 'reload schema';
