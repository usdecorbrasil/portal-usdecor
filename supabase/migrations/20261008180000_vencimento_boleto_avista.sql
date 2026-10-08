-- ============================================================================
-- Boleto à vista com vencimento escolhido no Faturar (pedido do dono, 08/10/2026)
--
-- O cliente pode pedir boleto à vista para 15 dias, por exemplo. Quem fatura
-- escolhe a data; sem escolha, vale o padrão de 4 dias úteis. Teto: 30 dias
-- corridos a partir de hoje — acima disso a RPC recusa. A data fica em
-- pedidos.vencimento_avista, que o pedido de venda no Bling e a cobrança já
-- usavam. O resto da função é o que estava em 20261008090000.
-- ============================================================================

create or replace function public.admin_definir_forma_pagamento_faturamento(
  p_pedido_id          uuid,
  p_forma              text,
  p_parcelas           integer default null,
  p_primeiro_vencimento date   default null,
  -- Limite estourado: motivo da liberação pelo dono (mín. 10 caracteres).
  -- Fica na mesma transação da forma: só grava se tudo o mais passou.
  p_motivo_liberacao   text    default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid            uuid := auth.uid();
  v_status         text;
  v_cliente        uuid;
  v_forma_atual    text;
  v_parcelas_atual integer;
  v_total          numeric(12,2);
  v_pct_atual      numeric(6,3);
  v_fixa_atual     numeric(12,2);
  v_cancelado      timestamptz;
  v_liberado       timestamptz;
  v_formas         text[];
  v_limite         numeric;
  v_cfg            jsonb;
  v_max            integer;
  v_minimo         numeric;
  v_pct            numeric;
  v_fixa           numeric;
  v_docs           integer;
  v_cobranca       numeric(12,2);
  v_documento      numeric(12,2);
  v_em_uso         numeric;
  v_parcelas       integer;
  v_bling          text;
  v_cobranca_em    timestamptz;
  v_motivo_lib     text := nullif(btrim(coalesce(p_motivo_liberacao, '')), '');
  v_liberar_agora  boolean := false;
  v_venc_avista    date;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_forma is null or p_forma not in
     ('boleto_avista', 'boleto_parcelado', 'pix', 'cartao_credito', 'cartao_debito') then
    raise exception 'Escolha a forma de pagamento.';
  end if;

  select p.cliente_id, p.forma_pagamento, p.parcelas_solicitadas, p.total,
         p.taxa_pagamento_percentual, p.taxa_pagamento_fixa,
         p.cancelado_em, p.bloqueio_liberado_em,
         p.bling_pedido_id::text, p.cobranca_gerada_em
    into v_cliente, v_forma_atual, v_parcelas_atual, v_total,
         v_pct_atual, v_fixa_atual, v_cancelado, v_liberado,
         v_bling, v_cobranca_em
    from public.pedidos p
   where p.id = p_pedido_id
     for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_cancelado is not null then
    raise exception 'Pedido cancelado';
  end if;

  v_status := public.status_atual(p_pedido_id)::text;

  if v_status <> 'pronto' then
    raise exception
      'A forma de pagamento é definida ao faturar, com o pedido em "Pedido pronto" (atual: %).', v_status;
  end if;

  if v_total is null or v_total <= 0 then
    raise exception 'O pedido ainda não tem valor: a metragem impressa precisa estar confirmada.';
  end if;

  -- Depois que o pedido de venda ou a cobrança existem no Bling, a forma e as
  -- parcelas estão lá também: refazer aqui apagaria os boletos já emitidos e
  -- deixaria o portal diferente do ERP. Faturar de novo só continua os passos
  if v_bling is not null or v_cobranca_em is not null then
    if v_forma_atual is distinct from p_forma
       or v_parcelas_atual is distinct from
          (case when p_forma = 'boleto_parcelado' then p_parcelas
                when p_forma = 'cartao_credito' and coalesce(p_parcelas, 1) >= 2 then p_parcelas
                else null end) then
      raise exception
        'A forma de pagamento já foi ao Bling com este pedido e não pode mais mudar. Para trocar, cancele o pedido de venda no Bling e refature.';
    end if;
    return;
  end if;

  if v_motivo_lib is not null and length(v_motivo_lib) < 10 then
    raise exception 'Descreva o motivo da liberação com pelo menos 10 caracteres.';
  end if;

  -- Forma ativa em Configurações → Pagamento
  v_cfg := public.config_forma_pagamento(p_forma);

  if v_cfg <> '{}'::jsonb and coalesce((v_cfg ->> 'ativa')::boolean, true) = false then
    raise exception 'Esta forma de pagamento está desativada em Configurações → Pagamento.';
  end if;

  -- Forma permitida ao cliente (lista do cadastro)
  select c.formas_pagamento, c.limite_credito
    into v_formas, v_limite
    from public.clientes c
   where c.id = v_cliente;

  if v_formas is not null and cardinality(v_formas) > 0
     and not (p_forma = any(v_formas)) then
    raise exception
      'Esta forma de pagamento não está permitida para este cliente. Ajuste no cadastro do cliente ou escolha outra.';
  end if;

  -- Parcelas: boleto parcelado exige; cartão de crédito aceita; o resto é à vista
  if p_forma = 'boleto_parcelado' then
    if p_parcelas is null or p_parcelas < 2 then
      raise exception 'Informe a quantidade de parcelas do boleto (mínimo 2).';
    end if;
    if p_primeiro_vencimento is null then
      raise exception 'Informe o primeiro vencimento do boleto parcelado.';
    end if;
    if p_primeiro_vencimento < current_date then
      raise exception 'O primeiro vencimento não pode ser no passado.';
    end if;
    v_parcelas := p_parcelas;
  elsif p_forma = 'boleto_avista' then
    -- Vencimento escolhido por quem fatura (pedido do dono em 08/10/2026):
    -- padrão de 4 dias úteis, teto de 30 dias corridos a partir de hoje
    if p_parcelas is not null and p_parcelas > 1 then
      raise exception 'Quantidade de parcelas só se aplica a boleto parcelado ou cartão de crédito.';
    end if;
    v_venc_avista := coalesce(p_primeiro_vencimento, public.proximo_dia_util(current_date, 4));
    if v_venc_avista < current_date then
      raise exception 'O vencimento do boleto não pode ser no passado.';
    end if;
    if v_venc_avista > current_date + 30 then
      raise exception 'O boleto à vista pode vencer em no máximo 30 dias (até %).',
        to_char(current_date + 30, 'DD/MM/YYYY');
    end if;
    v_parcelas := null;
  elsif p_forma = 'cartao_credito' then
    v_parcelas := case when coalesce(p_parcelas, 1) >= 2 then p_parcelas else null end;
  else
    if p_parcelas is not null and p_parcelas > 1 then
      raise exception 'Quantidade de parcelas só se aplica a boleto parcelado ou cartão de crédito.';
    end if;
    v_parcelas := null;
  end if;

  if v_parcelas is not null then
    v_max := coalesce(
      (v_cfg ->> 'maxParcelas')::integer,
      (select valor::integer from public.configuracoes where chave = 'max_parcelas'),
      4
    );
    if v_parcelas > v_max then
      raise exception 'Esta forma permite no máximo %x.', v_max;
    end if;
  end if;

  -- Valor cobrado com a forma escolhida. Se a forma muda, a taxa que vai
  -- congelar é a da configuração atual (gatilho); se não muda, vale a que já
  -- está congelada no pedido — é o que será cobrado de fato
  if v_forma_atual is distinct from p_forma then
    v_pct  := coalesce((v_cfg ->> 'percentual')::numeric, 0);
    v_fixa := coalesce((v_cfg ->> 'taxaFixa')::numeric, 0);
  else
    v_pct  := coalesce(v_pct_atual, 0);
    v_fixa := coalesce(v_fixa_atual, 0);
  end if;

  v_docs := case when p_forma = 'boleto_parcelado' then v_parcelas else 1 end;
  v_cobranca := round(v_total + round(v_total * v_pct / 100, 2) + v_fixa * v_docs, 2);

  -- Parcela mínima, pelo valor real
  v_minimo := coalesce(
    (v_cfg ->> 'valorMinimoParcela')::numeric,
    case when p_forma like 'boleto%'
         then (select valor::numeric from public.configuracoes where chave = 'valor_minimo_boleto')
    end,
    case when p_forma like 'boleto%' then 200 else 0 end
  );

  if p_forma like 'boleto%' and v_minimo > 0 then
    v_documento := case when p_forma = 'boleto_parcelado'
                        then trunc(v_cobranca / v_parcelas, 2)
                        else v_cobranca end;
    if v_documento < v_minimo then
      raise exception
        'Cada boleto ficaria em R$ %, abaixo do mínimo de R$ %. Escolha menos parcelas ou outra forma.',
        to_char(v_documento, 'FM999G999G990D00'), to_char(v_minimo, 'FM999G999G990D00');
    end if;
  end if;

  if p_forma = 'cartao_credito' and v_parcelas is not null and v_minimo > 0
     and trunc(v_cobranca / v_parcelas, 2) < v_minimo then
    raise exception
      'Cada parcela ficaria em R$ %, abaixo do mínimo de R$ % do cartão. Escolha menos parcelas.',
      to_char(trunc(v_cobranca / v_parcelas, 2), 'FM999G999G990D00'), to_char(v_minimo, 'FM999G999G990D00');
  end if;

  -- Limite de crédito: só boleto é conta a receber. A liberação do dono
  -- (bloqueio_liberado_em) dispensa a checagem. O crédito em uso já pode
  -- conter este pedido, se ele estava em boleto: tira para não contar duas vezes
  if p_forma like 'boleto%' and v_liberado is null then
    v_em_uso := public.credito_em_uso(v_cliente)
              - case when v_forma_atual like 'boleto%'
                     then coalesce(public.valor_cobranca_pedido(p_pedido_id), 0)
                     else 0 end;
    v_em_uso := greatest(coalesce(v_em_uso, 0), 0);

    if p_forma = 'boleto_parcelado'
       and not (coalesce(v_limite, 0) > 0 and v_limite - v_em_uso > 0) then
      if v_motivo_lib is not null then
        v_liberar_agora := true;
      else
      raise exception
        'Boleto parcelado indisponível: o cliente % (R$ % já em boletos). Libere com motivo ou escolha outra forma.',
        case when coalesce(v_limite, 0) > 0
             then 'está com o limite de crédito de R$ ' || to_char(v_limite, 'FM999G999G990D00') || ' tomado'
             else 'não tem limite de crédito definido' end,
        to_char(v_em_uso, 'FM999G999G990D00')
        using hint = 'limite_credito';
      end if;
    end if;

    if not v_liberar_agora
       and coalesce(v_limite, 0) > 0 and v_em_uso + v_cobranca > v_limite then
      if v_motivo_lib is not null then
        v_liberar_agora := true;
      else
      raise exception
        'Este pedido passa do limite de crédito do cliente: R$ % em boletos + R$ % deste pedido, com limite de R$ %. Libere com motivo ou escolha outra forma.',
        to_char(v_em_uso, 'FM999G999G990D00'),
        to_char(v_cobranca, 'FM999G999G990D00'),
        to_char(v_limite, 'FM999G999G990D00')
        using hint = 'limite_credito';
      end if;
    end if;
  end if;

  -- Parcela já paga não pode ser refeita (não deveria existir em "pronto")
  if exists (select 1 from public.pedido_parcelas pp
              where pp.pedido_id = p_pedido_id and pp.pago_em is not null) then
    raise exception 'Há parcela paga neste pedido; a forma de pagamento não pode mais mudar.';
  end if;

  -- Grava. O gatilho congela a taxa quando a forma muda. Passou pelas regras,
  -- então qualquer marca de bloqueio por crédito deixa de valer
  update public.pedidos
     set forma_pagamento      = p_forma,
         parcelas_solicitadas = v_parcelas,
         -- Boleto à vista: a data escolhida vai para o Bling e para a cobrança
         vencimento_avista    = case when p_forma = 'boleto_avista' then v_venc_avista else null end,
         bloqueado_credito    = false,
         -- Liberação do dono, só quando foi preciso e tudo o mais passou
         bloqueio_liberado_em     = case when v_liberar_agora then now() else bloqueio_liberado_em end,
         bloqueio_liberado_por    = case when v_liberar_agora then v_uid else bloqueio_liberado_por end,
         bloqueio_liberado_motivo = case when v_liberar_agora then v_motivo_lib else bloqueio_liberado_motivo end
   where id = p_pedido_id;

  if p_forma = 'boleto_parcelado' then
    -- Sempre regenera: em "pronto" nenhum boleto foi emitido ainda, e assim as
    -- parcelas refletem o valor e o vencimento escolhidos agora
    perform public.parcelar_pedido(p_pedido_id, v_parcelas, p_primeiro_vencimento);
  else
    delete from public.pedido_parcelas where pedido_id = p_pedido_id;
  end if;

  if v_forma_atual is distinct from p_forma
     or v_parcelas_atual is distinct from v_parcelas then
    insert into public.pedido_forma_pagamento_historico
      (pedido_id, forma_anterior, forma_nova, parcelas_anterior, parcelas_nova, motivo, autor_id)
    values
      (p_pedido_id, v_forma_atual, p_forma, v_parcelas_atual, v_parcelas, 'Definida no faturamento', v_uid);
  end if;
end;
$$;

revoke all on function public.admin_definir_forma_pagamento_faturamento(uuid, text, integer, date, text) from public;
grant execute on function public.admin_definir_forma_pagamento_faturamento(uuid, text, integer, date, text) to authenticated;
