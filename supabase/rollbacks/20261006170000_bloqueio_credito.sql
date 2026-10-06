-- Desfaz 20261006170000_bloqueio_credito.sql
--
-- Recria criar_pedido com o corpo de docs/sql/013 (retorno sem a flag) e
-- apaga as colunas de bloqueio. Pedidos que estavam bloqueados ficam
-- "aguardando" sem a marca.

drop function if exists public.admin_liberar_bloqueio_credito(uuid, text);
drop trigger if exists pedidos_confirmar_exige_liberacao on public.pedido_status_historico;
drop function if exists public.pedidos_confirmar_exige_liberacao();

drop function if exists public.criar_pedido(jsonb, text, text, integer);

CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_itens jsonb,
  p_notas text DEFAULT NULL::text,
  p_forma_pagamento text DEFAULT 'boleto_avista'::text,
  p_parcelas integer DEFAULT NULL::integer
)
 RETURNS TABLE(pedido_id uuid, numero bigint, total numeric)
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
  if p_forma_pagamento = 'boleto_parcelado' then
    if not public.cliente_pode_parcelar(v_cliente) then
      raise exception
        'Limite de crédito atingido. Escolha boleto à vista ou outra forma de pagamento.';
    end if;

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

  -- Sem checagem de valor aqui: o total so existe depois da estampa

  return query
    select p.id, p.numero, p.total
      from public.pedidos p
     where p.id = v_pedido;
end;
$function$;


grant execute on function public.criar_pedido(jsonb, text, text, integer) to authenticated;

alter table public.pedidos
  drop column if exists bloqueio_liberado_motivo,
  drop column if exists bloqueio_liberado_por,
  drop column if exists bloqueio_liberado_em,
  drop column if exists bloqueado_credito;
