-- ============================================================================
-- Observação do cliente imutável + instruções internas da equipe
--
-- `pedidos.notas` é o que o cliente escreveu ao enviar o pedido. A partir do
-- envio ninguém edita nem apaga — nem o admin: é a palavra do cliente, e a
-- produção precisa confiar que o que lê é o que ele pediu. A trava é por
-- gatilho, no banco, para valer por qualquer caminho (tela, RPC, chave de
-- serviço).
--
-- O que a equipe precisa anotar vai para `pedidos.instrucoes_internas`, um
-- campo separado, editável por quem é interno (mesmo portão do romaneio:
-- `is_admin_producao()`), e que o cliente nunca vê.
--
-- A trava permite o primeiro preenchimento (de nulo para texto): o pedido
-- agrupador nasce pelo banco e recebe suas notas nesse momento. O que não
-- pode é mudar ou apagar um texto que já existe.
-- ============================================================================

alter table public.pedidos
  add column if not exists instrucoes_internas text;

comment on column public.pedidos.notas is
  'Observação escrita pelo cliente ao enviar o pedido. Imutável depois de preenchida (gatilho pedidos_notas_imutaveis).';
comment on column public.pedidos.instrucoes_internas is
  'Anotações da equipe sobre o pedido. Editável por interno via admin_definir_instrucoes_internas; o cliente não vê.';

create or replace function public.pedidos_notas_imutaveis()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.notas is not null and new.notas is distinct from old.notas then
    raise exception 'A observação do cliente não pode ser alterada nem apagada depois do envio do pedido'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_notas_imutaveis on public.pedidos;
create trigger pedidos_notas_imutaveis
  before update of notas on public.pedidos
  for each row
  execute function public.pedidos_notas_imutaveis();

create or replace function public.admin_definir_instrucoes_internas(
  p_pedido_id uuid,
  p_texto     text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  -- Quem anota instrução de produção é a equipe inteira, não só o dono
  if not is_admin_producao() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_texto is not null and length(v_texto) > 4000 then
    raise exception 'As instruções internas podem ter no máximo 4000 caracteres';
  end if;

  update pedidos
     set instrucoes_internas = v_texto
   where id = p_pedido_id;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;
end;
$$;

revoke all on function public.admin_definir_instrucoes_internas(uuid, text) from public;
grant execute on function public.admin_definir_instrucoes_internas(uuid, text) to authenticated;
