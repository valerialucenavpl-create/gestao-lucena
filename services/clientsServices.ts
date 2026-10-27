import { supabase } from "./supabase";

// O Supabase/PostgREST devolve no máximo 1000 linhas por select — com a base
// de clientes passando de 3000 registros, uma busca simples truncava sem
// erro nenhum e "sumia" com quem ficava fora dos primeiros 1000 (ex.: o
// painel Clientes não achava a Roseane de Paula Freire, que aparecia na
// busca do orçamento). Aqui pagina em blocos de 1000 até esgotar a tabela.
export async function fetchAllClients(
  columns = "*",
  { includeDeleted = false }: { includeDeleted?: boolean } = {}
): Promise<{ data: any[]; error: any | null }> {
  const pageSize = 1000;
  let all: any[] = [];
  let from = 0;
  for (;;) {
    let query = supabase.from("clients").select(columns);
    if (!includeDeleted) query = query.is("deleted_at", null);
    // Ordem estável entre páginas — sem isso o banco pode repetir/pular
    // linhas de uma página pra outra.
    const { data, error } = await query.order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (error) return { data: all, error };
    if (!Array.isArray(data)) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}
