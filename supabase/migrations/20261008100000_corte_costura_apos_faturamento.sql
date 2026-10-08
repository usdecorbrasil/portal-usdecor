-- ============================================================================
-- Corte/costura depois do faturamento (decidido pelo dono em 08/10/2026)
--
-- O que se fatura é impressão e estampa; a costura é terceirizada e, por
-- enquanto, não gera receita. A ordem passa a ser:
--
--   recebido → impressão → estampando → estampa pronta (chave `pronto`) →
--   faturado → nf_emitida → corte_costura → expedido → entregue → fechado
--
-- Corte/costura continua opcional (pedido sem costura vai de faturado/nota
-- direto para a expedição) e continua sendo lançada à mão no painel. O que
-- muda no banco:
--   1. `validar_status_pedido`: corte_costura só com `faturado` no histórico.
--   2. `admin_ajustar_metragem`: só em Estampando — depois do faturamento o
--      valor está no Bling; quebra na costura é do terceiro, não do pedido.
--   3. `credito_em_uso`: corte_costura conta entre os faturados, não entre os
--      ainda não faturados (parte de 20261008090000, que já ignora agrupados).
-- O rótulo "Pedido pronto" vira "Estampa pronta" só na tela; a chave não muda.
-- ============================================================================

-- 1. Etapa só depois do faturamento ----------------------------------------

create or replace function public.validar_status_pedido()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ped        public.pedidos%rowtype;
  v_cobranca   boolean;
  v_nf         boolean;
begin
  select * into v_ped from public.pedidos p where p.id = new.pedido_id;

  -- Pedido cancelado não avança mais
  if v_ped.cancelado_em is not null then
    raise exception 'Pedido cancelado não aceita novas etapas';
  end if;

  if new.status = 'fechado' then
    -- Cobrança gerada: boleto/Pix, link do cartão ou pagamento identificado
    v_cobranca :=
         v_ped.cobranca_gerada_em is not null
      or v_ped.link_boleto is not null
      or v_ped.link_pix is not null
      or v_ped.link_pagamento is not null
      or v_ped.pago_em is not null
      or v_ped.baixa_financeira_em is not null
      or exists (
           select 1 from public.pedido_parcelas pp
            where pp.pedido_id = new.pedido_id
              and (pp.link_boleto is not null or pp.pago_em is not null)
         );
    if not v_cobranca then
      raise exception 'Pedido só pode ser fechado depois de a cobrança ser gerada (boleto, Pix ou link do cartão)';
    end if;

    -- Nota fiscal emitida ou dispensada
    v_nf :=
         coalesce(v_ped.emitir_nf, true) = false
      or v_ped.bling_nf_id is not null
      or exists (
           select 1 from public.pedido_status_historico h
            where h.pedido_id = new.pedido_id and h.status = 'nf_emitida'
         );
    if not v_nf then
      raise exception 'Pedido só pode ser fechado com a nota fiscal emitida ou dispensada';
    end if;
  end if;

  -- Corte/costura vem depois do faturamento (08/10/2026): o que se fatura é
  -- a estampa; a costura é terceirizada e não gera receita. Só entra com o
  -- pedido já faturado (com ou sem nota)
  if new.status = 'corte_costura'
     and not exists (
       select 1 from public.pedido_status_historico h
        where h.pedido_id = new.pedido_id and h.status = 'faturado'
     ) then
    raise exception 'Corte/costura só pode ser lançado depois do faturamento (Estampa pronta → Faturar).';
  end if;

  -- Reimpressão só pode voltar para a etapa de impressão
  if new.reimpressao_motivo is not null and new.status <> 'impressao' then
    raise exception 'Reimpressão só retorna o pedido para a etapa Impressão';
  end if;

  return new;
end;
$function$;

-- 2. Ajuste de metragem só em Estampando ------------------------------------

