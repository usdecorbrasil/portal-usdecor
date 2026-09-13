-- ============================================================================
-- Avisos internos: quem da equipe recebe cada e-mail
--
-- Uma chave so em `configuracoes`, em JSON: tipo -> lista de e-mails. A
-- linha precisa existir porque a RLS de `configuracoes` permite UPDATE mas
-- nao INSERT (a tela de Pagamento aprendeu isso do jeito dificil).
--
-- Ja nasce com o e-mail da conta administradora nos dois avisos que existem
-- hoje, para o portal avisar desde o primeiro pedido. A tela de
-- Configuracoes -> Notificacoes edita a partir dai.
-- ============================================================================

insert into configuracoes (chave, valor)
values (
  'notificacoes',
  '{"pedido_novo": ["bestcolortecidos@gmail.com"], "cancelamento_solicitado": ["bestcolortecidos@gmail.com"]}'
)
on conflict (chave) do nothing;
