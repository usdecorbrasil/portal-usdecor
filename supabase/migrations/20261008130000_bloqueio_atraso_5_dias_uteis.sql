-- ============================================================================
-- Boleto atrasado há mais de 5 dias úteis: o pedido entra, mas não anda
--
-- Regra nova (08/10/2026), no lugar da trava de 06/10:
--
--   1. O cliente com boleto vencido CONTINUA podendo enviar pedido. A tela
--      avisa que o pedido não será atendido até a regularização.
--   2. O que trava é o ANDAMENTO: enquanto o cliente tiver boleto vencido há
--      mais de 5 dias úteis (sem pagamento e sem liberação do dono), nenhum
--      pedido dele recebe lançamento manual de etapa — confirmar, impressão,
--      estampando, estampa pronta, faturar, fechar. A regra vive num gatilho
--      em pedido_status_historico, para valer por qualquer caminho.
--   3. Lançamentos de origem 'sistema' (criação do pedido, migrações) e
--      'bling' (baixa de parcela, nota fiscal, expedição) passam: a baixa de
--      pagamento é justamente o que destrava, e não pode ser recusada.
--
-- "Mais de 5 dias úteis" usa proximo_dia_util (fins de semana e feriados
-- nacionais): o boleto trava a partir do 6º dia útil depois do vencimento.
-- A liberação manual (admin_liberar_atraso_boleto) continua valendo até o
-- próximo boleto vencer, como antes.
-- ============================================================================

-- A trava de criação sai: o cliente pode enviar o pedido.
drop trigger if exists pedidos_bloquear_por_atraso on public.pedidos;
drop function if exists public.pedidos_bloquear_por_atraso();

-- Boletos vencidos e não pagos do cliente, com a data em que cada um passa a
-- travar. Reúne as parcelas (pedido_parcelas) e o boleto à vista, que fica no
-- próprio pedido (vencimento_avista / pago_em) quando não há parcelas.
create or replace function public.cliente_boletos_atraso(p_cliente_id uuid)
returns table (
  pedido_id  uuid,
  parcela_id uuid,
  vencimento date,
  trava_em   date,
  trava      boolean
)
language sql
stable
security definer
set search_path = 'public'
as $$
  with liberacao as (
    select atraso_liberado_em::date as corte
      from clientes
     where id = p_cliente_id
  ),
  boletos as (
    select p.id as pedido_id, pp.id as parcela_id, pp.vencimento::date as vencimento
      from pedido_parcelas pp
      join pedidos p on p.id = pp.pedido_id
     where p.cliente_id = p_cliente_id
       and p.cancelado_em is null
       and pp.pago_em is null
    union all
    select p.id, null::uuid, p.vencimento_avista::date
      from pedidos p
     where p.cliente_id = p_cliente_id
       and p.cancelado_em is null
       and p.forma_pagamento = 'boleto_avista'
       and p.cobranca_gerada_em is not null
       and p.vencimento_avista is not null
       and p.pago_em is null
       and not exists (select 1 from pedido_parcelas x where x.pedido_id = p.id)
  )
  select b.pedido_id,
         b.parcela_id,
         b.vencimento,
         -- Dia em que o boleto passa a travar: o 6º dia útil após o vencimento
         public.proximo_dia_util(b.vencimento, 5) + 1 as trava_em,
         public.proximo_dia_util(b.vencimento, 5) < current_date as trava
    from boletos b
    left join liberacao l on true
   where b.vencimento < current_date
     and (l.corte is null or b.vencimento > l.corte)
     -- Quem pode ver: o próprio cliente, a equipe, ou chamada interna
     -- (chave de serviço / gatilho, sem usuário logado)
     and (
       auth.uid() is null
       or exists (
            select 1
              from profiles pr
             where pr.id = auth.uid()
               and pr.ativo
               and (pr.cliente_id = p_cliente_id
                    or pr.role in ('admin', 'financeiro', 'funcionario'))
          )
     )
   order by b.vencimento;
$$;

-- Quantos boletos TRAVAM o cliente hoje (vencidos há mais de 5 dias úteis).
-- Mesma assinatura de antes: as telas que a usam passam a mostrar só o que
-- de fato bloqueia.
create or replace function public.cliente_boletos_vencidos(p_cliente_id uuid)
returns integer
language sql
stable
security definer
set search_path = 'public'
as $$
  select count(*)::integer
    from public.cliente_boletos_atraso(p_cliente_id)
   where trava;
$$;

-- cliente_bloqueado_por_atraso(uuid) continua: boletos_vencidos > 0.

-- Clientes travados hoje, para a lista de pedidos e o dashboard marcarem os
-- pedidos sem uma consulta por linha. Só a equipe.
create or replace function public.clientes_bloqueados_por_atraso()
returns setof uuid
language sql
stable
security definer
set search_path = 'public'
as $$
  select c.id
    from clientes c
   where exists (
           select 1
             from profiles pr
            where pr.id = auth.uid()
              and pr.ativo
              and pr.role in ('admin', 'financeiro', 'funcionario')
         )
     and public.cliente_bloqueado_por_atraso(c.id);
$$;

-- Gatilho: cliente travado não recebe lançamento manual de etapa.
create or replace function public.status_bloquear_por_atraso()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_cliente uuid;
begin
  -- Sistema e Bling passam: criação do pedido, baixa de pagamento, nota,
  -- expedição. Só o que a equipe lança à mão fica preso.
  if coalesce(new.origem::text, 'admin') in ('sistema', 'bling') then
    return new;
  end if;

  select cliente_id into v_cliente from pedidos where id = new.pedido_id;

  if v_cliente is not null and public.cliente_bloqueado_por_atraso(v_cliente) then
    raise exception
      'Cliente com boleto vencido há mais de 5 dias úteis. O pedido só anda depois do pagamento ou da liberação pelo dono (na tela do cliente).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists status_bloquear_por_atraso on public.pedido_status_historico;
create trigger status_bloquear_por_atraso
  before insert on public.pedido_status_historico
  for each row
  execute function public.status_bloquear_por_atraso();

revoke all on function public.cliente_boletos_atraso(uuid) from public;
revoke all on function public.clientes_bloqueados_por_atraso() from public;
grant execute on function public.cliente_boletos_atraso(uuid) to authenticated, service_role;
grant execute on function public.clientes_bloqueados_por_atraso() to authenticated, service_role;
