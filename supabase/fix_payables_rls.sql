-- Corrige permissões RLS da tabela payables
-- Execute este script no Supabase SQL Editor
-- (Painel Supabase → SQL Editor → New query → cole e clique em Run)

-- 1. Remove políticas antigas de UPDATE que podem estar bloqueando
DROP POLICY IF EXISTS "Users can update their own payables" ON payables;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON payables;
DROP POLICY IF EXISTS "payables_update_policy" ON payables;

-- 2. Cria política permissiva: qualquer usuário autenticado pode atualizar qualquer payable
--    (sistema de empresa única — todos os usuários são da mesma empresa)
CREATE POLICY "Allow authenticated update payables"
ON payables FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Garante também política de SELECT (caso não exista)
DROP POLICY IF EXISTS "Allow authenticated select payables" ON payables;
CREATE POLICY "Allow authenticated select payables"
ON payables FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 4. Garante também política de INSERT (caso não exista)
DROP POLICY IF EXISTS "Allow authenticated insert payables" ON payables;
CREATE POLICY "Allow authenticated insert payables"
ON payables FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Garante também política de DELETE (caso não exista)
DROP POLICY IF EXISTS "Allow authenticated delete payables" ON payables;
CREATE POLICY "Allow authenticated delete payables"
ON payables FOR DELETE
USING (auth.uid() IS NOT NULL);
