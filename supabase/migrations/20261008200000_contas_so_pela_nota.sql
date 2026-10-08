-- Contas a pagar só pela nota (08/10/2026)
--
-- Decisão do dono: conta a pagar nasce da nota ou recibo lançado em
-- Estoque → Despesas. Sai a conta avulsa (admin_criar_conta_pagar).
--
-- A nota pode ser lançada sem foto ou PDF: a tela pede confirmação e lembra
-- de anexar, e a conta aparece como "sem comprovante" em A pagar. Por isso
-- admin_gerar_contas_despesa continua aceitando nota sem arquivo.
--
-- Contas avulsas que já tenham sido criadas continuam na tabela e seguem
-- podendo ser pagas, alteradas ou canceladas.

drop function if exists public.admin_criar_conta_pagar(text, text, uuid, text, jsonb, text);

notify pgrst, 'reload schema';
