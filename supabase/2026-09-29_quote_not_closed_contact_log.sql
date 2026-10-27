-- "Não Fechou": sinalização manual (deixa o card vermelho na lista de
-- Orçamentos) sem mexer no status oficial do orçamento.
alter table public.quotes add column if not exists not_closed boolean default false;

-- Histórico de tentativas de contato/prospecção (mensagem, ligação etc.) —
-- lista de registros, guardada como array no próprio orçamento (mesmo
-- padrão já usado pra "items"/"freight_items").
alter table public.quotes add column if not exists contact_log jsonb;
