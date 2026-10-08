-- Contas a pagar só pela nota (08/10/2026)
--
-- Decisão do dono: toda conta a pagar nasce de uma nota fiscal ou recibo
-- fotografado (ou em PDF), lançado em Estoque → Despesas. Não existe mais
-- conta lançada à mão, sem comprovante.
--
--   - admin_criar_conta_pagar (conta avulsa) deixa de existir;
--   - admin_gerar_contas_despesa passa a recusar nota sem arquivo anexado.
--
-- Contas avulsas que já tenham sido criadas continuam na tabela e seguem
-- podendo ser pagas, alteradas ou canceladas.

drop function if exists public.admin_criar_conta_pagar(text, text, uuid, text, jsonb, text);

create or replace function public.admin_gerar_contas_despesa(
  p_despesa_id   uuid,
  p_condicao     text,
  p_parcelas     jsonb default null,
  p_categoria_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  d        despesas%rowtype;
  v_desc   text;
  v_cat    uuid;
  v_qtd    integer;
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_condicao is null or p_condicao not in ('pago', 'debito', 'credito', 'boleto', 'a_pagar') then
    raise exception 'Escolha como a nota foi paga';
  end if;

  select * into d from despesas where id = p_despesa_id and excluido_em is null for update;
  if not found then
    raise exception 'Nota não encontrada ou excluída';
  end if;
  -- Conta a pagar só existe com comprovante: foto ou PDF da nota/recibo
  if nullif(btrim(coalesce(d.arquivo_path, '')), '') is null then
    raise exception 'Anexe a foto ou o PDF da nota ou do recibo antes de lançar';
  end if;
  if exists (select 1 from contas_pagar where despesa_id = p_despesa_id) then
    raise exception 'Esta nota já tem contas a pagar';
  end if;

  v_desc := coalesce(nullif(btrim(d.fornecedor_nome), ''), 'Despesa')
            || coalesce(' · nota ' || nullif(btrim(d.numero), ''), '');
  -- Categoria da conta: a informada (o app manda a do item de maior valor,
  -- porque as contas nascem antes dos itens) ou, sem ela, a do maior item já gravado
  v_cat := p_categoria_id;
  if v_cat is null then
    select categoria_id into v_cat
      from despesa_itens where despesa_id = p_despesa_id and categoria_id is not null
     order by valor_total desc limit 1;
  end if;

  if p_condicao in ('pago', 'debito') then
    insert into contas_pagar (despesa_id, descricao, fornecedor_nome, fornecedor_doc, categoria_id,
                              forma, valor, vencimento, pago_em, valor_pago, pago_por, baixa_obs, criado_por)
    values (d.id, v_desc, d.fornecedor_nome, d.fornecedor_doc, v_cat,
            p_condicao, d.total, d.emissao, d.emissao, d.total, auth.uid(),
            case p_condicao when 'pago' then 'Pago na compra' else 'Pago no cartão de débito' end, auth.uid());
    v_qtd := 1;
  else
    select count(*) into v_qtd from public.contas_pagar_validar_parcelas(p_parcelas, d.total);
    insert into contas_pagar (despesa_id, descricao, fornecedor_nome, fornecedor_doc, categoria_id,
                              forma, parcela, parcelas, valor, vencimento, criado_por)
    select d.id, v_desc, d.fornecedor_nome, d.fornecedor_doc, v_cat,
           p_condicao, p.n, v_qtd, p.valor, p.vencimento, auth.uid()
      from public.contas_pagar_validar_parcelas(p_parcelas, d.total) p;
  end if;

  update despesas set condicao_pagamento = p_condicao where id = d.id;
  return v_qtd;
end;
$$;

revoke all on function public.admin_gerar_contas_despesa(uuid, text, jsonb, uuid) from public;
grant execute on function public.admin_gerar_contas_despesa(uuid, text, jsonb, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
