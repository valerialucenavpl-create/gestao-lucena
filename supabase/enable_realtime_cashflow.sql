-- Habilita a sincronização em tempo real (Realtime) para a tabela "cashflow".
-- Sem isso, a tela de Caixa não recebe aviso automático quando um lançamento
-- é criado em outra tela (venda fechada, conta paga) ou outra aba/sessão,
-- e pode mostrar saldo desatualizado até a página ser recarregada.
alter publication supabase_realtime add table cashflow;
