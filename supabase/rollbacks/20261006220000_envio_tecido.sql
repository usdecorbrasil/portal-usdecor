-- Desfaz 20261006220000_envio_tecido.sql
--
-- As entradas criadas pelas conferências ficam em tecido_movimentos (são
-- estoque real); só o registro dos envios e as funções são removidos.

drop function if exists public.recusar_envio_tecido(uuid, text);
drop function if exists public.conferir_envio_tecido(uuid, numeric, text);
drop function if exists public.anexar_nf_envio_tecido(uuid, text, text);

drop table if exists public.tecido_envios;
