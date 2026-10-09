-- Fecha leituras que vazavam pelo PostgREST (auditoria de 09/10/2026)
--
-- 1. suprimento_movimentos.custo_total: a política deixava a produção
--    (funcionario) ler a tabela inteira, custo incluído, direto pela API —
--    a tela escondia o valor, o banco não. Agora a tabela é só de
--    admin/financeiro, e a produção lê a view suprimento_movimentos_producao,
--    que não tem custo (e já traz o nº do pedido).
-- 2. suprimento_saldos: view sem security_invoker e com grant para
--    authenticated — qualquer logado, inclusive cliente, lia todos os saldos.
--    Passa a responder só para a equipe interna (is_admin_producao()).
--    Continua sem security_invoker de propósito: a produção não lê mais a
--    tabela de movimentos, e o saldo (sem valor) ela precisa ver.
-- 3. saldo_tecido(cliente, tecido): security definer liberada para
--    authenticated e sem conferir o dono — um cliente lia o saldo de outro.
--    Ninguém no app chama direto; só as funções do banco
--    (definir_tecido_pedido, consumo do romaneio), que seguem podendo.

-- 1 ------------------------------------------------------------ movimentos
drop policy if exists "equipe le movimentos suprimento" on public.suprimento_movimentos;
drop policy if exists "dono le movimentos suprimento" on public.suprimento_movimentos;
create policy "dono le movimentos suprimento" on public.suprimento_movimentos
  for select to authenticated using (public.is_admin());

create or replace view public.suprimento_movimentos_producao as
  select m.id, m.suprimento_id, m.tipo, m.quantidade, m.pedido_id,
         p.numero as pedido_numero, m.observacao, m.criado_em
    from public.suprimento_movimentos m
    left join public.pedidos p on p.id = m.pedido_id
   where public.is_admin_producao();

comment on view public.suprimento_movimentos_producao is
  'Movimentos de suprimento sem custo, para a produção. A tabela suprimento_movimentos é só de admin/financeiro.';

revoke all on public.suprimento_movimentos_producao from public, anon;
grant select on public.suprimento_movimentos_producao to authenticated;
grant all on public.suprimento_movimentos_producao to service_role;

-- 2 ---------------------------------------------------------------- saldos
create or replace view public.suprimento_saldos as
  select s.id as suprimento_id,
         coalesce(sum(case m.tipo when 'entrada' then m.quantidade
                                  when 'ajuste'  then m.quantidade
                                  when 'consumo' then -m.quantidade end), 0)::numeric(12,3) as saldo,
         max(m.criado_em) as ultimo_movimento
    from public.suprimentos s
    left join public.suprimento_movimentos m on m.suprimento_id = s.id
   where public.is_admin_producao()
   group by s.id;

revoke all on public.suprimento_saldos from public, anon;
grant select on public.suprimento_saldos to authenticated;

-- 3 ---------------------------------------------------------- saldo_tecido
revoke execute on function public.saldo_tecido(uuid, uuid) from public, anon, authenticated;
grant execute on function public.saldo_tecido(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
