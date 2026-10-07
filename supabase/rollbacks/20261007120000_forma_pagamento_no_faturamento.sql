-- Desfaz 20261007120000_forma_pagamento_no_faturamento.sql
--
-- Volta `criar_pedido` ao corpo de 20261006190000 (com forma, parcelas,
-- parcela mínima e bloqueio por crédito na criação), apaga a RPC do
-- faturamento, devolve `admin_liberar_bloqueio_credito` e o gatilho
-- `pedidos_forma_permitida` aos corpos anteriores e torna `forma_pagamento`
-- obrigatória de novo.
--
-- Dados: pedidos que nasceram sem forma recebem 'boleto_avista' (o default
-- antigo) para a coluna voltar a NOT NULL, e linhas do histórico com
-- "de" vazio (primeira definição no faturamento) recebem a própria forma
-- nova como anterior. Sem isso o SET NOT NULL falharia.

-- 5. RPC do faturamento
drop function if exists public.admin_definir_forma_pagamento_faturamento(uuid, text, integer, date);

-- 4. Liberação de crédito: volta a exigir pedido marcado como bloqueado
create or replace function public.admin_liberar_bloqueio_credito(
  p_pedido_id uuid,
  p_motivo    text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Descreva o motivo da liberação (mín. 10 caracteres)';
  end if;

  update pedidos
     set bloqueado_credito        = false,
         bloqueio_liberado_em     = now(),
         bloqueio_liberado_por    = auth.uid(),
         bloqueio_liberado_motivo = v_motivo
   where id = p_pedido_id
     and bloqueado_credito;

  if not found then
    raise exception 'Pedido não está bloqueado por crédito';
  end if;
end;
$$;

revoke all on function public.admin_liberar_bloqueio_credito(uuid, text) from public;
grant execute on function public.admin_liberar_bloqueio_credito(uuid, text) to authenticated;

-- 3. Gatilhos: corpos de 20261006150000 (forma permitida) e docs/sql/012 (taxa)
create or replace function public.pedidos_forma_permitida()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_formas text[];
begin
  if v_uid is null then
    return new;
  end if;

  if not exists (select 1 from profiles where id = v_uid and role = 'cliente') then
    return new;
  end if;

  select formas_pagamento into v_formas from clientes where id = new.cliente_id;

  if v_formas is not null and not (new.forma_pagamento = any(v_formas)) then
    raise exception 'Esta forma de pagamento não está disponível para o seu cadastro. Escolha outra ou fale com a Best Color Tecidos.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists pedidos_forma_permitida on public.pedidos;
create trigger pedidos_forma_permitida
  before insert on public.pedidos
  for each row
  execute function public.pedidos_forma_permitida();

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

drop trigger if exists trg_pedidos_congelar_taxa on public.pedidos;
create trigger trg_pedidos_congelar_taxa
  before insert or update of forma_pagamento on public.pedidos
  for each row
  execute function public.pedidos_congelar_taxa();

-- 2. criar_pedido com forma e parcelas (corpo de 20261006190000)
drop function if exists public.criar_pedido(jsonb, text);

CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_itens jsonb,
  p_notas text DEFAULT NULL::text,
  p_forma_pagamento text DEFAULT 'boleto_avista'::text,
  p_parcelas integer DEFAULT NULL::integer
)
 RETURNS TABLE(pedido_id uuid, numero bigint, total numeric, bloqueado_credito boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid       uuid := (select auth.uid());
  v_cliente   uuid;
  v_preco     numeric;
  v_pedido    uuid;
  v_inseridos integer;
  v_esperados integer;
  v_cfg       jsonb;
  v_max       integer;
  v_limite    numeric;
  v_total     numeric;
  v_bloqueado boolean := false;
  v_cobranca  numeric;
  v_minimo    numeric;
  v_teto      integer;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select p.cliente_id into v_cliente
    from public.profiles p
   where p.id = v_uid and p.ativo and p.role = 'cliente';

  if v_cliente is null then
    raise exception 'Usuário sem cliente vinculado' using errcode = '42501';
  end if;

  if p_forma_pagamento not in
     ('boleto_avista', 'boleto_parcelado', 'pix', 'cartao_credito', 'cartao_debito') then
    raise exception 'Forma de pagamento inválida';
  end if;

  -- Forma desligada em Configuracoes nao entra, mesmo que o carrinho tenha
  -- ficado aberto de antes da mudanca
  v_cfg := public.config_forma_pagamento(p_forma_pagamento);

  if v_cfg <> '{}'::jsonb and coalesce((v_cfg ->> 'ativa')::boolean, true) = false then
    raise exception 'Esta forma de pagamento não está disponível no momento.';
  end if;

  -- Parcelas: boleto parcelado exige; cartao de credito aceita; o resto recusa
  -- Parcelado sem credito nao e mais recusado aqui: o pedido nasce
  -- bloqueado (ver o fim da funcao) e a equipe decide
  if p_forma_pagamento = 'boleto_parcelado' then
    if p_parcelas is null then
      raise exception 'Escolha a quantidade de parcelas';
    end if;

  elsif p_forma_pagamento <> 'cartao_credito' and p_parcelas is not null then
    raise exception 'Quantidade de parcelas só se aplica a boleto parcelado ou cartão de crédito';
  end if;

  if p_parcelas is not null then
    -- O teto e por forma. A chave antiga fica de rede enquanto a tela de
    -- Pagamento nao for salva pela primeira vez
    v_max := coalesce(
      (v_cfg ->> 'maxParcelas')::integer,
      (select valor::integer from public.configuracoes where chave = 'max_parcelas'),
      4
    );

    if p_parcelas < 2 or p_parcelas > v_max then
      raise exception 'Escolha entre 2 e % parcelas', v_max;
    end if;
  end if;

  select c.preco_metro into v_preco
    from public.clientes c
   where c.id = v_cliente and c.ativo;

  if v_preco is null then
    raise exception 'Cadastro inativo. Fale com o suporte.' using errcode = '42501';
  end if;

  if v_preco <= 0 then
    raise exception 'Preço não definido para este cadastro. Fale com a Best Color Tecidos.';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Formato de itens inválido';
  end if;

  v_esperados := jsonb_array_length(p_itens);

  if v_esperados = 0 then
    raise exception 'O pedido precisa ter ao menos um item';
  end if;

  if v_esperados > 200 then
    raise exception 'Máximo de 200 artes diferentes por pedido';
  end if;

  if exists (select 1 from public.pedidos p
              where p.criado_por = v_uid
                and p.created_at > now() - interval '30 seconds') then
    raise exception 'Um pedido acabou de ser enviado. Aguarde alguns segundos.';
  end if;

  insert into public.pedidos (cliente_id, criado_por, notas, forma_pagamento, parcelas_solicitadas)
  values (v_cliente, v_uid, nullif(btrim(coalesce(p_notas, '')), ''), p_forma_pagamento, p_parcelas)
  returning id into v_pedido;

  with entrada as (
    select (i ->> 'produto_id')::uuid    as produto_id,
           (i ->> 'quantidade')::integer as quantidade
      from jsonb_array_elements(p_itens) as i
  )
  insert into public.pedido_itens
    (pedido_id, produto_id, sku, nome,
     preco_unitario, metros_por_unidade,
     quantidade_pedida, quantidade_faturada)
  select v_pedido, pr.id, pr.sku, pr.nome,
         v_preco, pr.metros_por_unidade,
         e.quantidade, e.quantidade
    from entrada e
    join public.produtos pr on pr.id = e.produto_id
    join public.catalogos k on k.id = pr.catalogo_id
   where pr.cliente_id = v_cliente
     and pr.ativo
     and k.ativo
     and e.quantidade between 1 and 100000;

  get diagnostics v_inseridos = row_count;

  if v_inseridos <> v_esperados then
    raise exception
      'Um ou mais itens estão indisponíveis ou fora do seu catálogo. Atualize a página e tente novamente.';
  end if;

  -- Limite de credito: boleto que, somado ao que ja esta em boleto, passa do
  -- limite nao e recusado — nasce bloqueado, para a equipe decidir. O total
  -- aqui e a estimativa pelos itens (o real vem da metragem); e o que ha.
  -- Limite zero significa "sem controle de credito": nao bloqueia.
  if p_forma_pagamento like 'boleto%' then
    select c.limite_credito into v_limite from public.clientes c where c.id = v_cliente;
    select coalesce(sum(i.subtotal), 0) into v_total
      from public.pedido_itens i where i.pedido_id = v_pedido;

    if coalesce(v_limite, 0) > 0
       and public.credito_em_uso(v_cliente) + v_total > v_limite then
      v_bloqueado := true;
      update public.pedidos set bloqueado_credito = true where id = v_pedido;
    end if;
  end if;

  -- Parcela minima: com o valor estimado pelos itens, o parcelado nao pode
  -- deixar parcela abaixo do minimo configurado (Pagamento → boleto →
  -- valor minimo por parcela; 200 se nao houver). A vista, Pix e cartao nao
  -- tem minimo. Sem estimativa (total zero) nao ha o que checar aqui — o
  -- modal de "Pedido pronto" cobra com o valor real.
  if p_forma_pagamento = 'boleto_parcelado' and p_parcelas is not null then
    select coalesce(sum(i.subtotal), 0) into v_total
      from public.pedido_itens i where i.pedido_id = v_pedido;

    if v_total > 0 then
      v_minimo := coalesce(
        (v_cfg ->> 'valorMinimoParcela')::numeric,
        (select valor::numeric from public.configuracoes where chave = 'valor_minimo_boleto'),
        200
      );
      v_cobranca := coalesce(public.valor_cobranca_pedido(v_pedido, p_parcelas), v_total);

      if v_minimo > 0 and trunc(v_cobranca / p_parcelas, 2) < v_minimo then
        v_teto := greatest(1, floor(coalesce(public.valor_cobranca_pedido(v_pedido, 1), v_total) / v_minimo)::integer);
        raise exception
          'Com parcela mínima de R$ %, este pedido permite no máximo %x. Escolha menos parcelas.',
          to_char(v_minimo, 'FM999G999G990D00'), v_teto;
      end if;
    end if;
  end if;

  return query
    select p.id, p.numero, p.total, p.bloqueado_credito
      from public.pedidos p
     where p.id = v_pedido;
end;
$function$;

grant execute on function public.criar_pedido(jsonb, text, text, integer) to authenticated;

-- 1. Colunas: forma obrigatória de novo, com o default antigo
update public.pedidos
   set forma_pagamento = 'boleto_avista'
 where forma_pagamento is null;

alter table public.pedidos
  alter column forma_pagamento set default 'boleto_avista',
  alter column forma_pagamento set not null;

-- `parcelas_solicitadas` já era opcional (o CHECK aceita NULL): nada a desfazer.

update public.pedido_forma_pagamento_historico
   set forma_anterior = forma_nova
 where forma_anterior is null;

alter table public.pedido_forma_pagamento_historico
  alter column forma_anterior set not null;

comment on column public.pedidos.forma_pagamento is null;
comment on column public.pedidos.parcelas_solicitadas is null;
