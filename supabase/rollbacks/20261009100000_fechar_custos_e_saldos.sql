-- Desfaz 20261009100000_fechar_custos_e_saldos.sql: volta as leituras como
-- estavam em 20261008150000 e 20261006210000.

grant execute on function public.saldo_tecido(uuid, uuid) to authenticated, service_role;

create or replace view public.suprimento_saldos as
  select s.id as suprimento_id,
         coalesce(sum(case m.tipo when 'entrada' then m.quantidade
                                  when 'ajuste'  then m.quantidade
                                  when 'consumo' then -m.quantidade end), 0)::numeric(12,3) as saldo,
         max(m.criado_em) as ultimo_movimento
    from public.suprimentos s
    left join public.suprimento_movimentos m on m.suprimento_id = s.id
   group by s.id;
grant select on public.suprimento_saldos to authenticated;

drop view if exists public.suprimento_movimentos_producao;

drop policy if exists "dono le movimentos suprimento" on public.suprimento_movimentos;
drop policy if exists "equipe le movimentos suprimento" on public.suprimento_movimentos;
create policy "equipe le movimentos suprimento" on public.suprimento_movimentos
  for select to authenticated using (is_admin_producao());

notify pgrst, 'reload schema';
