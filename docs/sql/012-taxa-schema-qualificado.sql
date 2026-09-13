-- ============================================================================
-- Taxa por forma de pagamento: nomes qualificados com `public.`
--
-- As funções de 001 chamavam umas às outras (e as tabelas) sem prefixo de
-- schema. Isso funciona quando o search_path inclui `public` — caso das RPCs
-- do painel — mas quebra dentro da RPC que cria o pedido a partir do
-- carrinho, que segue a convenção do Supabase de `search_path = ''`. O
-- gatilho `pedidos_congelar_taxa` dispara nesse contexto e recebia
-- "function config_forma_pagamento(text) does not exist".
--
-- Mesmas assinaturas, mesmos corpos; só os nomes ganham `public.`. O gatilho
-- continua apontando para a mesma função, então não precisa ser recriado.
-- ============================================================================

create or replace function public.config_pagamento_json()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_txt  text;
  v_json jsonb;
begin
  select valor into v_txt from public.configuracoes where chave = 'formas_pagamento';

  if v_txt is null or btrim(v_txt) = '' then
    return '{}'::jsonb;
  end if;

  begin
    v_json := v_txt::jsonb;
  exception when others then
    return '{}'::jsonb;
  end;

  return coalesce(v_json, '{}'::jsonb);
end;
$$;


create or replace function public.config_forma_pagamento(p_forma text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    public.config_pagamento_json() -> (
      case when p_forma like 'boleto%' then 'boleto' else p_forma end
    ),
    '{}'::jsonb
  );
$$;


create or replace function public.pedidos_congelar_taxa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cfg jsonb;
begin
  if new.forma_pagamento is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.forma_pagamento is not distinct from old.forma_pagamento then
    return new;
  end if;

  v_cfg := public.config_forma_pagamento(new.forma_pagamento);

  new.taxa_pagamento_percentual := coalesce((v_cfg ->> 'percentual')::numeric, 0);
  new.taxa_pagamento_fixa       := coalesce((v_cfg ->> 'taxaFixa')::numeric, 0);

  return new;
end;
$$;


create or replace function public.valor_cobranca_pedido(
  p_pedido_id uuid,
  p_parcelas  integer default null
)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_total numeric(12,2);
  v_pct   numeric(6,3);
  v_fixa  numeric(12,2);
  v_forma text;
  v_docs  integer;
begin
  select total, taxa_pagamento_percentual, taxa_pagamento_fixa, forma_pagamento
    into v_total, v_pct, v_fixa, v_forma
    from public.pedidos
   where id = p_pedido_id;

  if v_total is null then
    return null;
  end if;

  -- Boleto se paga por documento; cartão, por transação
  if v_forma = 'boleto_parcelado' then
    v_docs := greatest(
      coalesce(
        p_parcelas,
        (select count(*)::int from public.pedido_parcelas where pedido_id = p_pedido_id),
        1
      ),
      1
    );
  else
    v_docs := 1;
  end if;

  return round(
    v_total
    + round(v_total * coalesce(v_pct, 0) / 100, 2)
    + coalesce(v_fixa, 0) * v_docs,
    2
  );
end;
$$;
