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

const Clients: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const [form, setForm] = useState<Omit<Client, "id">>({
    name: "",
    street: "",
    number: "",
    neighborhood: "",
    complement: "",
    phone: "",
    notes: "",
  });

  /* ======================
     LOAD CLIENTS
  ====================== */
  const loadClients = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar clientes:", error);
      setClients([]);
    } else {
      setClients((data as Client[]) || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadClients();
  }, []);

  /* ======================
     SAVE (INSERT / UPDATE)
  ====================== */
  const handleSave = async () => {
    if (!form.name.trim()) {
      alert("Nome é obrigatório");
      return;
    }

    if (editing) {
      const { error } = await supabase
        .from("clients")
        .update(form)
        .eq("id", editing.id);

      if (error) {
        console.error(error);
        alert("Erro ao atualizar cliente");
        return;
      }
    } else {
      const { error } = await supabase
        .from("clients")
        .insert(form);

      if (error) {
        console.error(error);
        alert("Erro ao salvar cliente");
        return;
      }
    }

    setIsModalOpen(false);
    setEditing(null);
    setForm({
      name: "",
      street: "",
      number: "",
      neighborhood: "",
      complement: "",
      phone: "",
      notes: "",
    });

    loadClients();
  };

  /* ======================
     DELETE
  ====================== */
  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja excluir este cliente?")) return;

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Erro ao excluir cliente");
      return;
    }

    loadClients();
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Clientes</h2>

        <button
          onClick={() => {
            setEditing(null);
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          + Novo Cliente
        </button>
      </div>

      {/* LIST */}
      {loading ? (
        <p>Carregando...</p>
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Nome</th>
              <th className="p-2 text-left">Telefone</th>
              <th className="p-2 text-left">Bairro</th>
              <th className="p-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">
                  Nenhum cliente cadastrado
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">{c.phone || "-"}</td>
                  <td className="p-2">{c.neighborhood || "-"}</td>
                  <td className="p-2 text-center space-x-3">
                    <button
                      onClick={() => {
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
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-red-600 hover:underline"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-4xl rounded-xl p-6 shadow-lg">
            <h3 className="text-lg font-bold mb-4">
              {editing ? "Editar Cliente" : "Novo Cliente"}
            </h3>

            <div className="space-y-4">
              {[
                ["Nome", "name"],
                ["Rua", "street"],
                ["Número", "number"],
                ["Bairro", "neighborhood"],
                ["Complemento", "complement"],
                ["Celular", "phone"],
                ["Observação", "notes"],
              ].map(([label, field]) => (
                <div key={field}>
                  <label className="text-sm font-medium">{label}</label>
                  <input
                    className="w-full border p-3 rounded-full"
                    value={(form as any)[field]}
                    onChange={(e) =>
                      setForm({ ...form, [field]: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
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
