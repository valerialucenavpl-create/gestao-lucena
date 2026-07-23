import React, { useMemo, useState } from "react";
import { User, CompanySettings } from "../types";
import {
  uploadCompanyLogo,
  saveCompanySettings,
} from "../services/companySettingsServices";
import { createUser, uploadUserAvatar, updateUserProfile } from "../services/userService";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";
import { supabase } from "../services/supabase";

interface SettingsProps {
  companySettings: CompanySettings;
  setCompanySettings: (settings: CompanySettings) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  currentUser: User;
  onUpdateCurrentUser?: (updated: User) => void;
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500";

const Settings: React.FC<SettingsProps> = ({
  companySettings,
  setCompanySettings,
  users,
  setUsers,
  currentUser,
  onUpdateCurrentUser,
}) => {
  const isAdmin = currentUser.role === "Admin";

  const [activeTab, setActiveTab] = useState<"company" | "users" | "profile">(
    isAdmin ? "company" : "profile"
  );

  // ================== EDITAR USUÁRIA ==================
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<User["role"]>("Sales");
  const [editGoal, setEditGoal] = useState(0);
  const [editGoalInput, setEditGoalInput] = useState(formatMoneyInputBR(0));
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (u: User) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditGoal(u.monthlyGoal ?? 0);
    setEditGoalInput(formatMoneyInputBR(u.monthlyGoal ?? 0));
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setSavingEdit(true);
    const goalRoles: User["role"][] = ["Sales", "Finance"];
    const res = await updateUserProfile(editingUser.id, {
      name: editName.trim() || editingUser.name,
      role: editRole,
      monthlyGoal: goalRoles.includes(editRole) ? editGoal : 0,
    });
    setSavingEdit(false);
    if (!res.ok) {
      alert("Erro ao salvar alterações. Tente novamente.");
      return;
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === editingUser.id
          ? {
              ...u,
              name: editName.trim() || u.name,
              role: editRole,
              monthlyGoal: goalRoles.includes(editRole) ? editGoal : undefined,
            }
          : u
      )
    );
    setEditingUser(null);
    alert("Usuária atualizada com sucesso ✅");
  };

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
  const [newGoalInput, setNewGoalInput] = useState<string>(formatMoneyInputBR(0));
  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const [newAvatarPreview, setNewAvatarPreview] = useState<string>("");

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewAvatarFile(file);
    setNewAvatarPreview(URL.createObjectURL(file));
  };

  const resetCreateForm = () => {
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewRole("Sales");
    setNewGoal(0);
    setNewGoalInput(formatMoneyInputBR(0));
    setNewAvatarFile(null);
    setNewAvatarPreview("");
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
      let avatarUrl: string | undefined;
      if (newAvatarFile) {
        const up = await uploadUserAvatar(newAvatarFile);
        if (up.ok && up.url) avatarUrl = up.url;
      }

      const payload = {
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
        monthlyGoal: canShowGoal ? Number(newGoal || 0) : 0,
        avatar: avatarUrl,
      };

      const result = await createUser(payload);
      if (!result.ok) {
        const message =
          typeof result.error === "string"
            ? result.error
            : result.error?.message ?? "Falha desconhecida";
        alert(`Erro ao cadastrar: ${message}`);
        return;
      }

      const data = result.data;
      if (!data?.success) {
        alert(`Erro ao cadastrar: ${data?.error ?? "Falha desconhecida"}`);
        return;
      }

      if (data.auth_user_id) {
        const newUser: User = {
          id: data.auth_user_id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          monthlyGoal:
            payload.role === "Sales" || payload.role === "Finance"
              ? payload.monthlyGoal
              : undefined,
          avatar: avatarUrl ?? `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(payload.name)}`,
        };

        setUsers((prev) => {
          const exists = prev.some(
            (u) => u.email.toLowerCase() === newUser.email.toLowerCase()
          );
          return exists ? prev : [newUser, ...prev];
        });
      }

      if ((data as any)?.existing_user) {
        alert(
          "Este e-mail já está cadastrado no Auth. Use outro e-mail ou redefina a senha da usuária para reutilizar este login."
        );
      } else if ((data as any)?.rate_limited) {
        alert(
          "Cadastro recebido, mas o Supabase limitou envios de e-mail temporariamente. Aguarde alguns minutos e peça para a usuária verificar a caixa de entrada/spam."
        );
      } else if ((data as any)?.profile_pending) {
        alert(
          "Usuária criada com sucesso no Auth ✅\nConfirme o e-mail da usuária e faça o primeiro login para finalizar o perfil no sistema."
        );
      } else {
        alert("Usuária cadastrada com sucesso ✅");
      }
      resetCreateForm();
      setIsCreateModalOpen(false);
    } catch (err: any) {
      alert(`Erro inesperado: ${err?.message ?? "Falha"}`);
    } finally {
      setCreating(false);
    }
  };

  // ================== MEU PERFIL / FOTO ==================
  const [profileAvatarPreview, setProfileAvatarPreview] = useState<string>(
    currentUser.avatar && !currentUser.avatar.includes("dicebear") ? currentUser.avatar : ""
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleProfileAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const up = await uploadUserAvatar(file);
    if (!up.ok || !up.url) {
      setUploadingAvatar(false);
      alert("Erro ao enviar foto.");
      return;
    }
    setProfileAvatarPreview(up.url);
    await updateUserProfile(currentUser.id, { avatar: up.url });
    onUpdateCurrentUser?.({ ...currentUser, avatar: up.url });
    setUploadingAvatar(false);
  };

  // ================== MEU PERFIL / TROCA DE SENHA ==================
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const handleChangePassword = async () => {
    if (newPwd.length < 6) {
      alert("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPwd !== confirmPwd) {
      alert("As senhas não coincidem.");
      return;
    }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setSavingPwd(false);
    if (error) {
      alert(`Erro ao alterar senha: ${error.message}`);
      return;
    }
    alert("Senha alterada com sucesso ✅");
    setNewPwd("");
    setConfirmPwd("");
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md min-h-[80vh]">
      {/* TABS */}
      <div className="flex gap-4 border-b mb-6">
        {isAdmin && (
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
        )}

        {isAdmin && (
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
        )}

        <button
          className={`pb-2 font-medium ${
            activeTab === "profile"
              ? "border-b-2 border-primary-600 text-primary-600"
              : "text-gray-500"
          }`}
          onClick={() => setActiveTab("profile")}
        >
          Meu Perfil
        </button>
      </div>

      {/* ================= DADOS DA EMPRESA ================= */}
      {activeTab === "company" && isAdmin && (
        <div className="max-w-3xl space-y-4">
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
      {activeTab === "users" && isAdmin && (
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
                <th className="p-3 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3 font-medium">{u.name}</td>
                  <td className="p-3 text-gray-500">{u.email}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      u.role === "Admin" ? "bg-purple-100 text-purple-700" :
                      u.role === "Finance" ? "bg-blue-100 text-blue-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {u.role === "Admin" ? "Admin" : u.role === "Finance" ? "Financeiro" : "Vendas"}
                    </span>
                  </td>
                  <td className="p-3">
                    {u.role === "Sales" || u.role === "Finance"
                      ? (u.monthlyGoal ?? 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : "—"}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => openEdit(u)}
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700 transition"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* MODAL EDITAR USUÁRIA */}
          {editingUser && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white w-full max-w-md rounded-xl shadow-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Editar Usuária</h3>
                  <button onClick={() => setEditingUser(null)} className="px-2 py-1 rounded hover:bg-gray-100">✕</button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block font-medium mb-1 text-sm">Email (não editável)</label>
                    <input
                      type="email"
                      className={`${inputClass} bg-gray-50`}
                      value={editingUser.email}
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-1 text-sm">Nome</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block font-medium mb-1 text-sm">Cargo</label>
                    <select
                      className={inputClass}
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as User["role"])}
                    >
                      <option value="Admin">Admin</option>
                      <option value="Finance">Financeiro</option>
                      <option value="Sales">Vendas</option>
                    </select>
                  </div>

                  {(editRole === "Sales" || editRole === "Finance") && (
                    <div>
                      <label className="block font-medium mb-1 text-sm">Meta Mensal (R$)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={inputClass}
                        value={editGoalInput}
                        onChange={(e) => {
                          const raw = sanitizeMoneyInputBR(e.target.value);
                          setEditGoalInput(raw);
                          setEditGoal(parseMoneyInputBR(raw));
                        }}
                        onBlur={() => setEditGoalInput(formatMoneyInputBR(editGoal))}
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-3 border-t">
                    <button
                      onClick={() => setEditingUser(null)}
                      className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm"
                      disabled={savingEdit}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60 text-sm"
                      disabled={savingEdit}
                    >
                      {savingEdit ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    {newAvatarPreview ? (
                      <img
                        src={newAvatarPreview}
                        alt="Avatar"
                        className="w-16 h-16 rounded-full object-cover border"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-2xl border">
                        👤
                      </div>
                    )}
                    <div>
                      <label className="block font-medium mb-1">Foto (opcional)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="text-sm"
                      />
                    </div>
                  </div>

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
                        type="text"
                        inputMode="decimal"
                        className={inputClass}
                        value={newGoalInput}
                        onChange={(e) => {
                          const rawValue = sanitizeMoneyInputBR(e.target.value);
                          setNewGoalInput(rawValue);
                          setNewGoal(parseMoneyInputBR(rawValue));
                        }}
                        onBlur={() => setNewGoalInput(formatMoneyInputBR(newGoal))}
                        disabled={!canShowGoal}
                        placeholder="Ex: 5000"
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

      {/* ================= MEU PERFIL ================= */}
      {activeTab === "profile" && (
        <div className="max-w-lg space-y-4">
          <h2 className="text-xl font-semibold">Meu Perfil</h2>

          {/* FOTO DE PERFIL */}
          <div className="flex flex-col items-center gap-3 py-4 border border-gray-200 rounded-xl bg-gray-50">
            <div className="relative group">
              {profileAvatarPreview ? (
                <img
                  src={profileAvatarPreview}
                  alt="Foto de perfil"
                  className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-md"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-primary-100 border-4 border-white shadow-md flex items-center justify-center text-primary-700 font-bold text-4xl">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
              )}
              {/* overlay de hover */}
              <label className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <span className="text-white text-xs font-semibold text-center px-2">
                  {uploadingAvatar ? "Enviando..." : "Alterar\nfoto"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingAvatar}
                  onChange={handleProfileAvatarChange}
                />
              </label>
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-800">{currentUser.name}</p>
              <p className="text-sm text-gray-500">
                {currentUser.role === "Admin" ? "Administrador" : currentUser.role === "Sales" ? "Vendas" : "Financeiro"}
              </p>
            </div>
            <label className={`px-4 py-1.5 text-sm rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100 transition ${uploadingAvatar ? "opacity-50 pointer-events-none" : ""}`}>
              {uploadingAvatar ? "Enviando..." : "Escolher foto"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingAvatar}
                onChange={handleProfileAvatarChange}
              />
            </label>
          </div>

          <div>
            <label className="block font-medium mb-1">Nome</label>
            <input
              type="text"
              className={`${inputClass} bg-gray-50`}
              value={currentUser.name}
              readOnly
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Email</label>
            <input
              type="email"
              className={`${inputClass} bg-gray-50`}
              value={currentUser.email}
              readOnly
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Cargo</label>
            <input
              type="text"
              className={`${inputClass} bg-gray-50`}
              value={
                currentUser.role === "Admin"
                  ? "Administrador"
                  : currentUser.role === "Sales"
                  ? "Vendas"
                  : "Financeiro"
              }
              readOnly
            />
          </div>

          {(currentUser.role === "Sales" || currentUser.role === "Finance") &&
            currentUser.monthlyGoal !== undefined && (
              <div>
                <label className="block font-medium mb-1">Meta Mensal</label>
                <input
                  type="text"
                  className={`${inputClass} bg-gray-50`}
                  value={currentUser.monthlyGoal.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  readOnly
                />
              </div>
            )}

          {/* ALTERAR SENHA */}
          <div className="border-t pt-5 mt-2 space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Alterar Senha</h3>

            <div>
              <label className="block font-medium mb-1">Nova Senha</label>
              <input
                type="password"
                className={inputClass}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Confirmar Nova Senha</label>
              <input
                type="password"
                className={inputClass}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="Repita a nova senha"
              />
            </div>

            <button
              onClick={handleChangePassword}
              disabled={savingPwd || !newPwd || !confirmPwd}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
            >
              {savingPwd ? "Salvando..." : "Salvar Senha"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
