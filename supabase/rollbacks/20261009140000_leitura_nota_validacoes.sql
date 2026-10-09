-- Desfaz 20261009140000_leitura_nota_validacoes.sql

drop trigger if exists trg_despesas_validar on public.despesas;
drop function if exists public.despesas_validar();

alter table public.despesas
  drop column if exists versao_prompt,
  drop column if exists leitura_ia,
  drop column if exists destinatario_doc,
  drop column if exists destinatario_nome;

notify pgrst, 'reload schema';
