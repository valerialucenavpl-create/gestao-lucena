import { supabase } from "./supabase";

// Alteração de pedido, crédito com fornecedor e comprovantes de devolução
// (tabelas de 2026-10-05_alteracao_devolucao_pedido.sql).

export const MOTIVOS_ALTERACAO = [
  "Fornecedor enviou divergente",
  "Pedido do cliente",
  "Erro de medida",
  "Outro",
] as const;

export type ItemSnapshot = { descricao: string; valor: number };

export type PedidoAlteracao = {
  id: string;
  pedidoId: string;
  itemId: string;
  antes: ItemSnapshot;
  depois: ItemSnapshot;
  diferenca: number;
  motivo: string;
  observacao: string;
  usuarioNome: string;
  createdAt: string;
};

export type CreditoFornecedor = {
  id: string;
  pedidoId: string;
  fornecedor: string;
  valor: number;
  motivo: string;
  status: "Pendente" | "Recebido";
  dataRecebimento: string;
  usuarioNome: string;
  createdAt: string;
};

const mapAlteracao = (r: any): PedidoAlteracao => ({
  id: String(r.id),
  pedidoId: String(r.pedido_id),
  itemId: String(r.item_id),
  antes: { descricao: r.dados_antes?.descricao ?? "", valor: Number(r.dados_antes?.valor ?? 0) },
  depois: { descricao: r.dados_depois?.descricao ?? "", valor: Number(r.dados_depois?.valor ?? 0) },
  diferenca: Number(r.diferenca ?? 0),
  motivo: r.motivo ?? "",
  observacao: r.observacao ?? "",
  usuarioNome: r.usuario_nome ?? "",
  createdAt: r.created_at,
});

const mapCredito = (r: any): CreditoFornecedor => ({
  id: String(r.id),
  pedidoId: String(r.pedido_id),
  fornecedor: r.fornecedor ?? "",
  valor: Number(r.valor ?? 0),
  motivo: r.motivo ?? "",
  status: r.status === "Recebido" ? "Recebido" : "Pendente",
  dataRecebimento: r.data_recebimento ? String(r.data_recebimento).slice(0, 10) : "",
  usuarioNome: r.usuario_nome ?? "",
  createdAt: r.created_at,
});

// ─── Alterações ───────────────────────────────────────────────────────────────
export async function getPedidoAlteracoes(pedidoId: string) {
  const { data, error } = await supabase
    .from("pedido_alteracoes")
    .select("*")
    .eq("pedido_id", Number(pedidoId))
    .order("created_at", { ascending: false });
  if (error) return { ok: false as const, error, data: [] as PedidoAlteracao[] };
  return { ok: true as const, data: (data ?? []).map(mapAlteracao) };
}

export async function createPedidoAlteracao(input: {
  pedidoId: string;
  itemId: string;
  antes: ItemSnapshot;
  depois: ItemSnapshot;
  motivo: string;
  observacao?: string;
  usuarioNome?: string;
}) {
  const { data: authData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("pedido_alteracoes")
    .insert({
      pedido_id: Number(input.pedidoId),
      item_id: input.itemId,
      dados_antes: input.antes,
      dados_depois: input.depois,
      diferenca: Number((input.depois.valor - input.antes.valor).toFixed(2)),
      motivo: input.motivo,
      observacao: input.observacao?.trim() || null,
      usuario_id: authData.user?.id ?? null,
      usuario_nome: input.usuarioNome || null,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false as const, error };
  return { ok: true as const, data: mapAlteracao(data) };
}

// ─── Crédito com fornecedor ──────────────────────────────────────────────────
export async function getCreditosFornecedor(pedidoId?: string) {
  let q = supabase.from("pedido_creditos_fornecedor").select("*").order("created_at", { ascending: false });
  if (pedidoId) q = q.eq("pedido_id", Number(pedidoId));
  const { data, error } = await q;
  if (error) return { ok: false as const, error, data: [] as CreditoFornecedor[] };
  return { ok: true as const, data: (data ?? []).map(mapCredito) };
}

export async function createCreditoFornecedor(input: {
  pedidoId: string;
  fornecedor: string;
  valor: number;
  motivo?: string;
  usuarioNome?: string;
}) {
  const { data: authData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("pedido_creditos_fornecedor")
    .insert({
      pedido_id: Number(input.pedidoId),
      fornecedor: input.fornecedor.trim(),
      valor: Number(input.valor || 0),
      motivo: input.motivo?.trim() || null,
      status: "Pendente",
      usuario_id: authData.user?.id ?? null,
      usuario_nome: input.usuarioNome || null,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false as const, error };
  return { ok: true as const, data: mapCredito(data) };
}

export async function marcarCreditoRecebido(id: string, dataRecebimento: string | null) {
  const { data, error } = await supabase
    .from("pedido_creditos_fornecedor")
    .update({ status: dataRecebimento ? "Recebido" : "Pendente", data_recebimento: dataRecebimento })
    .eq("id", Number(id))
    .select("*")
    .single();
  if (error || !data) return { ok: false as const, error };
  return { ok: true as const, data: mapCredito(data) };
}

// ─── Comprovantes (bucket privado) ───────────────────────────────────────────
const BUCKET = "pedido-comprovantes";
const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9.-]+/g, "_");

/** Envia o comprovante e devolve o CAMINHO (não um link — links expiram). */
export async function uploadComprovante(file: File, pedidoId: string): Promise<string> {
  const path = `${pedidoId}/${Date.now()}-${sanitize(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

/** Gera um link temporário (1h) pra abrir o comprovante. */
export async function getComprovanteUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw error || new Error("Não foi possível abrir o comprovante.");
  return data.signedUrl;
}
