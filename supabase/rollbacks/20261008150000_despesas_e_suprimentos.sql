-- Desfaz 20261008150000_despesas_e_suprimentos. Apaga as tabelas de despesas
-- e suprimentos com os dados que tiverem (não há como preservar; exporte antes).

drop trigger if exists pedidos_sincronizar_consumo_suprimentos on public.pedidos;
drop function if exists public.pedidos_sincronizar_consumo_suprimentos();
drop trigger if exists despesa_item_entrada_suprimento on public.despesa_itens;
drop function if exists public.despesa_item_entrada_suprimento();
drop function if exists public.registrar_movimento_suprimento(uuid, text, numeric, text);
drop function if exists public.admin_excluir_despesa(uuid, text);

drop view if exists public.suprimento_saldos;
drop table if exists public.suprimento_movimentos;
drop table if exists public.despesa_itens;
drop table if exists public.despesas;
drop table if exists public.suprimentos;
drop table if exists public.categorias_despesa;

delete from storage.objects where bucket_id = 'despesas';
delete from storage.buckets where id = 'despesas';
