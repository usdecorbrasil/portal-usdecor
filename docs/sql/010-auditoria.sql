-- ============================================================================
-- Auditoria geral: quem mudou o quê, fora do pedido
--
-- O pedido já tinha trilha (quantidade, preço, forma de pagamento, nota, e
-- agora com autor na tela). Fora dele havia buraco: editar cadastro de
-- cliente, trocar preço por metro, ativar/desativar acesso, mexer na equipe ou
-- nas formas de pagamento não deixava rastro nenhum.
--
-- Uma tabela só, genérica, em vez de uma por entidade: são mudanças de
-- cadastro, sem cálculo em cima delas. O que se pergunta é sempre "o que houve
-- com este cliente / este usuário", e isso `entidade + entidade_id` responde.
--
-- `campos` guarda a lista do que mudou em JSON — [{campo, de, para}] — porque
-- um cadastro tem 15 campos e criar coluna para cada um não se sustenta.
--
-- A gravação vem do servidor com chave de serviço (as ações usam admin
-- client), então não há política de insert: só leitura para a equipe.
-- ============================================================================

create table if not exists auditoria (
  id          uuid primary key default gen_random_uuid(),
  entidade    text not null,
  entidade_id uuid,
  acao        text not null,
  campos      jsonb not null default '[]'::jsonb,
  motivo      text,
  criado_por  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists auditoria_entidade_idx
  on auditoria (entidade, entidade_id, created_at desc);

create index if not exists auditoria_data_idx
  on auditoria (created_at desc);

comment on table auditoria is
  'Trilha de alteracoes de cadastro fora do pedido. Ver docs/sql/010.';
comment on column auditoria.entidade is
  'cliente | equipe | configuracao';
comment on column auditoria.acao is
  'criou | editou | ativou | desativou | arquivou | restaurou | senha';
comment on column auditoria.campos is
  'Lista [{campo, de, para}] com o que mudou, ja em texto.';

alter table auditoria enable row level security;

drop policy if exists "equipe le auditoria" on auditoria;
create policy "equipe le auditoria"
  on auditoria
  for select
  to authenticated
  using (is_admin());
