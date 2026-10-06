-- Desfaz 20261006150000_formas_pagamento_cliente.sql
--
-- Atenção: apaga as restrições por cliente já configuradas.

drop trigger if exists pedidos_forma_permitida on public.pedidos;
drop function if exists public.pedidos_forma_permitida();

alter table public.clientes
  drop constraint if exists clientes_formas_pagamento_check;
alter table public.clientes
  drop column if exists formas_pagamento;
