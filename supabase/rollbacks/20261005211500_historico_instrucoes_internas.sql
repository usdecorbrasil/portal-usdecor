-- Desfaz 20261005211500_historico_instrucoes_internas.sql
--
-- Atenção: apaga o histórico já gravado.

drop trigger if exists pedidos_instrucoes_historico on public.pedidos;
drop function if exists public.pedidos_instrucoes_historico();

drop table if exists public.pedido_instrucoes_historico;
