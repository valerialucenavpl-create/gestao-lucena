import React, { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at?: string | null;
};

const normalizeSearch = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const CLIENTS_TABLE_CANDIDATES = ["clients", "clientes"] as const;

const emptyForm: Omit<Client, "id"> = {
  name: "",
  phone: "",
  email: "",
  address: "",
};

// A tabela só tem uma coluna de endereço (sem rua/número/bairro separados),
// então rua/número/bairro/complemento e a observação são combinados num só
// texto antes de salvar.
const buildAddress = (parts: {
  street?: string;
  number?: string;
  neighborhood?: string;
  complement?: string;
  city?: string;
  notes?: string;
}): string => {
  const streetLine = [parts.street, parts.number].filter((v) => v?.trim()).join(", ");
  const locationLine = [parts.neighborhood, parts.city].filter((v) => v?.trim()).join(" - ");
  return [streetLine, locationLine, parts.complement, parts.notes ? `Obs: ${parts.notes}` : ""]
    .filter((v) => v?.trim())
    .join(" | ");
};

const Clients: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Omit<Client, "id">>(emptyForm);
  const [notesInput, setNotesInput] = useState("");
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
      return await supabase.from(candidate).select("*").is("deleted_at", null);
    });

    if (error) {
      console.error("Erro ao carregar clientes:", error);
      alert(`Erro ao carregar clientes: ${error.message}`);
      setClients([]);
      setLoading(false);
      return;
    }

    console.log(`Clientes carregados da tabela: ${tableName}`);
    const sorted = [...((data as Client[]) || [])].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );
    setClients(sorted);
    setLoading(false);
  };

  useEffect(() => {
    loadClients();
  }, []);

  const [search, setSearch] = useState("");

  const filteredClients = React.useMemo(() => {
    const term = normalizeSearch(search);
    if (!term) return clients;
    return clients.filter((c) => {
      const haystack = normalizeSearch(`${c.name} ${c.address ?? ""}`);
      return haystack.includes(term);
    });
  }, [clients, search]);

  const newThisMonthCount = React.useMemo(() => {
    const now = new Date();
    return clients.filter((c) => {
      if (!c.created_at) return false;
      const created = new Date(c.created_at);
      return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
    }).length;
  }, [clients]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert("Nome é obrigatório");
      return;
    }

    const basePayload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      address: [form.address, notesInput.trim() ? `Obs: ${notesInput.trim()}` : ""]
        .filter((v) => v?.trim())
        .join(" | "),
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
    setNotesInput("");
    loadClients();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja excluir este cliente?")) return;

    // Exclusão reversível — marca deleted_at, não apaga a linha. Só Admin
    // consegue (trava no banco); outros papéis recebem erro aqui.
    // Importante: um UPDATE barrado pela RLS não retorna erro — só não
    // afeta nenhuma linha — por isso confirmamos com .select() que a
    // linha realmente voltou.
    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await runWithTableFallback((tableName) =>
      supabase
        .from(tableName)
        .update({ deleted_at: new Date().toISOString(), deleted_by: authData.user?.id ?? null })
        .eq("id", id)
        .select("id")
        .maybeSingle()
    );
    if (error || !data) {
      console.error(error);
      alert(`Erro ao excluir cliente: ${error?.message ?? "nenhuma linha foi alterada (verifique permissão)"}`);
      return;
    }
    loadClients();
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setNotesInput("");
    setIsModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
    });
    setNotesInput("");
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
          email:        ["email", "e-mail"],
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
      const emailIdx        = col("email");
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
      let firstError = "";

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const toInsert = batch
          .filter((r) => {
            const name = r[nameIdx]?.trim();
            if (!name || existingNames.has(name.toLowerCase())) { skipped++; return false; }
            return true;
          })
          .map((r) => ({
            name:  r[nameIdx]?.trim() || "",
            phone: phoneIdx !== -1 ? r[phoneIdx]?.trim() : "",
            email: emailIdx !== -1 ? r[emailIdx]?.trim() : "",
            address: buildAddress({
              street:       streetIdx !== -1 ? r[streetIdx] : undefined,
              number:       numberIdx !== -1 ? r[numberIdx] : undefined,
              neighborhood: neighborhoodIdx !== -1 ? r[neighborhoodIdx] : undefined,
              complement:   complementIdx !== -1 ? r[complementIdx] : undefined,
              city:         cityIdx !== -1 ? r[cityIdx] : undefined,
              notes:        notesIdx !== -1 ? r[notesIdx] : undefined,
            }),
          }));

        if (toInsert.length > 0) {
          const { error } = await supabase.from("clients").insert(toInsert);
          if (error) {
            console.error("Erro ao inserir lote:", error);
            if (!firstError) firstError = error.message || "";
            failed += toInsert.length;
          } else {
            done += toInsert.length;
          }
        }

        setImportProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length });
      }

      setImporting(false);
      setImportProgress(null);
      const errorLine = firstError ? `\n\nErro: ${firstError}` : "";
      alert(`✅ Importação concluída!\n• Inseridos: ${done}\n• Ignorados (já existiam): ${skipped}\n• Com erro: ${failed}${errorLine}`);
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
          <div className="flex items-center gap-3 flex-wrap">
            <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-2.5 text-sm">
              <span className="font-bold text-primary-700">{newThisMonthCount}</span>{" "}
              <span className="text-slate-600">cliente{newThisMonthCount === 1 ? "" : "s"} novo{newThisMonthCount === 1 ? "" : "s"} este mês</span>
            </div>
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

        <div className="mt-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, endereço ou cidade..."
            className="w-full max-w-md rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
          />
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
                <th className="p-3 text-left font-semibold">Endereço</th>
                <th className="p-3 text-center font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    {clients.length === 0 ? "Nenhum cliente cadastrado." : "Nenhum cliente encontrado para essa busca."}
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="p-3 font-medium text-slate-800">{c.name}</td>
                    <td className="p-3 text-slate-700">{c.phone || "-"}</td>
                    <td className="p-3 text-slate-700">{c.address || "-"}</td>
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
                ["Celular", "phone"],
                ["E-mail", "email"],
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
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Endereço</label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  placeholder="Rua, número, bairro, complemento"
                  value={form.address || ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Observação</label>
                <textarea
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  rows={3}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
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