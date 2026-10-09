-- ============================================================================
-- Leitura de nota: validações no banco e registro da leitura da IA (09/10/2026)
--
-- 1. Colunas novas em despesas:
--    - destinatario_nome / destinatario_doc: o comprador impresso na nota,
--      para avisar quando a nota não é da empresa;
--    - leitura_ia: o que a IA leu, como veio, e o que a conferência mudou
--      ({modelo, releitura, alterados, documento}) — métrica de acerto;
--    - versao_prompt: versão das instruções da leitura.
-- 2. Gatilho despesas_validar (insert, ou update dos campos conferidos):
--    - mesmo fornecedor + número + série já lançado (não excluído) recusa;
--    - emissão no futuro recusa;
--    - chave de acesso presente: CNPJ/CPF do emitente e número têm de ser os
--      que estão dentro dela.
--    O app confere o mesmo antes (src/lib/despesas/chave.ts e conferir.ts);
--    o banco é a garantia. Notas antigas não são revalidadas.
-- ============================================================================

alter table public.despesas
  add column if not exists destinatario_nome text,
  add column if not exists destinatario_doc  text,
  add column if not exists leitura_ia        jsonb,
  add column if not exists versao_prompt     text;

create or replace function public.despesas_validar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave  text := nullif(regexp_replace(coalesce(new.chave_acesso, ''), '\D', '', 'g'), '');
  v_doc    text := nullif(regexp_replace(coalesce(new.fornecedor_doc, ''), '\D', '', 'g'), '');
  v_numero text := nullif(ltrim(regexp_replace(coalesce(new.numero, ''), '\D', '', 'g'), '0'), '');
  v_serie  text := coalesce(nullif(ltrim(regexp_replace(coalesce(new.serie, ''), '\D', '', 'g'), '0'), ''), '0');
  v_outra  record;
begin
  if new.emissao > public.hoje_brasilia() then
    raise exception 'A data de emissão está no futuro. Confira com o documento.'
      using hint = 'nota_invalida';
  end if;

  if v_chave is not null and length(v_chave) = 44 then
    if v_doc is not null and lpad(v_doc, 14, '0') <> substr(v_chave, 7, 14) then
      raise exception 'O CNPJ/CPF do fornecedor não é o que está na chave de acesso.'
        using hint = 'nota_invalida';
    end if;
    if v_numero is not null and v_numero <> coalesce(nullif(ltrim(substr(v_chave, 26, 9), '0'), ''), '0') then
      raise exception 'O número da nota não é o que está na chave de acesso.'
        using hint = 'nota_invalida';
    end if;
  end if;

  if v_doc is not null and v_numero is not null and new.excluido_em is null then
    select d.numero, d.emissao
      into v_outra
      from public.despesas d
     where d.id <> new.id
       and d.excluido_em is null
       and regexp_replace(coalesce(d.fornecedor_doc, ''), '\D', '', 'g') = v_doc
       and nullif(ltrim(regexp_replace(coalesce(d.numero, ''), '\D', '', 'g'), '0'), '') = v_numero
       and coalesce(nullif(ltrim(regexp_replace(coalesce(d.serie, ''), '\D', '', 'g'), '0'), ''), '0') = v_serie
     limit 1;
    if found then
      raise exception 'Esta nota já foi lançada: mesmo fornecedor, número % e série %, emitida em %.',
        v_numero, v_serie, to_char(v_outra.emissao, 'DD/MM/YYYY')
        using hint = 'nota_invalida', errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.despesas_validar() from public;

drop trigger if exists trg_despesas_validar on public.despesas;
create trigger trg_despesas_validar
  before insert or update of fornecedor_doc, numero, serie, chave_acesso, emissao on public.despesas
  for each row execute function public.despesas_validar();

notify pgrst, 'reload schema';
