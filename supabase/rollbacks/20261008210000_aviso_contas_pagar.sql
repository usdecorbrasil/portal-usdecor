-- Desfaz 20261008210000_aviso_contas_pagar.sql: tira o tipo novo da lista de
-- notificações.

update public.configuracoes
   set valor = (valor::jsonb - 'contas_pagar_pendencias')::text
 where chave = 'notificacoes';
