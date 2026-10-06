-- Desfaz 20261006180000_boleto_avista_dias_uteis.sql

drop function if exists public.proximo_dia_util(date, integer);
drop function if exists public.eh_dia_util(date);
drop function if exists public.feriado_nacional(date);
drop function if exists public.pascoa(integer);

alter table public.pedidos
  drop column if exists vencimento_avista;
