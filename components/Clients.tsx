import React, { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { fetchAllClients } from "../services/clientsServices";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf?: string | null;
  address: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  created_at?: string | null;
};

const normalizeSearch = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const CLIENTS_TABLE = "clients";

const emptyForm: Omit<Client, "id"> = {
  name: "",
  phone: "",
  email: "",
  cpf: "",
  address: "",
  street: "",
  number: "",
  neighborhood: "",
  city: "",
};

// Máscara de CPF (11 dígitos) ou CNPJ (14 dígitos), conforme o que foi digitado.
const formatCpfCnpj = (value: string): string => {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
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

type Props = {
  onOpenClient?: (client: { id: string; name: string; phone?: string | null; address?: string | null }) => void;
};

const Clients: React.FC<Props> = ({ onOpenClient }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Omit<Client, "id">>(emptyForm);
  const [notesInput, setNotesInput] = useState("");

  const loadClients = async () => {
    setLoading(true);

    const { data, error } = await fetchAllClients();

    if (error) {
      console.error("Erro ao carregar clientes:", error);
      alert(`Erro ao carregar clientes: ${error.message}`);
      setClients([]);
      setLoading(false);
      return;
    }

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
      const haystack = normalizeSearch(`${c.name} ${c.address ?? ""} ${c.city ?? ""}`);
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
    if (!form.street.trim()) {
      alert("Rua é obrigatória");
      return;
    }
    if (!form.neighborhood.trim()) {
      alert("Bairro é obrigatório");
      return;
    }
    if (!form.city.trim()) {
      alert("Cidade é obrigatória");
      return;
    }

    const basePayload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      // Só manda o CPF quando há algo pra gravar — assim o cadastro continua
      // salvando mesmo antes de rodar supabase/2026-10-15_cpf_clientes.sql.
      ...(form.cpf?.trim() || editing?.cpf ? { cpf: form.cpf?.trim() || null } : {}),
      street: form.street || "",
      number: form.number || "",
      neighborhood: form.neighborhood || "",
      city: form.city || "",
      // "address" continua sendo preenchido automaticamente a partir dos
      // campos separados — outras telas (Dashboard, Entregas por Setor)
      // ainda leem esse texto único, então mantemos os dois em sincronia.
      address: buildAddress({
        street: form.street || undefined,
        number: form.number || undefined,
        neighborhood: form.neighborhood || undefined,
        city: form.city || undefined,
        notes: notesInput.trim() || undefined,
      }),
    };

    if (editing) {
      const { error } = await supabase.from(CLIENTS_TABLE).update(basePayload).eq("id", editing.id);
      if (error) {
        console.error(error);
        alert(`Erro ao atualizar cliente: ${error.message}`);
        return;
      }
      // O nome do cliente fica gravado em cada orçamento/venda (customer_name);
      // o endereço já é lido ao vivo do cadastro. Se o nome mudou, propaga.
      if (form.name.trim() !== (editing.name || "").trim()) {
        const { error: quotesError } = await supabase
          .from("quotes")
          .update({ customer_name: form.name.trim() })
          .eq("client_id", editing.id);
        if (quotesError) {
          console.error(quotesError);
          alert(`Cliente salvo, mas não foi possível atualizar o nome nas vendas: ${quotesError.message}`);
        }
      }
    } else {
      const { error } = await supabase.from(CLIENTS_TABLE).insert(basePayload);
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
    const { data, error } = await supabase
      .from(CLIENTS_TABLE)
      .update({ deleted_at: new Date().toISOString(), deleted_by: authData.user?.id ?? null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
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
      cpf: c.cpf || "",
      address: c.address || "",
      street: c.street || "",
      number: c.number || "",
      neighborhood: c.neighborhood || "",
      city: c.city || "",
    });
    setNotesInput("");
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
          <div className="flex items-center gap-3 flex-wrap">
            <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-2.5 text-sm">
              <span className="font-bold text-primary-700">{newThisMonthCount}</span>{" "}
              <span className="text-slate-600">cliente{newThisMonthCount === 1 ? "" : "s"} novo{newThisMonthCount === 1 ? "" : "s"} este mês</span>
            </div>
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
                <th className="p-3 text-left font-semibold">Cidade</th>
                <th className="p-3 text-center font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    {clients.length === 0 ? "Nenhum cliente cadastrado." : "Nenhum cliente encontrado para essa busca."}
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="p-3 font-medium text-slate-800">
                      {onOpenClient ? (
                        <button
                          type="button"
                          onClick={() => onOpenClient({ id: c.id, name: c.name, phone: c.phone, address: c.address })}
                          className="text-primary-700 hover:underline text-left"
                        >
                          {c.name}
                        </button>
                      ) : (
                        c.name
                      )}
                    </td>
                    <td className="p-3 text-slate-700">{c.phone || "-"}</td>
                    <td className="p-3 text-slate-700">{c.address || "-"}</td>
                    <td className="p-3 text-slate-700">{c.city || "-"}</td>
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
          <div className="w-full max-w-xl rounded-2xl border border-blue-100 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="mb-6 text-xl font-bold text-slate-800">{editing ? "Editar Cliente" : "Novo Cliente"}</h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                ["Nome *", "name"],
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

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">CPF / CNPJ</label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={form.cpf || ""}
                  onChange={(e) => setForm({ ...form, cpf: formatCpfCnpj(e.target.value) })}
                />
              </div>

              {editing?.address && !form.street && (
                <div className="md:col-span-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm text-slate-500">
                  Endereço atual (cadastro antigo, texto único): {editing.address}
                  <br />
                  Rua, número e bairro ainda não foram separados — preencha os campos abaixo.
                  {form.city && " (a cidade já foi identificada automaticamente.)"}
                </div>
              )}

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Rua *</label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  placeholder="Nome da rua"
                  value={form.street || ""}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Número</label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  value={form.number || ""}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Bairro *</label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  value={form.neighborhood || ""}
                  onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Cidade *</label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  value={form.city || ""}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  required
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