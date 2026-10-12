-- Compra no crédito exige o cartão sempre (pedido do dono, 12/10/2026).
-- Antes, sem cartão cadastrado a conta nascia com vencimento padrão e ficava
-- "solta", com data que não bate com a fatura. Agora o cartão é obrigatório;
-- a conferência oferece o cadastro rápido quando o cartão não existe.
create or replace function public.admin_gerar_contas_despesa(
  p_despesa_id   uuid,
  p_condicao     text,
  p_parcelas     jsonb default null,
  p_categoria_id uuid default null,
  p_cartao_id    uuid default null
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
  if p_condicao is null or p_condicao not in ('pago', 'pix', 'debito', 'credito', 'boleto', 'a_pagar') then
    raise exception 'Escolha como a nota foi paga';
  end if;

  if p_cartao_id is not null then
    if p_condicao <> 'credito' then
      raise exception 'Cartão de crédito só vale para compra no crédito';
    end if;
    if not exists (select 1 from cartoes_credito where id = p_cartao_id and ativo) then
      raise exception 'Cartão de crédito não encontrado ou inativo';
    end if;
  elsif p_condicao = 'credito' then
    raise exception 'Compra no crédito exige o cartão: escolha um ou cadastre o cartão usado';
  end if;

  select * into d from despesas where id = p_despesa_id and excluido_em is null for update;
  if not found then
    raise exception 'Nota não encontrada ou excluída';
  end if;
  if exists (select 1 from contas_pagar where despesa_id = p_despesa_id) then
    raise exception 'Esta nota já tem contas a pagar';
  end if;

  v_desc := coalesce(nullif(btrim(d.fornecedor_nome), ''), 'Despesa')
            || coalesce(' · nota ' || nullif(btrim(d.numero), ''), '');
  v_cat := p_categoria_id;
  if v_cat is null then
    select categoria_id into v_cat
      from despesa_itens where despesa_id = p_despesa_id and categoria_id is not null
     order by valor_total desc limit 1;
  end if;

  if p_condicao in ('pago', 'pix', 'debito') then
    insert into contas_pagar (despesa_id, descricao, fornecedor_nome, fornecedor_doc, categoria_id,
                              forma, valor, vencimento, data_compra, pago_em, valor_pago, pago_por, baixa_obs, criado_por)
    values (d.id, v_desc, d.fornecedor_nome, d.fornecedor_doc, v_cat,
            p_condicao, d.total, d.emissao, d.emissao, d.emissao, d.total, auth.uid(),
            case p_condicao when 'pago' then 'Pago na compra'
                            when 'pix'  then 'Pago por Pix'
                            else 'Pago no cartão de débito' end,
            auth.uid());
    v_qtd := 1;
  else
    select count(*) into v_qtd from public.contas_pagar_validar_parcelas(p_parcelas, d.total);
    insert into contas_pagar (despesa_id, descricao, fornecedor_nome, fornecedor_doc, categoria_id,
                              forma, parcela, parcelas, valor, vencimento, data_compra, vencimento_original, cartao_id, criado_por)
    select d.id, v_desc, d.fornecedor_nome, d.fornecedor_doc, v_cat,
           p_condicao, p.n, v_qtd, p.valor, p.vencimento, d.emissao,
           case when p.vencimento_original is distinct from p.vencimento then p.vencimento_original end,
           p_cartao_id, auth.uid()
      from public.contas_pagar_validar_parcelas(p_parcelas, d.total) p;
  end if;

  update despesas set condicao_pagamento = p_condicao, cartao_id = p_cartao_id where id = d.id;
  return v_qtd;
end;
$$;
