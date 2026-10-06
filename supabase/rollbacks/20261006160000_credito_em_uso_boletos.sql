-- Desfaz 20261006160000_credito_em_uso_boletos.sql
--
-- `cliente_pode_parcelar` já existia antes desta migration, com outro corpo
-- que não está no repositório. Este rollback a redefine com a regra antiga
-- conhecida (limite menos total dos pedidos não fechados), que é o que a
-- "Minha conta" calculava antes. Se o corpo original for outro, restaure-o
-- pelo histórico do SQL Editor do Supabase.

drop function if exists public.clientes_credito_em_uso();

create or replace function public.cliente_pode_parcelar(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select c.limite_credito > 0
     and (
       c.limite_credito
       - coalesce((
           select sum(p.total)
             from pedidos p
            where p.cliente_id = c.id
              and p.cancelado_em is null
              and public.status_atual(p.id) <> 'fechado'
         ), 0)
     ) > 0
    from clientes c
   where c.id = p_cliente_id;
$$;

drop function if exists public.credito_em_uso(uuid);
