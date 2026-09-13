-- ============================================================================
-- Faturamento pelo portal: NF-e e cobranca a partir de "Pedido pronto"
--
-- O pedido de venda ja nasce no Bling ao lancar "pronto". Daqui em diante a
-- equipe aperta dois botoes na tela do pedido:
--
--   Emitir NF        -> gerar-nfe + enviar (SEFAZ) + baixar DANFE/XML
--   Gerar cobranca   -> lancar-contas + ler links de boleto/Pix das contas
--                       a receber (Bling Conta gera o documento)
--
-- Os arquivos ficam no bucket `documentos`; os caminhos ficam aqui.
-- ============================================================================

alter table pedidos
  add column if not exists bling_nf_id        bigint,
  add column if not exists nf_xml_path        text,
  add column if not exists nf_link_danfe      text,
  add column if not exists link_boleto        text,
  add column if not exists link_pix           text,
  add column if not exists cobranca_gerada_em timestamptz;

comment on column pedidos.link_boleto is
  'Cobranca a vista (boleto unico): link do Bling. Parcelado usa pedido_parcelas.';
comment on column pedidos.link_pix is
  'Cobranca por Pix: link do QR Code no Bling.';

alter table pedido_parcelas
  add column if not exists bling_conta_id  bigint,
  add column if not exists link_boleto     text,
  add column if not exists link_pix        text,
  add column if not exists boleto_pdf_path text;


-- Registra a NF autorizada e avanca a etapa. A etapa entra com origem
-- `bling`, porque foi a SEFAZ (via Bling) quem definiu que a nota existe.
CREATE OR REPLACE FUNCTION public.admin_registrar_nf(
  p_pedido_id  uuid,
  p_bling_nf_id bigint,
  p_numero     text,
  p_chave      text,
  p_pdf_path   text,
  p_xml_path   text,
  p_link_danfe text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  update pedidos
     set bling_nf_id   = p_bling_nf_id,
         nf_numero     = p_numero,
         nf_chave      = p_chave,
         nf_emitida_em = coalesce(nf_emitida_em, now()),
         nf_pdf_path   = coalesce(p_pdf_path, nf_pdf_path),
         nf_xml_path   = coalesce(p_xml_path, nf_xml_path),
         nf_link_danfe = coalesce(p_link_danfe, nf_link_danfe)
   where id = p_pedido_id;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  -- Uma etapa so, mesmo que a acao seja repetida
  if status_atual(p_pedido_id) is distinct from 'nf_emitida'::pedido_status
     and not exists (
       select 1 from pedido_status_historico
        where pedido_id = p_pedido_id and status = 'nf_emitida'
     ) then
    insert into pedido_status_historico (pedido_id, status, origem, criado_por)
    values (p_pedido_id, 'nf_emitida', 'bling', auth.uid());
  end if;
end;
$function$;
