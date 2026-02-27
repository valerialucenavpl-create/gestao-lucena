import React, { useMemo, useState } from "react";
import { User, CompanySettings } from "../types";
import { supabase } from "../services/supabase";
import {
  uploadCompanyLogo,
  saveCompanySettings,
} from "../services/companySettingsServices";

interface SettingsProps {
  companySettings: CompanySettings;
  setCompanySettings: (settings: CompanySettings) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500";

const Settings: React.FC<SettingsProps> = ({
  companySettings,
  setCompanySettings,
  users,
  setUsers,
}) => {
  const [activeTab, setActiveTab] = useState<"company" | "users">("company");

  // ✅ SALVAR DADOS DA EMPRESA
  const [savingCompany, setSavingCompany] = useState(false);

  const handleSaveCompany = async () => {
    setSavingCompany(true);
    const res = await saveCompanySettings(companySettings);
    setSavingCompany(false);

    if (!res.ok) {
      alert("Erro ao salvar configurações da empresa.");
      return;
    }

    alert("Configurações salvas ✅");
  };

  // ---------------- LOGO ----------------
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const up = await uploadCompanyLogo(file);
    if (!up.ok) {
      alert("Erro ao enviar logo");
      return;
    }

    const updated = { ...companySettings, logo: up.url };
    setCompanySettings(updated);

    const saved = await saveCompanySettings(updated);
    if (!saved.ok) alert("Logo enviado, mas deu erro ao salvar no banco.");
  };

  const handleChange = (field: keyof CompanySettings, value: string) => {
    setCompanySettings({ ...companySettings, [field]: value });
  };

  // ================== CADASTRO DE USUÁRIA (EDGE FUNCTION) ==================
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<User["role"]>("Sales");
  const [newGoal, setNewGoal] = useState<number>(0);

  const resetCreateForm = () => {
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewRole("Sales");
    setNewGoal(0);
  };

  const canShowGoal = useMemo(
    () => newRole === "Sales" || newRole === "Finance",
    [newRole]
  );

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;

    if (!newName.trim() || !newEmail.trim() || !newPassword.trim() || !newRole) {
      alert("Preencha Nome, Email, Senha e Cargo.");
      return;
    }

