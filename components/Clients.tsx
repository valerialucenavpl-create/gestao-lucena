import React, { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

type Client = {
  id: string;
  name: string;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  complement: string | null;
  phone: string | null;
  notes: string | null;
};

const CLIENTS_TABLE_CANDIDATES = ["clients", "clientes"] as const;

const emptyForm: Omit<Client, "id"> = {
  name: "",
  street: "",
  number: "",
  neighborhood: "",
  complement: "",
  phone: "",
  notes: "",
};

const Clients: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Omit<Client, "id">>(emptyForm);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);

  const isTableNotFound = (message: string) => {
    const text = message.toLowerCase();
    return text.includes("could not find the table") || text.includes("relation") || text.includes("does not exist");
  };

  const runWithTableFallback = async <T,>(
    action: (tableName: string) => any
  ): Promise<{ data?: T; tableName?: string; error?: any }> => {
    let lastError: any = null;

    for (const tableName of CLIENTS_TABLE_CANDIDATES) {
      const { data, error } = await action(tableName);
      if (!error) return { data, tableName };

      lastError = error;
      const message = String(error?.message ?? "");
      if (!isTableNotFound(message)) {
        return { error };
      }
    }

    return { error: lastError };
  };

  const getMissingColumnFromError = (error: any): string | null => {
    const message = String(error?.message ?? "");
    const match = message.match(/Could not find the '([^']+)' column/i);
    return match?.[1] ?? null;
  };

  const saveWithColumnFallback = async (
    tableName: string,
    mode: "insert" | "update",
    payload: Record<string, any>,
    id?: string
  ) => {
    const workingPayload: Record<string, any> = { ...payload };

    for (let i = 0; i < 6; i += 1) {
      const query =
        mode === "insert"
          ? supabase.from(tableName).insert(workingPayload)
          : supabase.from(tableName).update(workingPayload).eq("id", id);

      const { error } = await query;
      if (!error) return { error: null };

      const missingColumn = getMissingColumnFromError(error);
      if (!missingColumn || !(missingColumn in workingPayload)) {
        return { error };
      }

      delete workingPayload[missingColumn];
    }

    return { error: { message: "Falha ao ajustar payload para schema da tabela." } };
  };

  const loadClients = async () => {
    setLoading(true);

    const { data, tableName, error } = await runWithTableFallback<Client[]>(async (candidate) => {
      const ordered = await supabase.from(candidate).select("*").order("created_at", { ascending: false });
      if (!ordered.error) return ordered;

      const message = String(ordered.error?.message ?? "").toLowerCase();
      if (message.includes("created_at")) {
        // fallback para schemas que não possuem created_at
        return await supabase.from(candidate).select("*");
      }

      return ordered;
    });

    if (error) {
      console.error("Erro ao carregar clientes:", error);
      alert(`Erro ao carregar clientes: ${error.message}`);
      setClients([]);
      setLoading(false);
      return;
    }

    console.log(`Clientes carregados da tabela: ${tableName}`);
    setClients((data as Client[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert("Nome é obrigatório");
      return;
    }

    const basePayload = {
      name: form.name,
      street: form.street,
      number: form.number,
      neighborhood: form.neighborhood,
      complement: form.complement,
      phone: form.phone,
      notes: form.notes,
    };

    if (editing) {
      const { error } = await runWithTableFallback((tableName) =>
        saveWithColumnFallback(tableName, "update", basePayload, editing.id)
      );
      if (error) {
        console.error(error);
        alert(`Erro ao atualizar cliente: ${error.message}`);
        return;
      }
    } else {
      const { error } = await runWithTableFallback((tableName) =>
        saveWithColumnFallback(tableName, "insert", basePayload)
      );
      if (error) {
        console.error(error);
        alert(`Erro ao salvar cliente: ${error.message}`);
        return;
      }
    }

    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    loadClients();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja excluir este cliente?")) return;

    const { error } = await runWithTableFallback((tableName) =>
      supabase.from(tableName).delete().eq("id", id)
    );
    if (error) {
      console.error(error);
      alert(`Erro ao excluir cliente: ${error.message}`);
      return;
    }
    loadClients();
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      name: c.name,
      street: c.street || "",
      number: c.number || "",
      neighborhood: c.neighborhood || "",
      complement: c.complement || "",
      phone: c.phone || "",
      notes: c.notes || "",
    });
    setIsModalOpen(true);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async (ev) => {
      let text = ev.target?.result as string;
      if (!text) return;

      // Remove BOM (Byte Order Mark) que o Excel insere no início de arquivos UTF-8
      text = text.replace(/^﻿/, "");

      // Detecta separador (ponto-e-vírgula ou vírgula ou tab)
      const firstLine = text.split(/\r?\n/)[0] || "";
      const sep = firstLine.indexOf(";") !== -1 ? ";" : firstLine.indexOf("\t") !== -1 ? "\t" : ",";

      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { alert("Arquivo vazio ou sem dados."); return; }

      // Normaliza texto para comparação (remove acentos, BOM, aspas, espaços)
      const norm = (s: string) => s.trim()
        .replace(/^﻿/, "")
        .toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/['"]/g, "")
        .trim();

      // Mapeia colunas pelo cabeçalho
      const headers = lines[0].split(sep).map(norm);

      const col = (h: string) => {
        const aliases: Record<string, string[]> = {
          name:         ["nome", "name", "cliente"],
          street:       ["rua", "street", "logradouro", "endereco", "endereo"],
          number:       ["numero", "num", "number"],
          neighborhood: ["bairro", "neighborhood"],
          complement:   ["complemento", "complement"],
          phone:        ["telefone", "phone", "celular", "fone"],
          notes:        ["observacao", "notes", "obs", "cpf", "cnpj"],
          city:         ["cidade", "city"],
          date:         ["data", "date", "datacadastro"],
        };
        const list = aliases[h] ?? [h];
        for (const alias of list) {
          const idx = headers.findIndex((hh) => hh === alias || hh.startsWith(alias));
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const nameIdx         = col("name");
      const streetIdx       = col("street");
      const numberIdx       = col("number");
      const neighborhoodIdx = col("neighborhood");
      const complementIdx   = col("complement");
      const phoneIdx        = col("phone");
      const notesIdx        = col("notes");
      const cityIdx         = col("city");

      if (nameIdx === -1) {
        alert(`Coluna 'Nome' não encontrada.\n\nCabeçalho detectado:\n${headers.join(" | ")}\n\nCertifique-se que a 1ª linha tem 'Nome' e salve como CSV (separado por ponto-e-vírgula).`);
        return;
      }

      const parseRow = (line: string): string[] => {
        // Suporta campos entre aspas com separadores internos
        const result: string[] = [];
        let cur = ""; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQ = !inQ; continue; }
          if (ch === sep && !inQ) { result.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
        result.push(cur.trim());
        return result;
      };

      const rows = lines.slice(1).map(parseRow).filter((r) => r[nameIdx]?.trim());
      if (rows.length === 0) { alert("Nenhum cliente encontrado no arquivo."); return; }

      const confirmMsg = `Importar ${rows.length} clientes? Clientes já existentes NÃO serão duplicados (verificação por nome).`;
      if (!window.confirm(confirmMsg)) return;

      setImporting(true);
      setImportProgress({ done: 0, total: rows.length });

      // Carrega nomes existentes para evitar duplicatas
      const { data: existing } = await supabase.from("clients").select("name");
      const existingNames = new Set((existing ?? []).map((c: any) => String(c.name ?? "").toLowerCase().trim()));

      const BATCH = 50;
      let done = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const toInsert = batch
          .filter((r) => {
            const name = r[nameIdx]?.trim();
            if (!name || existingNames.has(name.toLowerCase())) { skipped++; return false; }
            return true;
          })
          .map((r) => {
            const cityVal = cityIdx !== -1 ? r[cityIdx]?.trim() : "";
            const notesVal = notesIdx !== -1 ? r[notesIdx]?.trim() : "";
            const combined = [notesVal, cityVal ? `Cidade: ${cityVal}` : ""].filter(Boolean).join(" | ");
            return {
              name:         r[nameIdx]?.trim() || "",
              street:       streetIdx !== -1 ? r[streetIdx]?.trim() : "",
              number:       numberIdx !== -1 ? r[numberIdx]?.trim() : "",
              neighborhood: neighborhoodIdx !== -1 ? r[neighborhoodIdx]?.trim() : "",
              complement:   complementIdx !== -1 ? r[complementIdx]?.trim() : "",
              phone:        phoneIdx !== -1 ? r[phoneIdx]?.trim() : "",
              notes:        combined || "",
            };
          });

        if (toInsert.length > 0) {
          const { error } = await supabase.from("clients").insert(toInsert);
          if (error) { console.error("Erro ao inserir lote:", error); failed += toInsert.length; }
          else done += toInsert.length;
        }

        setImportProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length });
      }

      setImporting(false);
      setImportProgress(null);
      alert(`✅ Importação concluída!\n• Inseridos: ${done}\n• Ignorados (já existiam): ${skipped}\n• Com erro: ${failed}`);
      loadClients();
    };

    // Tenta UTF-8 primeiro; se falhar em detectar a coluna Nome, tenta Windows-1252
    reader.readAsText(file, "UTF-8");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Cadastro de Clientes</h2>
            <p className="mt-1 text-sm text-slate-500">Gerencie os clientes da sua base com visual azul e branco.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <label className={`rounded-xl px-4 py-2.5 font-semibold text-white transition cursor-pointer ${importing ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}`}>
              {importing && importProgress
                ? `Importando... ${importProgress.done}/${importProgress.total}`
                : "⬆ Importar CSV"}
              <input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                disabled={importing}
                onChange={handleImportCSV}
              />
            </label>
            <button
              onClick={openNew}
              className="rounded-xl bg-primary-700 px-4 py-2.5 font-semibold text-white transition hover:bg-primary-800"
            >
              + Novo Cliente
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        {loading ? (
          <p className="p-6 text-slate-500">Carregando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-blue-50 text-slate-700">
              <tr>
                <th className="p-3 text-left font-semibold">Nome</th>
                <th className="p-3 text-left font-semibold">Telefone</th>
                <th className="p-3 text-left font-semibold">Bairro</th>
                <th className="p-3 text-center font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    Nenhum cliente cadastrado.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="p-3 font-medium text-slate-800">{c.name}</td>
                    <td className="p-3 text-slate-700">{c.phone || "-"}</td>
                    <td className="p-3 text-slate-700">{c.neighborhood || "-"}</td>
                    <td className="p-3 text-center space-x-3">
                      <button onClick={() => openEdit(c)} className="text-blue-700 hover:underline">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:underline">
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl rounded-2xl border border-blue-100 bg-white p-6 shadow-xl">
            <h3 className="mb-6 text-xl font-bold text-slate-800">{editing ? "Editar Cliente" : "Novo Cliente"}</h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                ["Nome", "name"],
                ["Rua", "street"],
                ["Número", "number"],
                ["Bairro", "neighborhood"],
                ["Complemento", "complement"],
                ["Celular", "phone"],
              ].map(([label, field]) => (
                <div key={field}>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    value={(form as any)[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  />
                </div>
              ))}

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Observação</label>
                <textarea
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  rows={3}
                  value={form.notes || ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-slate-700">
                Cancelar
              </button>
              <button onClick={handleSave} className="rounded-xl bg-primary-700 px-5 py-2.5 font-semibold text-white hover:bg-primary-800">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;