-- Desfaz 20261012140000_conciliacao_extratos. O bucket fica (apagar exige esvaziar antes).
drop function if exists public.admin_excluir_extrato(uuid);
drop function if exists public.admin_fechar_extrato(uuid, boolean);
drop function if exists public.admin_desfazer_conciliacao(uuid);
drop function if exists public.admin_ignorar_lancamento(uuid, text);
drop function if exists public.admin_conciliar_lancamento(uuid, uuid, uuid, integer, boolean, text);
drop table if exists public.extrato_lancamentos;
drop table if exists public.extratos;
