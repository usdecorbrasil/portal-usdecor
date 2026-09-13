-- ============================================================================
-- Forma de pagamento do Pix na configuracao do Bling
--
-- 11079001 = "Pix - Bling Conta". E a forma de pagamento da PARCELA que faz o
-- Bling gerar QR Code em vez de boleto; sem este id, um pedido marcado como Pix
-- no portal sairia no ERP sem forma definida.
--
-- Mescla em vez de reescrever: preserva produtoEstampaCodigo e
-- formaPagamentoId, que podem ter mudado desde o 004.
-- ============================================================================

update configuracoes
set valor = (valor::jsonb || '{"formaPagamentoPixId": 11079001}'::jsonb)::text,
    atualizado_em = now()
where chave = 'bling';
