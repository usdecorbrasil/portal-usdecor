-- Desfaz 20261012130000_recebimento_manual.
drop function if exists public.admin_registrar_recebimento(uuid, integer, date, numeric, text);
