-- Aviso diário de pendências de contas a pagar (08/10/2026)
--
-- Tipo novo em Configurações → Notificações: contas_pagar_pendencias. Para o
-- aviso já sair desde o primeiro dia, nasce com a mesma lista de e-mails do
-- aviso de pedido novo (hoje a conta administradora). A tela edita a partir
-- daí. Não mexe em lista que já exista para o tipo.
--
-- A rota /api/cron/avisos-diarios guarda a data do último envio em
-- configuracoes.avisos_diarios; a linha é criada pela própria rota (upsert com
-- chave de serviço), sem precisar desta migration.

update public.configuracoes
   set valor = (
         valor::jsonb
         || jsonb_build_object('contas_pagar_pendencias', coalesce(valor::jsonb -> 'pedido_novo', '[]'::jsonb))
       )::text
 where chave = 'notificacoes'
   and not (valor::jsonb ? 'contas_pagar_pendencias');
