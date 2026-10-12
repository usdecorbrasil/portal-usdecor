-- ============================================================================
-- Envio de tecido sem duplicidade (12/10/2026, pedido do dono: toda entrada
-- é conferida contra repetição — número, tipo, fornecedor, valor, quantidade)
--
-- O cliente avisa o envio pelo portal e a equipe pode lançar a mesma nota
-- pela foto: sem esta trava viravam dois envios e, conferidos, o saldo
-- entrava em dobro. Vale para os dois caminhos (cadastro à mão e nota lida).
--
--   1. mesmo cliente + mesmo nº de NF, em envio não recusado → recusa;
--   2. sem NF: mesmo cliente + mesmo tecido + mesma metragem informada no
--      mesmo dia → recusa (é o "cupom sem número" do tecido).
-- ============================================================================

create or replace function public.tecido_envios_validar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nf     text := nullif(ltrim(regexp_replace(coalesce(new.nf_numero, ''), '\D', '', 'g'), '0'), '');
  v_outro  record;
begin
  if v_nf is not null then
    select e.id, e.criado_em, e.situacao, t.nome as tecido
      into v_outro
      from public.tecido_envios e
      join public.tecidos t on t.id = e.tecido_id
     where e.id <> new.id
       and e.cliente_id = new.cliente_id
       and e.situacao <> 'recusado'
       and nullif(ltrim(regexp_replace(coalesce(e.nf_numero, ''), '\D', '', 'g'), '0'), '') = v_nf
     limit 1;
    if found then
      raise exception 'A NF % já está em outro envio deste cliente (% — %, %).',
        v_nf, v_outro.tecido,
        to_char(v_outro.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
        case v_outro.situacao when 'conferido' then 'já conferido' else 'aguardando conferência' end
        using hint = 'envio_duplicado', errcode = '23505';
    end if;
  elsif tg_op = 'INSERT' then
    select e.id, e.criado_em
      into v_outro
      from public.tecido_envios e
     where e.cliente_id = new.cliente_id
       and e.tecido_id = new.tecido_id
       and e.situacao <> 'recusado'
       and e.nf_numero is null
       and e.metros_informados = new.metros_informados
       and (e.criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
     limit 1;
    if found then
      raise exception 'Já existe um envio igual deste cliente hoje (mesmo tecido, % m, sem NF). Se for outro envio, informe o número da NF.',
        to_char(new.metros_informados, 'FM999G999G990D00')
        using hint = 'envio_duplicado', errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tecido_envios_validar() from public;

drop trigger if exists trg_tecido_envios_validar on public.tecido_envios;
create trigger trg_tecido_envios_validar
  before insert or update of nf_numero, cliente_id on public.tecido_envios
  for each row execute function public.tecido_envios_validar();

notify pgrst, 'reload schema';
