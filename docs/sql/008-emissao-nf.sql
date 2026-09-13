-- ============================================================================
-- Emitir ou não a nota fiscal, por pedido
--
-- Nem toda venda sai com nota. A decisão é da empresa, não do cliente, e
-- precisa existir antes de "Pedido pronto" — é quando o pedido de venda nasce
-- no Bling e alguém decide faturar.
--
-- Nasce `true`: os pedidos que já existem continuam com nota, que é o que
-- sempre foi feito. Quem dispensa a nota está fazendo a exceção, e por isso é
-- quem justifica.
--
-- Não há tabela de histórico: o que importa é a decisão vigente e quem a tomou
-- por último. As três colunas de auditoria cobrem isso sem uma tabela nova.
-- ============================================================================

alter table pedidos
  add column if not exists emitir_nf              boolean not null default true,
  add column if not exists emitir_nf_motivo       text,
  add column if not exists emitir_nf_definido_em  timestamptz,
  add column if not exists emitir_nf_definido_por uuid;

comment on column pedidos.emitir_nf is
  'false = venda sem nota fiscal. Decidido pela equipe ate "Pedido pronto".';
comment on column pedidos.emitir_nf_motivo is
  'Justificativa obrigatoria quando emitir_nf = false.';
comment on column pedidos.emitir_nf_definido_por is
  'auth.uid() de quem mudou por ultimo. Sem FK: profiles pode ser desativado.';


CREATE OR REPLACE FUNCTION public.admin_definir_emissao_nf(
  p_pedido_id uuid,
  p_emitir boolean,
  p_motivo text DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_atual  pedido_status;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  v_atual := status_atual(p_pedido_id);

  if v_atual is null then
    raise exception 'Pedido não encontrado';
  end if;

  -- Depois da nota emitida a decisão virou fato fiscal: mudar aqui só criaria
  -- divergência com o que já foi para a SEFAZ
  if v_atual in ('nf_emitida','expedido','entregue','fechado') then
    raise exception 'Nota fiscal já emitida. A decisão não pode mais ser alterada.';
  end if;

  if not p_emitir and (v_motivo is null or length(v_motivo) < 10) then
    raise exception 'Descreva por que o pedido sai sem nota fiscal (mín. 10 caracteres)';
  end if;

  update pedidos
     set emitir_nf              = p_emitir,
         emitir_nf_motivo       = case when p_emitir then null else v_motivo end,
         emitir_nf_definido_em  = now(),
         emitir_nf_definido_por = auth.uid()
   where id = p_pedido_id;
end;
$function$;
