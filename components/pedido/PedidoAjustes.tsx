// Formulários de ajuste do pedido (alteração, devolução, crédito com
// fornecedor) — mesmo visual do drawer "Finanças do Pedido" do QuoteDetail.
import React, { useEffect, useMemo, useState } from "react";
import { BankAccount, QuoteItem } from "../../types";
import { formatMoneyInputBR, parseMoneyInputBR, sanitizeMoneyInputBR } from "../../utils/money";
import { MOTIVOS_ALTERACAO, PedidoAlteracao } from "../../services/pedidoAjustesServices";

export const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

// ─── estilos compartilhados ──────────────────────────────────────────────────
export const ui = {
  overlay: { position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } as React.CSSProperties,
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" } as React.CSSProperties,
  sheet: { position: "relative", width: "100%", maxWidth: 480, background: "#16305F", borderRadius: 16, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", border: "1px solid #3a5590", maxHeight: "92vh", overflowY: "auto" } as React.CSSProperties,
  title: { fontSize: 16, fontWeight: 700, color: "#f5f6fa" } as React.CSSProperties,
  label: { fontSize: 11, color: "#a9b8dc", marginBottom: 5, display: "block" } as React.CSSProperties,
  input: { width: "100%", background: "#1E3D7A", border: "1px solid #3a5590", borderRadius: 8, padding: "9px 12px", color: "#f5f6fa", fontSize: 14, outline: "none" } as React.CSSProperties,
  card: { background: "#1E3D7A", borderRadius: 10, padding: "12px 14px", border: "1px solid #3a5590" } as React.CSSProperties,
  primary: (color = "#22c55e"): React.CSSProperties => ({ background: color, color: "#fff", border: "none", borderRadius: 10, padding: "11px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }),
  ghost: { background: "#2C53A0", border: "1px solid #4a68a8", color: "#dde4f5", borderRadius: 10, padding: "11px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer" } as React.CSSProperties,
  chip: (active: boolean): React.CSSProperties => ({ padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", background: active ? "#8fa8ff" : "#2C53A0", color: active ? "#fff" : "#b8c4e0", borderColor: active ? "#8fa8ff" : "#4a68a8" }),
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={ui.label}>{label}</label>
    {children}
  </div>
);

const MoneyInput: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const [text, setText] = useState(formatMoneyInputBR(value));
  useEffect(() => setText(formatMoneyInputBR(value)), [value]);
  return (
    <input
      style={ui.input}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = sanitizeMoneyInputBR(e.target.value);
        setText(raw);
        onChange(parseMoneyInputBR(raw));
      }}
      onBlur={() => setText(formatMoneyInputBR(value))}
    />
  );
};

const Header: React.FC<{ title: string; subtitle?: string; onClose: () => void }> = ({ title, subtitle, onClose }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
    <div>
      <div style={ui.title}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "#a9b8dc", marginTop: 2 }}>{subtitle}</div>}
    </div>
    <button onClick={onClose} style={{ background: "none", border: "none", color: "#b8c4e0", fontSize: 20, cursor: "pointer" }}>✕</button>
  </div>
);

// ─── 1) Registrar alteração ──────────────────────────────────────────────────
export type AlteracaoFormData = {
  itemId: string;
  descricaoAntes: string;
  descricaoDepois: string;
  valorAntes: number;
  valorDepois: number;
  motivo: string;
  observacao: string;
};

