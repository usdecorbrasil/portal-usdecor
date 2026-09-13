-- ============================================================================
-- Campos fiscais do cliente
--
-- Necessários para emissão de nota fiscal: sem endereço e indicador de
-- inscrição estadual, o contato criado no Bling não serve para faturar.
--
-- `indicador_ie` nasce 9 (não contribuinte) porque é o que o portal já enviava
-- ao Bling — os clientes atuais não mudam de comportamento.
-- ============================================================================

alter table clientes
  add column if not exists inscricao_estadual text,
  add column if not exists indicador_ie       smallint not null default 9,
  add column if not exists cep                text,
  add column if not exists endereco           text,
  add column if not exists numero             text,
  add column if not exists complemento        text,
  add column if not exists bairro             text,
  add column if not exists municipio          text,
  add column if not exists uf                 text;

comment on column clientes.indicador_ie is
  '1 = contribuinte ICMS, 2 = isento, 9 = nao contribuinte (padrao)';
