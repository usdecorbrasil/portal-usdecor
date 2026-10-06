-- ============================================================================
-- Formas de pagamento por cliente
--
-- Cada cliente tem a lista de formas que pode escolher no carrinho. Nasce com
-- todas; o dono tira ou devolve pela tela do cliente. Além da configuração
-- geral de Pagamento (que liga/desliga a forma para todo mundo), esta é a
-- restrição individual — as duas precisam permitir.
--
-- A regra vale no banco (gatilho em pedidos) para qualquer caminho de
-- escrita; tela e Server Action só antecipam a mensagem. Só o papel cliente
-- é travado: pedido criado pela equipe em nome do cliente não passa por aqui.
-- ============================================================================

alter table public.clientes
  add column if not exists formas_pagamento text[] not null
    default array['boleto_avista', 'boleto_parcelado', 'pix', 'cartao_credito', 'cartao_debito'];

-- Só valores conhecidos e ao menos um
alter table public.clientes
  drop constraint if exists clientes_formas_pagamento_check;
alter table public.clientes
  add constraint clientes_formas_pagamento_check check (
    cardinality(formas_pagamento) >= 1
    and formas_pagamento <@ array['boleto_avista', 'boleto_parcelado', 'pix', 'cartao_credito', 'cartao_debito']::text[]
  );

comment on column public.clientes.formas_pagamento is
  'Formas de pagamento que este cliente pode escolher no carrinho. Editável pelo dono; validado pelo gatilho pedidos_forma_permitida.';

create or replace function public.pedidos_forma_permitida()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_formas text[];
begin
  if v_uid is null then
    return new;
  end if;

  if not exists (select 1 from profiles where id = v_uid and role = 'cliente') then
    return new;
  end if;

  select formas_pagamento into v_formas from clientes where id = new.cliente_id;

  if v_formas is not null and not (new.forma_pagamento = any(v_formas)) then
    raise exception 'Esta forma de pagamento não está disponível para o seu cadastro. Escolha outra ou fale com a Best Color Tecidos.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists pedidos_forma_permitida on public.pedidos;
create trigger pedidos_forma_permitida
  before insert on public.pedidos
  for each row
  execute function public.pedidos_forma_permitida();
