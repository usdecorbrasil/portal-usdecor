-- Desfaz 20261008190000_contas_a_pagar.sql

drop trigger if exists trg_despesas_cancelar_contas on public.despesas;
drop function if exists public.despesas_cancelar_contas_ao_excluir();

drop function if exists public.admin_alterar_conta_pagar(uuid, date, numeric, text);
drop function if exists public.admin_cancelar_conta_pagar(uuid, text);
drop function if exists public.admin_estornar_conta_pagar(uuid, text);
drop function if exists public.admin_baixar_conta_pagar(uuid, date, numeric, text);
drop function if exists public.admin_criar_conta_pagar(text, text, uuid, text, jsonb, text);
drop function if exists public.admin_gerar_contas_despesa(uuid, text, jsonb, uuid);
drop function if exists public.contas_pagar_validar_parcelas(jsonb, numeric);

drop table if exists public.contas_pagar;

alter table public.despesas drop column if exists condicao_pagamento;

notify pgrst, 'reload schema';
