-- Desfaz 20261010100000_despesas_modo_xml.sql. Notas já salvas com modo
-- 'xml' voltam a 'manual' para a restrição antiga poder ser recriada.

update public.despesas set modo = 'manual' where modo = 'xml';

alter table public.despesas drop constraint if exists despesas_modo_check;
alter table public.despesas
  add constraint despesas_modo_check check (modo in ('manual', 'ia'));

-- RPC de anexo volta a aceitar só foto/PDF (versão de 20261009120000)
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
