import React, { useEffect, useState } from "react";
import { supabase } from "../../../services/supabase";
import { Icon } from "../../icons/Icon";
import { formatMoneyInputBR, parseMoneyInputBR, sanitizeMoneyInputBR } from "../../../utils/money";

export type RecordFieldType = "text" | "number" | "money" | "date" | "select" | "checkbox" | "file";

export type RecordFieldConfig = {
  key: string;
  label: string;
  type: RecordFieldType;
  options?: string[];
  placeholder?: string;
  widthClassName?: string;
};

type RecordRow = { id: number | string; [key: string]: any };

type Props = {
  table: string;
  funcionarioId: number;
  fields: RecordFieldConfig[];
  emptyHint?: string;
  addLabel?: string;
  totalsField?: string;
  totalsLabel?: string;
  scopeTotalsToCurrentMonth?: boolean;
  uploadFile?: (file: File) => Promise<string>;
  onChange?: () => void;
};

// Componente genérico: lista de lançamentos datados de um funcionário
// (vales, horas extras, faltas, advertências, uniformes/EPIs), cada linha
// persistida direto no Supabase assim que salva ("+ adicionar" cria uma
// linha em rascunho local; "salvar" grava; "remover" apaga se já salva).
const RecordsEditor: React.FC<Props> = ({
  table,
  funcionarioId,
  fields,
  emptyHint,
  addLabel = "+ adicionar",
  totalsField,
  totalsLabel,
  scopeTotalsToCurrentMonth,
  uploadFile,
  onChange,
}) => {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | number | null>(null);
  const [moneyInputs, setMoneyInputs] = useState<Record<string, string>>({});

  const emptyRow = (): RecordRow => {
    const row: RecordRow = { id: `temp-${Date.now()}` };
    fields.forEach((f) => {
      row[f.key] = f.type === "checkbox" ? false : "";
    });
    return row;
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("funcionario_id", funcionarioId)
      .order("data", { ascending: false });
    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data as RecordRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, funcionarioId]);

  const moneyKey = (rowId: string | number, fieldKey: string) => `${rowId}:${fieldKey}`;

  const updateField = (rowId: string | number, fieldKey: string, value: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const next = { ...r, [fieldKey]: value };
        // Mês de referência: pré-preenche a partir da data, se ainda não editado.
        if (fieldKey === "data" && fields.some((f) => f.key === "mes_referencia") && !r.mes_referencia) {
          next.mes_referencia = String(value || "").slice(0, 7);
        }
        return next;
      })
    );
  };

  const addRow = () => setRows((prev) => [emptyRow(), ...prev]);

  const removeRow = async (row: RecordRow) => {
    if (typeof row.id === "number") {
      if (!window.confirm("Remover este lançamento?")) return;
      const { error } = await supabase.from(table).delete().eq("id", row.id);
      if (error) {
        alert("Não foi possível remover: " + error.message);
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    onChange?.();
  };

  const saveRow = async (row: RecordRow) => {
    setSavingId(row.id);
    const payload: Record<string, any> = { funcionario_id: funcionarioId };
    fields.forEach((f) => {
      payload[f.key] = row[f.key] === "" ? null : row[f.key];
    });

    const isNew = typeof row.id !== "number";
    const query = isNew
      ? supabase.from(table).insert([payload]).select().single()
      : supabase.from(table).update(payload).eq("id", row.id).select().single();

    const { data, error } = await query;
    setSavingId(null);

    if (error) {
      alert("Não foi possível salvar: " + error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? (data as RecordRow) : r)));
    onChange?.();
  };

  const handleFileChange = async (row: RecordRow, fieldKey: string, file: File | null) => {
    if (!file || !uploadFile) return;
    try {
      const url = await uploadFile(file);
      updateField(row.id, fieldKey, url);
    } catch (err: any) {
      alert("Não foi possível anexar o arquivo: " + (err?.message || err));
    }
  };

  const currentMonth = new Date().toISOString().slice(0, 7);
  const totalsRows = scopeTotalsToCurrentMonth
    ? rows.filter((r) => String(r.data || "").slice(0, 7) === currentMonth)
    : rows;
  const total = totalsField
    ? totalsRows.reduce((sum, r) => sum + (Number(r[totalsField]) || 0), 0)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {totalsField && rows.length > 0 && (
          <span className="text-xs font-bold text-gray-600">
            {totalsLabel || "Total"}
            {scopeTotalsToCurrentMonth ? " (mês atual)" : ""}: R${" "}
            {(total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
        <button
          type="button"
          onClick={addRow}
          className="ml-auto text-xs font-semibold text-primary-700 hover:underline"
        >
          {addLabel}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400">{emptyHint || "Nenhum lançamento ainda."}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const isNew = typeof row.id !== "number";
            return (
              <div key={row.id} className="flex flex-wrap items-center gap-2 border rounded-lg p-2 bg-gray-50">
                {fields.map((f) => {
                  const widthClass = f.widthClassName || (f.type === "date" ? "w-36" : f.type === "money" || f.type === "number" ? "w-28" : "flex-1");
                  if (f.type === "checkbox") {
                    return (
                      <label key={f.key} className="flex items-center gap-1 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={!!row[f.key]}
                          onChange={(e) => updateField(row.id, f.key, e.target.checked)}
                        />
                        {f.label}
                      </label>
                    );
                  }
                  if (f.type === "select") {
                    return (
                      <select
                        key={f.key}
                        value={row[f.key] || ""}
                        onChange={(e) => updateField(row.id, f.key, e.target.value)}
                        className={`${widthClass} px-2 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900`}
                      >
                        <option value="">{f.label}</option>
                        {(f.options || []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  if (f.type === "file") {
                    return (
                      <div key={f.key} className="flex items-center gap-2 text-xs">
                        <input
                          type="file"
                          onChange={(e) => handleFileChange(row, f.key, e.target.files?.[0] || null)}
                          className="text-xs"
                        />
                        {row[f.key] && (
                          <a href={row[f.key]} target="_blank" rel="noreferrer" className="text-primary-700 underline">
                            ver anexo
                          </a>
                        )}
                      </div>
                    );
                  }
                  if (f.type === "money") {
                    const mk = moneyKey(row.id, f.key);
                    const inputValue = moneyInputs[mk] ?? formatMoneyInputBR(Number(row[f.key]) || 0);
                    return (
                      <input
                        key={f.key}
                        type="text"
                        inputMode="decimal"
                        placeholder={f.label}
                        value={inputValue}
                        onChange={(e) => {
                          const sanitized = sanitizeMoneyInputBR(e.target.value);
                          setMoneyInputs((prev) => ({ ...prev, [mk]: sanitized }));
                          updateField(row.id, f.key, parseMoneyInputBR(sanitized));
                        }}
                        onBlur={() =>
                          setMoneyInputs((prev) => ({ ...prev, [mk]: formatMoneyInputBR(Number(row[f.key]) || 0) }))
                        }
                        className={`${widthClass} px-2 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900 text-right`}
                      />
                    );
                  }
                  return (
                    <input
                      key={f.key}
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      step={f.type === "number" ? "0.01" : undefined}
                      placeholder={f.placeholder || f.label}
                      value={row[f.key] ?? ""}
                      onChange={(e) =>
                        updateField(row.id, f.key, f.type === "number" ? Number(e.target.value) || 0 : e.target.value)
                      }
                      className={`${widthClass} px-2 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-900`}
                    />
                  );
                })}

                <button
                  type="button"
                  onClick={() => saveRow(row)}
                  disabled={savingId === row.id}
                  className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md disabled:opacity-50"
                  title="Salvar"
                >
                  <Icon className="w-4 h-4">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </Icon>
                  {savingId === row.id ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(row)}
                  className="text-red-500 hover:text-red-700"
                  title="Remover"
                >
                  <Icon className="w-4 h-4">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </Icon>
                </button>
                {isNew && <span className="text-[10px] text-amber-600">não salvo</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecordsEditor;
