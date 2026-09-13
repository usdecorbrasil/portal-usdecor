-- ============================================================================
-- Taxa por forma de pagamento — parte C
--
-- Cria a linha de configuração das formas de pagamento.
--
-- Por que por SQL e não pelo app: a política de RLS de `configuracoes` permite
-- ATUALIZAR, mas não INSERIR. As telas antigas só atualizavam, por isso nunca
-- esbarraram nisso. Em vez de afrouxar a permissão de escrita da tabela, a
-- linha nasce aqui e o app só atualiza — igual às outras chaves.
--
-- Os valores são os mesmos que já valiam (boleto 3x, mínimo R$ 200, 30 dias),
-- então nada muda de comportamento até você editar na tela.
-- ============================================================================

insert into configuracoes (chave, valor, descricao)
values (
  'formas_pagamento',
  '{"boleto":{"ativa":true,"maxParcelas":3,"valorMinimoParcela":200,"percentual":0,"taxaFixa":0,"intervaloDias":30},"cartao_credito":{"ativa":true,"maxParcelas":6,"valorMinimoParcela":100,"percentual":0,"taxaFixa":0,"intervaloDias":30},"cartao_debito":{"ativa":true,"maxParcelas":1,"valorMinimoParcela":0,"percentual":0,"taxaFixa":0,"intervaloDias":30}}',
  'Formas de pagamento aceitas, parcelamento e taxas'
)
on conflict (chave) do nothing;
