-- CPF (ou CNPJ) do cliente, preenchido no cadastro de clientes.
-- Guardado já formatado (000.000.000-00 / 00.000.000/0000-00).

alter table public.clients add column if not exists cpf text;
