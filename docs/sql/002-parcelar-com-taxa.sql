-- ============================================================================
-- Taxa por forma de pagamento — parte B
--
-- Recria `parcelar_pedido` com o MESMO cabeçalho do original (SECURITY DEFINER,
-- search_path public, returns void). Só o corpo muda, em quatro pontos:
--
--   1. teto de parcelas e mínimo por parcela passam a vir da configuração nova
--      (JSON), caindo nas chaves antigas se ela ainda não existir;
--   2. o intervalo entre boletos deixa de ser fixo em 30 dias;
--   3. o que é dividido passa a ser o valor COM taxa, não a mercadoria;
--   4. o mínimo por parcela passa a valer sobre o valor cobrado.
--
-- Rodar depois de 001-taxa-pagamento.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.parcelar_pedido(
  p_pedido_id uuid,
  p_quantidade_parcelas integer,
  p_primeiro_vencimento date
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_atual      pedido_status;
  v_total      numeric(12,2);
  v_pct        numeric(6,3);
  v_fixa       numeric(12,2);
  v_cobranca   numeric(12,2);
  v_valor_base numeric(12,2);
  v_soma       numeric(12,2) := 0;
  v_valor_i    numeric(12,2);
  v_minimo     numeric(12,2);
  v_max        integer;
  v_intervalo  integer;
  v_cfg        jsonb;
  i            integer;
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_quantidade_parcelas < 2 then
    raise exception 'Use boleto à vista para pagamento em parcela única';
  end if;

  v_cfg := config_forma_pagamento('boleto_parcelado');

  -- A configuração nova manda; as chaves antigas ficam como rede enquanto a
  -- tela de Pagamento não for salva pela primeira vez
  v_max := coalesce(
    (v_cfg ->> 'maxParcelas')::integer,
    (select valor::integer from configuracoes where chave = 'max_parcelas'),
    12
  );

  if p_quantidade_parcelas > v_max then
    raise exception 'Máximo de % parcelas permitido', v_max;
  end if;

  v_atual := status_atual(p_pedido_id);

  if v_atual in ('nf_emitida','expedido','entregue','fechado') then
    raise exception 'Nota fiscal já emitida. Parcelamento não pode mais ser alterado.';
  end if;

  select total, taxa_pagamento_percentual, taxa_pagamento_fixa
    into v_total, v_pct, v_fixa
    from pedidos
   where id = p_pedido_id;

  if v_total is null then
    raise exception 'Pedido não encontrado';
  end if;

  -- O que se divide é o valor cobrado. `pedidos.total` continua sendo a
  -- mercadoria, que é o que o Faturamento compara com o custo por metro.
  -- A taxa fixa do boleto é por documento, então multiplica pelas parcelas.
  v_cobranca := round(
    v_total
    + round(v_total * coalesce(v_pct, 0) / 100, 2)
    + coalesce(v_fixa, 0) * p_quantidade_parcelas,
    2
  );

  delete from pedido_parcelas where pedido_id = p_pedido_id;

  v_valor_base := trunc(v_cobranca / p_quantidade_parcelas, 2);

  if v_atual not in ('aguardando', 'recebido', 'impressao') then
    v_minimo := coalesce(
      (v_cfg ->> 'valorMinimoParcela')::numeric,
      (select valor::numeric from configuracoes where chave = 'valor_minimo_boleto'),
      200
    );

    if v_valor_base < v_minimo then
      raise exception
        'Cada parcela ficaria em R$ %, abaixo do mínimo de R$ %. Reduza a quantidade de parcelas.',
        v_valor_base, v_minimo;
    end if;
  end if;

  v_intervalo := coalesce((v_cfg ->> 'intervaloDias')::integer, 30);

  for i in 1..p_quantidade_parcelas loop
    if i < p_quantidade_parcelas then
      v_valor_i := v_valor_base;
    else
      -- A sobra do arredondamento cai na última parcela
      v_valor_i := v_cobranca - v_soma;
    end if;

    insert into pedido_parcelas (pedido_id, numero, valor, vencimento)
    values (
      p_pedido_id,
      i,
      v_valor_i,
      p_primeiro_vencimento + ((i - 1) * make_interval(days => v_intervalo))
    );

    v_soma := v_soma + v_valor_i;
  end loop;

  update pedidos set forma_pagamento = 'boleto_parcelado' where id = p_pedido_id;
end;
$function$;
