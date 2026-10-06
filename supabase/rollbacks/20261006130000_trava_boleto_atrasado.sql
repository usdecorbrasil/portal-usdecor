-- Desfaz 20261006130000_trava_boleto_atrasado.sql
--
-- Atenção: apaga as liberações manuais registradas em clientes.

drop trigger if exists pedidos_bloquear_por_atraso on public.pedidos;
drop function if exists public.pedidos_bloquear_por_atraso();
drop function if exists public.admin_liberar_atraso_boleto(uuid, text);
drop function if exists public.cliente_bloqueado_por_atraso(uuid);
drop function if exists public.cliente_boletos_vencidos(uuid);

alter table public.clientes
  drop column if exists atraso_liberado_motivo,
  drop column if exists atraso_liberado_por,
  drop column if exists atraso_liberado_em;
