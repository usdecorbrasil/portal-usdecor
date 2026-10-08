-- ============================================================================
-- Desfazer faturamento antigo (pedido em Estampa pronta que já foi ao Bling)
--
-- Caso de 08/10/2026: o #1011 recebeu pedido de venda e cobrança pelo fluxo
-- antigo (em "Pedido pronto") e por isso não podia entrar num agrupamento.
-- Esta RPC limpa, no portal, o vínculo com o Bling e a cobrança, para o
-- pedido voltar a ser um "pronto" limpo — agrupável ou refaturável.
--
-- Só vale enquanto: etapa atual = pronto, sem nota fiscal, sem parcela paga
-- e sem baixa. O cancelamento do lado do Bling (pedido de venda e contas a
-- receber) é feito pelo app antes de chamar aqui; o que não conseguir
-- cancelar lá fica anotado em bling_erro para a equipe resolver no Bling.
-- ============================================================================

create or replace function public.admin_desfazer_faturamento(
  p_pedido_id uuid,
  p_motivo    text,
  p_aviso     text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v        pedidos%rowtype;
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Descreva o motivo (mín. 10 caracteres)';
  end if;

  select * into v from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado';
  end if;
  if v.cancelado_em is not null then
    raise exception 'Pedido cancelado';
  end if;
  if v.agrupado_em is not null or exists (select 1 from pedidos where agrupado_em = p_pedido_id) then
    raise exception 'Pedido agrupado: desfaça o agrupamento primeiro';
  end if;
  if status_atual(p_pedido_id) <> 'pronto' then
    raise exception 'Só dá para desfazer enquanto o pedido está em Estampa pronta';
  end if;
  if v.nf_numero is not null or v.bling_nf_id is not null then
    raise exception 'Nota fiscal já emitida: cancele a NF no Bling antes';
  end if;
  if v.pago_em is not null or exists (select 1 from pedido_parcelas where pedido_id = p_pedido_id and pago_em is not null) then
    raise exception 'Há pagamento registrado neste pedido; não dá para desfazer a cobrança';
  end if;

  update pedidos
     set bling_pedido_id    = null,
         bling_numero       = null,
         bling_sync_status  = 'pendente',
         bling_erro         = p_aviso,
         cobranca_gerada_em = null,
         boleto_id          = null,
         link_boleto        = null,
         link_pix           = null,
         boleto_pdf_path    = null
   where id = p_pedido_id;

  update pedido_parcelas
     set bling_conta_id  = null,
         link_boleto     = null,
         link_pix        = null,
         boleto_pdf_path = null
   where pedido_id = p_pedido_id;

  -- A cobrança pode ser enviada de novo quando o pedido for refaturado
  delete from email_log where pedido_id = p_pedido_id and tipo in ('cobranca', 'pedido_pronto');

  insert into pedido_status_historico (pedido_id, status, origem, observacao, criado_por)
  values (p_pedido_id, 'pronto', 'admin',
          left('Faturamento desfeito: ' || v_motivo, 500), auth.uid());
end;
$$;

revoke all on function public.admin_desfazer_faturamento(uuid, text, text) from public;
grant execute on function public.admin_desfazer_faturamento(uuid, text, text) to authenticated, service_role;
