-- Desfaz 20261006210000_consumo_tecido_pedido.sql
--
-- Os movimentos de consumo já lançados ficam em tecido_movimentos; só o
-- vínculo do pedido com o tecido e a automação são removidos.

drop trigger if exists pedidos_sincronizar_consumo_tecido on public.pedidos;
drop function if exists public.pedidos_sincronizar_consumo_tecido();
drop trigger if exists pedidos_estampando_exige_tecido on public.pedido_status_historico;
drop function if exists public.pedidos_estampando_exige_tecido();
drop function if exists public.definir_tecido_pedido(uuid, uuid, numeric);
drop function if exists public.saldo_tecido(uuid, uuid);

alter table public.pedidos
  drop column if exists tecido_id;