CREATE OR REPLACE FUNCTION public.admin_ajustar_metragem(
  p_pedido_id uuid,
  p_metragem  numeric,
  p_motivo    text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_atual    pedido_status;
  v_antes    numeric(12,2);
  v_preco    numeric(12,2);
  v_papel    numeric(12,4);
  v_tinta    numeric(12,4);
  v_ml       numeric(12,4);
  v_calandra numeric(12,4);
  v_motivo   text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  -- Mesmo portao do romaneio: quem lanca metragem e a producao
  if not is_admin_producao() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_metragem is null or p_metragem <= 0 then
    raise exception 'Informe a metragem total impressa';
  end if;

  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Descreva o motivo do ajuste (mín. 10 caracteres)';
  end if;

  v_atual := status_atual(p_pedido_id);

  if v_atual is null then
    raise exception 'Pedido não encontrado';
  end if;

  -- Só em Estampando: a costura vem depois do faturamento, com o valor já
  -- no Bling (08/10/2026)
  if v_atual <> 'estampando' then
    raise exception 'A metragem só pode ser ajustada em Estampando';
  end if;

  select metragem_impressa into v_antes from pedidos where id = p_pedido_id;

  if v_antes is not distinct from p_metragem then
    raise exception 'A metragem informada é igual à atual';
  end if;

  select preco_unitario into v_preco
    from pedido_itens
   where pedido_id = p_pedido_id
   limit 1;

  if v_preco is null then
    raise exception 'Pedido sem itens ou preço definido';
  end if;

  select papel_por_metro, tinta_por_litro, consumo_ml_por_metro, calandra_por_metro
    into v_papel, v_tinta, v_ml, v_calandra
    from custos_producao
   limit 1;

  -- Identico ao romaneio, menos rolos/saldo, que nao mudam num ajuste
  update pedidos
     set metragem_impressa        = p_metragem,
         total                    = round(p_metragem * v_preco, 2),
         custo_papel_por_metro    = coalesce(v_papel, 0),
         custo_tinta_por_metro    = round(coalesce(v_ml, 0) / 1000 * coalesce(v_tinta, 0), 4),
         custo_calandra_por_metro = coalesce(v_calandra, 0)
   where id = p_pedido_id;

  perform regenerar_parcelas_pedido(p_pedido_id);

  insert into pedido_metragem_historico (pedido_id, metragem_de, metragem_para, motivo, criado_por)
  values (p_pedido_id, v_antes, p_metragem, v_motivo, auth.uid());
end;
$function$;

-- 3. Crédito em uso: costura é pós-faturamento --------------------------------

create or replace function public.credito_em_uso(p_cliente_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_total numeric(12,2);
begin
  if not is_admin()
     and p_cliente_id is distinct from (select cliente_id from profiles where id = auth.uid()) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select coalesce(sum(x.valor), 0) into v_total
    from (
      select case
               when exists (select 1 from pedido_parcelas pp where pp.pedido_id = p.id)
                 then (select coalesce(sum(pp.valor), 0)
                         from pedido_parcelas pp
                        where pp.pedido_id = p.id and pp.pago_em is null)
               else coalesce(public.valor_cobranca_pedido(p.id), 0)
             end as valor
        from pedidos p
       where p.cliente_id = p_cliente_id
         and p.cancelado_em is null
         and p.agrupado_em is null
         and p.pago_em is null
         and p.forma_pagamento like 'boleto%'
         and public.status_atual(p.id) in ('faturado', 'nf_emitida', 'corte_costura', 'expedido', 'entregue')

      union all

      select coalesce(public.valor_cobranca_pedido(p.id), 0)
        from pedidos p
       where p.cliente_id = p_cliente_id
         and p.cancelado_em is null
         and p.agrupado_em is null
         and p.forma_pagamento like 'boleto%'
         and public.status_atual(p.id) in ('recebido', 'impressao', 'estampando', 'pronto')
    ) x;

  return v_total;
end;
$$;
