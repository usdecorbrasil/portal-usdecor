-- ============================================================================
-- Pix como forma de pagamento, e teto de parcelas em 4
--
-- O CHECK de forma_pagamento so aceitava as quatro formas originais; sem
-- alterar, gravar 'pix' falha com 23514.
--
-- O de parcelas_solicitadas estava travado em 3, enquanto a tela de Pagamento
-- ja oferecia mais — um cliente escolhendo 4x teria o pedido recusado pelo
-- banco. O teto agora e 4, decidido em 13/09/2026, e o mesmo numero esta em
-- MAX_PARCELAS de src/lib/pagamento/config.ts.
-- ============================================================================

alter table pedidos drop constraint pedidos_forma_pagamento_check;

alter table pedidos add constraint pedidos_forma_pagamento_check
  check (forma_pagamento = any (array[
    'boleto_avista'::text,
    'boleto_parcelado'::text,
    'pix'::text,
    'cartao_credito'::text,
    'cartao_debito'::text
  ]));

alter table pedidos drop constraint pedidos_parcelas_solicitadas_check;

alter table pedidos add constraint pedidos_parcelas_solicitadas_check
  check (parcelas_solicitadas is null
         or (parcelas_solicitadas >= 2 and parcelas_solicitadas <= 4));
