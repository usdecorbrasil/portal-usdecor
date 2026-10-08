-- Contas a pagar só pela nota (08/10/2026)
--
-- Decisão do dono: conta a pagar nasce da nota ou recibo lançado em
-- Estoque → Despesas. Sai a conta avulsa (admin_criar_conta_pagar).
--
-- A nota pode ser lançada sem foto ou PDF: a tela pede confirmação e lembra
-- de anexar, e a conta aparece como "sem comprovante" em A pagar. Por isso
-- admin_gerar_contas_despesa continua aceitando nota sem arquivo.
--
-- Contas avulsas que já tenham sido criadas continuam na tabela e seguem
-- podendo ser pagas, alteradas ou canceladas.
--
-- Nota sem arquivo pode receber o comprovante depois
-- (admin_anexar_arquivo_despesa): só preenche quando está vazio, para não
-- trocar o comprovante de uma nota que já tem. Depois de 2 dias sem arquivo,
-- o dashboard avisa (regra de tela, prazo em PRAZO_COMPROVANTE_DIAS).

drop function if exists public.admin_criar_conta_pagar(text, text, uuid, text, jsonb, text);

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

revoke all on function public.admin_anexar_arquivo_despesa(uuid, text) from public;
grant execute on function public.admin_anexar_arquivo_despesa(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
