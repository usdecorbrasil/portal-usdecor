-- Desfaz 20261012100000_tecido_envios_sem_duplicidade.sql

drop trigger if exists trg_tecido_envios_validar on public.tecido_envios;
drop function if exists public.tecido_envios_validar();

notify pgrst, 'reload schema';