export const AlteracaoModal: React.FC<{
  items: QuoteItem[];
  saving: boolean;
  onClose: () => void;
  onSave: (data: AlteracaoFormData) => void;
}> = ({ items, saving, onClose, onSave }) => {
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const item = items.find((i) => i.id === itemId);
  const [descricaoDepois, setDescricaoDepois] = useState(item?.productName ?? "");
  const [valorDepois, setValorDepois] = useState(Number(item?.price ?? 0));
  const [motivo, setMotivo] = useState<string>(MOTIVOS_ALTERACAO[0]);
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    setDescricaoDepois(item?.productName ?? "");
    setValorDepois(Number(item?.price ?? 0));
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  const valorAntes = Number(item?.price ?? 0);
  const diferenca = valorDepois - valorAntes;

  return (
    <div style={ui.overlay}>
      <div style={ui.backdrop} onClick={onClose} />
      <div style={ui.sheet}>
        <Header title="Registrar alteração" subtitle="O item e o total do pedido serão atualizados" onClose={onClose} />

        <Field label="Item afetado">
          <select style={ui.input} value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i, idx) => (
              <option key={i.id} value={i.id} style={{ background: "#1E3D7A" }}>
                {idx + 1}. {i.productName} — {fmtBRL(Number(i.price || 0))}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Descrição original">
            <div style={{ ...ui.input, opacity: 0.75 }}>{item?.productName || "—"}</div>
          </Field>
          <Field label="Descrição nova">
            <input style={ui.input} value={descricaoDepois} onChange={(e) => setDescricaoDepois(e.target.value)} />
          </Field>
          <Field label="Valor original">
            <div style={{ ...ui.input, opacity: 0.75 }}>{fmtBRL(valorAntes)}</div>
          </Field>
          <Field label="Valor novo">
            <MoneyInput value={valorDepois} onChange={setValorDepois} />
          </Field>
        </div>

        <div style={{ ...ui.card, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#a9b8dc" }}>Diferença</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: diferenca < 0 ? "#f59e0b" : diferenca > 0 ? "#22c55e" : "#dde4f5" }}>
            {diferenca > 0 ? "+" : ""}{fmtBRL(diferenca)}
          </span>
        </div>

        <Field label="Motivo">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {MOTIVOS_ALTERACAO.map((m) => (
              <button key={m} type="button" onClick={() => setMotivo(m)} style={ui.chip(motivo === m)}>{m}</button>
            ))}
          </div>
        </Field>

        <Field label="Observação">
          <textarea style={{ ...ui.input, minHeight: 60 }} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: fornecedor mandou vidro 8mm no lugar de 10mm" />
        </Field>

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button onClick={onClose} style={{ ...ui.ghost, flex: 1 }}>Cancelar</button>
          <button
            disabled={saving}
            onClick={() =>
              onSave({
                itemId,
                descricaoAntes: item?.productName ?? "",
                descricaoDepois: descricaoDepois.trim(),
                valorAntes,
                valorDepois,
                motivo,
                observacao,
              })
            }
            style={{ ...ui.primary(), flex: 2, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Salvando…" : "Salvar alteração"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Antes/depois de um item (clique no badge "Alterado") ─────────────────────
export const AlteracoesViewModal: React.FC<{ alteracoes: PedidoAlteracao[]; onClose: () => void }> = ({ alteracoes, onClose }) => (
  <div style={ui.overlay}>
    <div style={ui.backdrop} onClick={onClose} />
    <div style={ui.sheet}>
      <Header title="Alterações do item" subtitle={`${alteracoes.length} registro(s)`} onClose={onClose} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {alteracoes.map((a) => (
          <div key={a.id} style={ui.card}>
            <div style={{ fontSize: 11, color: "#a9b8dc", marginBottom: 8 }}>
              {fmtDateTime(a.createdAt)}{a.usuarioNome ? ` · ${a.usuarioNome}` : ""} · <strong style={{ color: "#dde4f5" }}>{a.motivo}</strong>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
              <div style={{ background: "#0f2549", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: "#a9b8dc", textTransform: "uppercase" }}>Antes</div>
                <div style={{ fontSize: 13, color: "#f5f6fa" }}>{a.antes.descricao}</div>
                <div style={{ fontSize: 13, color: "#8fa8ff", fontWeight: 700 }}>{fmtBRL(a.antes.valor)}</div>
              </div>
              <span style={{ color: "#8fa8ff" }}>→</span>
              <div style={{ background: "#0f2549", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: "#a9b8dc", textTransform: "uppercase" }}>Depois</div>
                <div style={{ fontSize: 13, color: "#f5f6fa" }}>{a.depois.descricao}</div>
                <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>{fmtBRL(a.depois.valor)}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, marginTop: 8, color: a.diferenca < 0 ? "#f59e0b" : "#22c55e", fontWeight: 700 }}>
              Diferença: {a.diferenca > 0 ? "+" : ""}{fmtBRL(a.diferenca)}
            </div>
            {a.observacao && <div style={{ fontSize: 12, color: "#c8d4f0", marginTop: 4 }}>{a.observacao}</div>}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── 2) Registrar devolução ──────────────────────────────────────────────────
export const FORMAS_DEVOLUCAO = ["Pix", "Dinheiro", "Transferência", "Estorno no cartão"] as const;

export type DevolucaoFormData = {
  valor: number;
  forma: string;
  data: string;
  accountId: string;
  arquivo: File | null;
  observacao: string;
  alteracaoId: string;
};

export const DevolucaoModal: React.FC<{
  creditoCliente: number;
  accounts: BankAccount[];
  defaultAccountPix?: string;
  defaultAccountDinheiro?: string;
  alteracoes: PedidoAlteracao[];
  saving: boolean;
  onClose: () => void;
  onSave: (data: DevolucaoFormData) => void;
}> = ({ creditoCliente, accounts, defaultAccountPix, defaultAccountDinheiro, alteracoes, saving, onClose, onSave }) => {
  const [valor, setValor] = useState(Math.max(0, Number(creditoCliente.toFixed(2))));
  const [forma, setForma] = useState<string>("Pix");
  const [data, setData] = useState(todayISO());
  const [accountId, setAccountId] = useState(defaultAccountPix || "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [observacao, setObservacao] = useState("");
  const reducoes = useMemo(() => alteracoes.filter((a) => a.diferenca < 0), [alteracoes]);
  // Já vem ligada à alteração mais recente que reduziu o pedido — o caso mais
  // comum (item trocado por um mais barato) — pra não deduzir duas vezes na DRE.
  const [alteracaoId, setAlteracaoId] = useState(reducoes[0]?.id ?? "");

  useEffect(() => {
    if (forma === "Pix") setAccountId(defaultAccountPix || "");
    else if (forma === "Dinheiro") setAccountId(defaultAccountDinheiro || "");
  }, [forma, defaultAccountPix, defaultAccountDinheiro]);

  return (
    <div style={ui.overlay}>
      <div style={ui.backdrop} onClick={onClose} />
      <div style={ui.sheet}>
        <Header title="Registrar devolução" subtitle="Gera uma saída no Caixa em Deduções → devoluções de vendas" onClose={onClose} />

        {creditoCliente > 0.005 && (
          <div style={{ ...ui.card, marginBottom: 12, borderColor: "#f59e0b88", color: "#f59e0b", fontSize: 13 }}>
            Crédito do cliente: <strong>{fmtBRL(creditoCliente)}</strong>
          </div>
        )}

        <Field label="Valor a devolver">
          <MoneyInput value={valor} onChange={setValor} />
        </Field>

        <Field label="Forma de devolução">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {FORMAS_DEVOLUCAO.map((f) => (
              <button key={f} type="button" onClick={() => setForma(f)} style={ui.chip(forma === f)}>{f}</button>
            ))}
          </div>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Data">
            <input type="date" style={ui.input} value={data} onChange={(e) => setData(e.target.value)} />
          </Field>
          <Field label="Saiu da conta">
            <select style={ui.input} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="" style={{ background: "#1E3D7A" }}>Selecione…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} style={{ background: "#1E3D7A" }}>{a.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Comprovante (imagem ou PDF)">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            style={{ ...ui.input, padding: "7px 10px", fontSize: 12 }}
          />
        </Field>

        {reducoes.length > 0 && (
          <Field label="Vincular a uma alteração (opcional)">
            <select style={ui.input} value={alteracaoId} onChange={(e) => setAlteracaoId(e.target.value)}>
              <option value="" style={{ background: "#1E3D7A" }}>Nenhuma</option>
              {reducoes.map((a) => (
                <option key={a.id} value={a.id} style={{ background: "#1E3D7A" }}>
                  {a.antes.descricao} → {a.depois.descricao} ({fmtBRL(a.diferenca)})
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: "#a9b8dc", marginTop: 5 }}>
              {alteracaoId
                ? "Ligada à alteração: só sai do Caixa — a alteração já reduziu a receita na DRE."
                : "Sem alteração ligada: entra na DRE como (-) Devoluções de vendas."}
            </div>
          </Field>
        )}

        <Field label="Motivo / observação">
          <textarea style={{ ...ui.input, minHeight: 60 }} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Field>

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button onClick={onClose} style={{ ...ui.ghost, flex: 1 }}>Cancelar</button>
          <button
            disabled={saving}
            onClick={() => onSave({ valor, forma, data, accountId, arquivo, observacao, alteracaoId })}
            style={{ ...ui.primary("#f59e0b"), flex: 2, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Registrando…" : "Registrar devolução"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── 3) Crédito a receber do fornecedor ──────────────────────────────────────
export const CreditoFornecedorModal: React.FC<{
  saving: boolean;
  onClose: () => void;
  onSave: (data: { fornecedor: string; valor: number; motivo: string }) => void;
}> = ({ saving, onClose, onSave }) => {
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState(0);
  const [motivo, setMotivo] = useState("");
  return (
    <div style={ui.overlay}>
      <div style={ui.backdrop} onClick={onClose} />
      <div style={ui.sheet}>
        <Header title="Crédito a receber do fornecedor" onClose={onClose} />
        <Field label="Fornecedor">
          <input style={ui.input} value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
        </Field>
        <Field label="Valor">
          <MoneyInput value={valor} onChange={setValor} />
        </Field>
        <Field label="Motivo">
          <textarea style={{ ...ui.input, minHeight: 60 }} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: enviou vidro 8mm cobrando 10mm" />
        </Field>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button onClick={onClose} style={{ ...ui.ghost, flex: 1 }}>Cancelar</button>
          <button
            disabled={saving}
            onClick={() => onSave({ fornecedor, valor, motivo })}
            style={{ ...ui.primary(), flex: 2, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Salvando…" : "Salvar crédito"}
          </button>
        </div>
      </div>
    </div>
  );
};
