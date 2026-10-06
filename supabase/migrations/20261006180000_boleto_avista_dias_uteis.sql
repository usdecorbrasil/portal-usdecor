-- ============================================================================
-- Boleto à vista vence em dias úteis
--
-- `proximo_dia_util(data, dias)` anda `dias` dias úteis a partir de `data`,
-- pulando sábados, domingos e feriados nacionais — os fixos e os móveis
-- (Carnaval, Sexta-feira Santa e Corpus Christi, contados a partir da
-- Páscoa, calculada pelo algoritmo de Meeus/Jones/Butcher). Feriados
-- estaduais e municipais ficam de fora: o boleto é cobrado no banco, que
-- segue o calendário nacional.
--
-- `pedidos.vencimento_avista` guarda a data usada no boleto único, para a
-- leitura das contas a receber casar pelo mesmo vencimento mesmo que a
-- cobrança seja relida em outro dia.
-- ============================================================================

alter table public.pedidos
  add column if not exists vencimento_avista date;

comment on column public.pedidos.vencimento_avista is
  'Vencimento do boleto à vista (hoje + dias úteis configurados), gravado ao enviar o pedido de venda ao Bling.';

-- Domingo de Páscoa do ano (Meeus/Jones/Butcher, calendário gregoriano)
create or replace function public.pascoa(p_ano integer)
returns date
language sql
immutable
as $$
  with g as (
    select p_ano as y,
           p_ano % 19 as a,
           p_ano / 100 as b,
           p_ano % 100 as c
  ), h as (
    select *,
           b / 4 as d,
           b % 4 as e,
           (b + 8) / 25 as f
      from g
  ), i as (
    select *,
           (b - f + 1) / 3 as gg
      from h
  ), j as (
    select *,
           (19 * a + b - d - gg + 15) % 30 as hh,
           c / 4 as ii,
           c % 4 as k
      from i
  ), l as (
    select *,
           (32 + 2 * e + 2 * ii - hh - k) % 7 as ll
      from j
  ), m as (
    select *,
           (a + 11 * hh + 22 * ll) / 451 as mm
      from l
  )
  select make_date(y, (hh + ll - 7 * mm + 114) / 31, ((hh + ll - 7 * mm + 114) % 31) + 1)
    from m;
$$;

create or replace function public.feriado_nacional(p_data date)
returns boolean
language sql
immutable
as $$
  select
    -- Fixos
    to_char(p_data, 'MM-DD') in (
      '01-01', -- Confraternização Universal
      '04-21', -- Tiradentes
      '05-01', -- Dia do Trabalho
      '09-07', -- Independência
      '10-12', -- Nossa Senhora Aparecida
      '11-02', -- Finados
      '11-15', -- Proclamação da República
      '11-20', -- Consciência Negra (nacional desde 2024)
      '12-25'  -- Natal
    )
    -- Móveis, a partir da Páscoa
    or p_data in (
      public.pascoa(extract(year from p_data)::integer) - 48, -- Carnaval (segunda)
      public.pascoa(extract(year from p_data)::integer) - 47, -- Carnaval (terça)
      public.pascoa(extract(year from p_data)::integer) - 2,  -- Sexta-feira Santa
      public.pascoa(extract(year from p_data)::integer) + 60  -- Corpus Christi
    );
$$;

create or replace function public.eh_dia_util(p_data date)
returns boolean
language sql
immutable
as $$
  select extract(isodow from p_data) < 6 and not public.feriado_nacional(p_data);
$$;

-- Anda p_dias dias úteis a partir de p_data (sem contar o próprio dia).
-- p_dias = 0 devolve o próprio dia, ou o próximo útil se ele não for.
create or replace function public.proximo_dia_util(p_data date, p_dias integer)
returns date
language plpgsql
immutable
as $$
declare
  v_data  date := p_data;
  v_resta integer := greatest(coalesce(p_dias, 0), 0);
begin
  if v_resta = 0 then
    while not public.eh_dia_util(v_data) loop
      v_data := v_data + 1;
    end loop;
    return v_data;
  end if;

  while v_resta > 0 loop
    v_data := v_data + 1;
    if public.eh_dia_util(v_data) then
      v_resta := v_resta - 1;
    end if;
  end loop;

  return v_data;
end;
$$;

grant execute on function public.pascoa(integer) to authenticated, service_role;
grant execute on function public.feriado_nacional(date) to authenticated, service_role;
grant execute on function public.eh_dia_util(date) to authenticated, service_role;
grant execute on function public.proximo_dia_util(date, integer) to authenticated, service_role;
