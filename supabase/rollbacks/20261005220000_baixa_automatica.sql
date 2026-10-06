-- Desfaz 20261005220000_baixa_automatica.sql
--
-- Atenção: apaga os pagamentos identificados (pago_em / valor_pago em
-- pedidos). As parcelas marcadas como pagas em pedido_parcelas ficam.

drop function if exists public.registrar_pagamento_pedido(uuid, numeric, timestamptz);
drop function if exists public.registrar_pagamento_parcela(uuid, timestamptz);

alter table public.pedidos
  drop column if exists valor_pago,
  drop column if exists pago_em;
