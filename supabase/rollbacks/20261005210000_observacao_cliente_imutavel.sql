-- Desfaz 20261005210000_observacao_cliente_imutavel.sql
--
-- Atenção: apagar a coluna descarta as instruções internas já escritas.

drop function if exists public.admin_definir_instrucoes_internas(uuid, text);

drop trigger if exists pedidos_notas_imutaveis on public.pedidos;
drop function if exists public.pedidos_notas_imutaveis();

comment on column public.pedidos.notas is null;

alter table public.pedidos
  drop column if exists instrucoes_internas;
