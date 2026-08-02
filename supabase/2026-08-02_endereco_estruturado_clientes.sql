-- Separa o endereço do cliente em campos estruturados (rua, número, bairro,
-- cidade) para permitir análise futura por cidade. Não apaga nem altera a
-- coluna "address" existente — ela continua sendo preenchida automaticamente
-- (rua + número + bairro + cidade combinados) pra não quebrar telas que já
-- leem client.address como texto único (Dashboard, Entregas por Setor etc).
-- Cadastros antigos mantêm o endereço como texto livre até serem editados.

alter table public.clients add column if not exists street text;
alter table public.clients add column if not exists number text;
alter table public.clients add column if not exists neighborhood text;
alter table public.clients add column if not exists city text;
