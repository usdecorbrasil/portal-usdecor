-- ============================================================================
-- Ajuste de metragem durante a estampa
--
-- Depois do romaneio, quantidade de pecas nao muda mais nada: o valor e
-- metragem x preco/metro. O que pode mudar e a metragem — uma quebra na
-- estamparia, por exemplo. Este ajuste refaz total, custos por metro e
-- parcelas pelo MESMO caminho de `confirmar_romaneio`, para nao haver dois
-- calculos com resultados diferentes.
--
-- So vale em Estampando e Corte/costura: antes nao ha metragem; a partir de
-- Pronto o pedido ja foi ao Bling com o valor.
-- ============================================================================

create table if not exists pedido_metragem_historico (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references pedidos(id) on delete cascade,
  metragem_de   numeric(12,2),
  metragem_para numeric(12,2) not null,
  motivo        text not null,
  criado_por    uuid,
  created_at    timestamptz not null default now()
);

create index if not exists pedido_metragem_historico_pedido_idx
  on pedido_metragem_historico (pedido_id, created_at desc);

alter table pedido_metragem_historico enable row level security;

drop policy if exists "equipe le historico de metragem" on pedido_metragem_historico;
create policy "equipe le historico de metragem"
  on pedido_metragem_historico
  for select
  to authenticated
  using (is_admin());

-- Este banco nao usa os grants padrao: sem isto a tela do pedido, que embute a
-- tabela no select, recebia "permission denied" (licao do docs/sql/011)
grant select on public.pedido_metragem_historico to authenticated;
grant select, insert on public.pedido_metragem_historico to service_role;


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

  if v_atual not in ('estampando', 'corte_costura') then
    raise exception 'A metragem só pode ser ajustada em Estampando ou Corte/costura';
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
