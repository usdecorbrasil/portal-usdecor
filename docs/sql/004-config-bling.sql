-- ============================================================================
-- Integração com o Bling — configuração
--
-- `produtoEstampaCodigo`: código, no Bling, do produto genérico cobrado por
-- metro. O pedido criado pelo portal vai com UMA linha de metragem, porque no
-- portal a quantidade de peças serve à produção e não ao preço — somar peças
-- não fecharia com o total nem com os boletos.
--
-- `formaPagamentoId`: id da forma de pagamento aplicada às parcelas.
-- 11079000 = "Boleto - Bling Conta" nesta conta.
-- ============================================================================

insert into configuracoes (chave, valor, descricao)
values (
  'bling',
  '{"produtoEstampaCodigo":"ESTAMPA","formaPagamentoId":11079000}',
  'Integração Bling: produto de estampa e forma de pagamento das parcelas'
)
on conflict (chave) do nothing;
