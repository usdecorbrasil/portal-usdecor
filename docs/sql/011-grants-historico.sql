-- ============================================================================
-- Permissões das tabelas novas de histórico
--
-- Este projeto não usa os grants padrão do Supabase: `anon` não lê nem
-- `pedidos`, e cada tabela recebe permissão explícita para `authenticated`.
-- As tabelas de 009 e 010 nasceram sem isso. Consequência: a tela do pedido
-- embute `pedido_nf_historico` no select e o PostgREST recusava a consulta
-- inteira com "permission denied" — que a página traduzia em 404.
--
-- A RLS continua mandando em quem vê o quê (política `is_admin()`); o grant
-- só deixa a consulta chegar até ela.
-- ============================================================================

grant select on public.pedido_nf_historico to authenticated;
grant select on public.auditoria            to authenticated;

-- Quem grava é o servidor, com chave de serviço
grant select, insert on public.pedido_nf_historico to service_role;
grant select, insert on public.auditoria            to service_role;
