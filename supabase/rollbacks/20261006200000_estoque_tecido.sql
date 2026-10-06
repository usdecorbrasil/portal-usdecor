-- Desfaz 20261006200000_estoque_tecido.sql
--
-- Atenção: apaga o cadastro de tecidos e todas as movimentações.

drop function if exists public.registrar_movimento_tecido(uuid, uuid, text, numeric, text, uuid);
drop view if exists public.tecido_saldos;
drop table if exists public.tecido_movimentos;
drop table if exists public.tecidos;
