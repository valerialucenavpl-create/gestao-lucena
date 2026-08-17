-- Detalha os insumos da montagem com quantidade + valor unitário (em vez
-- de um valor único), e acrescenta a mão de obra (funcionários x horas)
-- como uma lista separada, pra aparecer no detalhamento financeiro junto
-- com os custos fixos, comissão e taxa de maquininha que já existem.
alter table public.montagens add column if not exists labor jsonb;
