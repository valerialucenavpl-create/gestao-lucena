-- Preenche a coluna "city" dos clientes já cadastrados, procurando o nome
-- da cidade dentro do texto livre que já existia em "address". Só mexe em
-- quem ainda está com city vazia (não sobrescreve nada preenchido a mão).
-- unaccent() torna a busca insensível a acento (ex: "esperantinopolis" bate
-- com "Esperantinópolis").

create extension if not exists unaccent;

update public.clients set city = 'LAGO DA PEDRA'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%lago da pedra%');

update public.clients set city = 'LAGO JUNCO'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%lago junco%');

update public.clients set city = 'LAGO DOS RODRIGUES'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%lago dos rodrigues%');

update public.clients set city = 'LAGOA GRANDE'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%lagoa grande%');

update public.clients set city = 'BOM LUGAR'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%bom lugar%');

update public.clients set city = 'IGARAPE GRANDE'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%igarape grande%');

update public.clients set city = 'PEDREIRAS'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%pedreiras%');

update public.clients set city = 'PORÇÃO DE PEDRAS'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%de pedras%');

update public.clients set city = 'ESPERANTINOPOLIS'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%esperantin%');

update public.clients set city = 'SAO RAIMUNDO DOCA BEZERRA'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%doca bezerra%');

update public.clients set city = 'BERNADO DO MEARIM'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%mearim%');

update public.clients set city = 'PAULO RAMOS'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%paulo ramos%');

update public.clients set city = 'VITURINO FREIRE'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%freire%');

update public.clients set city = 'MARAJA DO SENA'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%maraja%');

update public.clients set city = 'SANTA LUZIA'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%santa luzia%');

update public.clients set city = 'ALTO ALEGRE DO PINDARE'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%pindare%');

update public.clients set city = 'BACABAL'
  where (city is null or city = '') and address is not null
  and unaccent(address) ilike unaccent('%bacabal%');

-- Resumo: quantos clientes ficaram em cada cidade, e quantos continuam sem
-- cidade identificada (pra você analisar o resto depois, como avisou).
select coalesce(city, '(sem cidade identificada)') as cidade, count(*) as total
from public.clients
where deleted_at is null
group by city
order by total desc;