    setCreating(true);
    try {
      const payload = {
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
        monthlyGoal: canShowGoal ? Number(newGoal || 0) : 0,
      };

      const { data, error } = await supabase.functions.invoke("create-user", {
        body: payload,
      });

      if (error) {
        alert(`Erro ao cadastrar: ${error.message}`);
        return;
      }

      if (!data?.success) {
        alert(`Erro ao cadastrar: ${data?.error ?? "Falha desconhecida"}`);
        return;
      }

      const newUser: User = {
        id: data.auth_user_id ?? `u-${Date.now()}`,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        monthlyGoal:
          payload.role === "Sales" || payload.role === "Finance"
            ? payload.monthlyGoal
            : undefined,
        avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(
          payload.name
        )}`,
      };

      setUsers((prev) => {
        const exists = prev.some(
          (u) => u.email.toLowerCase() === newUser.email.toLowerCase()
        );
        return exists ? prev : [newUser, ...prev];
      });

      alert("Usuária cadastrada com sucesso ✅");
      resetCreateForm();
      setIsCreateModalOpen(false);
    } catch (err: any) {
      alert(`Erro inesperado: ${err?.message ?? "Falha"}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md min-h-[80vh]">
      {/* TABS */}
      <div className="flex gap-4 border-b mb-6">
        <button
          className={`pb-2 font-medium ${
            activeTab === "company"
              ? "border-b-2 border-primary-600 text-primary-600"
              : "text-gray-500"
          }`}
          onClick={() => setActiveTab("company")}
        >
          Dados da Loja
        </button>

        <button
          className={`pb-2 font-medium ${
            activeTab === "users"
              ? "border-b-2 border-primary-600 text-primary-600"
              : "text-gray-500"
          }`}
          onClick={() => setActiveTab("users")}
        >
          Usuários
        </button>
      </div>

      {/* ================= DADOS DA EMPRESA ================= */}
      {activeTab === "company" && (
        <div className="max-w-3xl space-y-4">
          {/* ✅ Cabeçalho com botão salvar */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Informações da Empresa</h2>

            <button
              onClick={handleSaveCompany}
              disabled={savingCompany}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
            >
              {savingCompany ? "Salvando..." : "Salvar"}
            </button>
          </div>

          {/* LOGO */}
          <div>
            <label className="block font-medium mb-1">Logo</label>
            <input type="file" accept="image/*" onChange={handleLogoUpload} />
            {companySettings.logo && (
              <img
                src={companySettings.logo}
                alt="Logo"
                className="w-24 h-24 mt-3 border rounded object-contain"
              />
            )}
          </div>

          <div>
            <label className="block font-medium">Nome Fantasia</label>
            <input
              type="text"
              className={inputClass}
              value={companySettings.name}
              onChange={(e) => handleChange("name", e.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium">Razão Social</label>
            <input
              type="text"
              className={inputClass}
              value={companySettings.legalName}
              onChange={(e) => handleChange("legalName", e.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium">CNPJ</label>
            <input
              type="text"
              className={inputClass}
              value={companySettings.cnpj}
              onChange={(e) => handleChange("cnpj", e.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium">Telefone</label>
            <input
              type="text"
              className={inputClass}
              value={companySettings.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium">Email</label>
            <input
              type="email"
              className={inputClass}
              value={companySettings.email}
              onChange={(e) => handleChange("email", e.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium">Endereço</label>
            <textarea
              rows={3}
              className={inputClass}
              value={companySettings.address}
              onChange={(e) => handleChange("address", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* ================= USUÁRIOS ================= */}
      {activeTab === "users" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Gerenciar Usuários</h2>

            <button
              onClick={() => {
                resetCreateForm();
                setIsCreateModalOpen(true);
              }}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              + Cadastrar Usuária
            </button>
          </div>

          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left">Nome</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Função</th>
                <th className="p-3 text-left">Meta</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{u.role}</td>
                  <td className="p-3">
                    {u.role === "Sales" || u.role === "Finance"
                      ? (u.monthlyGoal ?? 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* MODAL CADASTRO */}
          {isCreateModalOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white w-full max-w-lg rounded-xl shadow-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Cadastrar Usuária</h3>
                  <button
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-2 py-1 rounded hover:bg-gray-100"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <label className="block font-medium mb-1">Nome</label>
                    <input
                      className={inputClass}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ex: Maria"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-1">Email</label>
                    <input
                      type="email"
                      className={inputClass}
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="maria@email.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-1">Senha</label>
                    <input
                      type="password"
                      className={inputClass}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Defina uma senha"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Dica: use pelo menos 8 caracteres.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-medium mb-1">Cargo</label>
                      <select
                        className={inputClass}
                        value={newRole}
                        onChange={(e) =>
                          setNewRole(e.target.value as User["role"])
                        }
                      >
                        <option value="Admin">Admin</option>
                        <option value="Sales">Vendas</option>
                        <option value="Finance">Financeiro</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium mb-1">
                        Meta Mensal (R$)
                      </label>
                      <input
                        type="number"
                        className={inputClass}
                        value={newGoal}
                        onChange={(e) => setNewGoal(Number(e.target.value))}
                        disabled={!canShowGoal}
                        placeholder="Ex: 5000"
                        min={0}
                      />
                      {!canShowGoal && (
                        <p className="text-xs text-gray-500 mt-1">
                          Meta só para Vendas/Financeiro.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                      disabled={creating}
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
                      disabled={creating}
                    >
                      {creating ? "Cadastrando..." : "Cadastrar"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Settings;
