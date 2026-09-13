-- ============================================================================
-- Taxa por forma de pagamento — parte A
--
-- Rodar no SQL Editor do Supabase. É aditivo: cria colunas com default 0 e
-- funções novas. Nenhuma função existente é alterada aqui, então pedidos já
-- gravados continuam exatamente como estão (taxa 0).
--
-- A parte B (alterar `parcelar_pedido` para dividir o valor COM taxa e usar o
-- intervalo configurado) vem em outro arquivo, depois de conferir o cabeçalho
-- real da função.
-- ============================================================================


-- 1. A taxa fica no pedido, não só na configuração ---------------------------
--
-- É um retrato do momento em que a forma de pagamento foi escolhida. Sem isso,
-- mudar a taxa em Configurações mudaria retroativamente o que já foi cobrado
-- de pedidos antigos.

alter table pedidos
  add column if not exists taxa_pagamento_percentual numeric(6,3) not null default 0,
  add column if not exists taxa_pagamento_fixa       numeric(12,2) not null default 0;

comment on column pedidos.taxa_pagamento_percentual is
  'Percentual acrescido pela forma de pagamento, congelado na escolha';
comment on column pedidos.taxa_pagamento_fixa is
  'Taxa fixa da forma de pagamento. No boleto é por documento emitido';


-- 2. Ler a configuração de formas de pagamento -------------------------------
--
-- A configuração é um JSON numa linha só de `configuracoes`. Se estiver
-- ausente ou corrompida, devolve objeto vazio: cobrar taxa 0 por engano é
-- muito menos grave do que derrubar o fechamento de um pedido.

create or replace function config_pagamento_json()
returns jsonb
language plpgsql
stable
as $$
declare
  v_txt  text;
  v_json jsonb;
begin
  select valor into v_txt from configuracoes where chave = 'formas_pagamento';

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


-- Recebe a forma como está em `pedidos.forma_pagamento` e devolve o bloco da
-- configuração. `boleto_avista` e `boleto_parcelado` compartilham o mesmo bloco.
create or replace function config_forma_pagamento(p_forma text)
returns jsonb
language sql
stable
as $$
  select coalesce(
    config_pagamento_json() -> (
      case when p_forma like 'boleto%' then 'boleto' else p_forma end
    ),
    '{}'::jsonb
  );
$$;


-- 3. Congelar a taxa quando a forma é escolhida ------------------------------
--
-- Feito por gatilho, e não dentro de `criar_pedido`, para valer também quando
-- admin/financeiro troca a forma de pagamento de um pedido já existente.

create or replace function pedidos_congelar_taxa()
returns trigger
language plpgsql
as $$
declare
  v_cfg jsonb;
begin
  if new.forma_pagamento is null then
    return new;
  end if;

  -- Numa atualização que não mexeu na forma, mantém o retrato antigo
  if tg_op = 'UPDATE'
     and new.forma_pagamento is not distinct from old.forma_pagamento then
    return new;
  end if;

  v_cfg := config_forma_pagamento(new.forma_pagamento);

  new.taxa_pagamento_percentual := coalesce((v_cfg ->> 'percentual')::numeric, 0);
  new.taxa_pagamento_fixa       := coalesce((v_cfg ->> 'taxaFixa')::numeric, 0);

  return new;
end;
$$;

drop trigger if exists trg_pedidos_congelar_taxa on pedidos;

create trigger trg_pedidos_congelar_taxa
before insert or update of forma_pagamento on pedidos
for each row execute function pedidos_congelar_taxa();


-- 4. Quanto o cliente paga ---------------------------------------------------
--
-- `pedidos.total` continua sendo o valor da MERCADORIA (metragem x preço), que
-- é o que o Faturamento e a Apuração comparam com o custo por metro. A taxa
-- entra só aqui, no que é cobrado.

create or replace function valor_cobranca_pedido(
  p_pedido_id uuid,
  p_parcelas  integer default null
)
returns numeric
language plpgsql
stable
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
    from pedidos
   where id = p_pedido_id;

  if v_total is null then
    return null;
  end if;

  -- Boleto se paga por documento; cartão, por transação
  if v_forma = 'boleto_parcelado' then
    v_docs := greatest(
      coalesce(
        p_parcelas,
        (select count(*)::int from pedido_parcelas where pedido_id = p_pedido_id),
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
