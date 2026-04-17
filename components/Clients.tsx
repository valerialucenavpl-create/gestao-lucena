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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Cadastro de Clientes</h2>
            <p className="mt-1 text-sm text-slate-500">Gerencie os clientes da sua base com visual azul e branco.</p>
          </div>
          <button
            onClick={openNew}
            className="rounded-xl bg-primary-700 px-4 py-2.5 font-semibold text-white transition hover:bg-primary-800"
          >
            + Novo Cliente
          </button>
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