import React, { useEffect, useMemo, useState } from "react";
import { User, CompanySettings, BankAccount, CashFlowCategory, DreGroup, DfcGroup, DRE_GROUP_LABELS, DFC_GROUP_LABELS } from "../types";
import {
  uploadCompanyLogo,
  saveCompanySettings,
} from "../services/companySettingsServices";
import { createUser, uploadUserAvatar, updateUserProfile } from "../services/userService";
import { getBankAccounts, createBankAccount, updateBankAccount } from "../services/bankAccountsServices";
import { getCashFlowCategories, createCashFlowCategory, updateCashFlowCategory } from "../services/cashflowCategoriesServices";
import { getCashFlowSettings, saveCashFlowSettings } from "../services/cashflowSettingsServices";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../utils/money";
import { supabase } from "../services/supabase";
import { DEFAULT_RELIABLE_START, SECTORS, SECTOR_LABELS } from "../utils/salesReport";

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

  const [activeTab, setActiveTab] = useState<"company" | "cashflow" | "users" | "profile">(
    isAdmin ? "company" : "profile"
  );

  // ================== PLANO DE CONTAS / CONTAS BANCÁRIAS ==================
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [categories, setCategories] = useState<CashFlowCategory[]>([]);
  const [defaultAccountDinheiro, setDefaultAccountDinheiro] = useState("");
  const [defaultAccountPix, setDefaultAccountPix] = useState("");
  const [saleRecognitionDate, setSaleRecognitionDate] = useState<"delivery" | "approval">("delivery");
  const [targetNetMargin, setTargetNetMargin] = useState("");
  const [materialCostMode, setMaterialCostMode] = useState<"budgeted" | "cashflow">("budgeted");
  const [reliableDataStart, setReliableDataStart] = useState(DEFAULT_RELIABLE_START);
  const [minMarginBySector, setMinMarginBySector] = useState<Record<string, string>>({});
  const [loadingCashflowConfig, setLoadingCashflowConfig] = useState(false);
  const [savingCashflowDefaults, setSavingCashflowDefaults] = useState(false);

  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState(0);
  const [newAccountBalanceInput, setNewAccountBalanceInput] = useState(formatMoneyInputBR(0));
  const [newAccountDate, setNewAccountDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newAccountType, setNewAccountType] = useState<"movimento" | "reserva">("movimento");
  const [savingAccount, setSavingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccountBalanceInput, setEditAccountBalanceInput] = useState<Record<string, string>>({});
  const [editAccountDate, setEditAccountDate] = useState<Record<string, string>>({});
  const [savingAccountEditId, setSavingAccountEditId] = useState<string | null>(null);

  const [newCatType, setNewCatType] = useState<"Entrada" | "Saída">("Saída");
  const [newCatCategory, setNewCatCategory] = useState("");
  const [newCatGroupTitle, setNewCatGroupTitle] = useState("");
  const [newCatSubcategory, setNewCatSubcategory] = useState("");
  const [newCatDre, setNewCatDre] = useState<DreGroup | "">("");
  const [newCatDfc, setNewCatDfc] = useState<DfcGroup | "">("");
  const [savingCategory, setSavingCategory] = useState(false);

  const loadCashflowConfig = async () => {
    setLoadingCashflowConfig(true);
    const [accRes, catRes, settingsRes] = await Promise.all([
      getBankAccounts(),
      getCashFlowCategories(),
      getCashFlowSettings(),
    ]);
    if (accRes.ok) setAccounts(accRes.data);
    if (catRes.ok) setCategories(catRes.data);
    if (settingsRes.ok) {
      setDefaultAccountDinheiro(settingsRes.data.defaultAccountDinheiro || "");
      setDefaultAccountPix(settingsRes.data.defaultAccountPix || "");
      setSaleRecognitionDate(settingsRes.data.saleRecognitionDate || "delivery");
      setTargetNetMargin(settingsRes.data.targetNetMargin != null ? String(settingsRes.data.targetNetMargin) : "");
      setMaterialCostMode(settingsRes.data.materialCostMode || "budgeted");
      setReliableDataStart(settingsRes.data.reliableDataStart || DEFAULT_RELIABLE_START);
      const mm = settingsRes.data.minMarginBySector || {};
      setMinMarginBySector(Object.fromEntries(Object.entries(mm).map(([k, v]) => [k, String(v)])));
    }
    setLoadingCashflowConfig(false);
  };

  useEffect(() => {
    if (activeTab === "cashflow" && isAdmin) loadCashflowConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleSaveDefaults = async () => {
    setSavingCashflowDefaults(true);
    const r = await saveCashFlowSettings({
      defaultAccountDinheiro: defaultAccountDinheiro || undefined,
      defaultAccountPix: defaultAccountPix || undefined,
      saleRecognitionDate,
      targetNetMargin: targetNetMargin.trim() ? Number(targetNetMargin.replace(",", ".")) : undefined,
      materialCostMode,
      reliableDataStart: reliableDataStart || DEFAULT_RELIABLE_START,
      minMarginBySector: Object.fromEntries(
        (Object.entries(minMarginBySector) as [string, string][])
          .filter(([, v]) => v.trim() !== "")
          .map(([k, v]) => [k, Number(v.replace(",", "."))])
      ),
    });
    setSavingCashflowDefaults(false);
    if (!r.ok) alert("Não foi possível salvar: " + (r.error?.message ?? "erro desconhecido"));
  };

  const handleAddAccount = async () => {
    if (!newAccountName.trim()) return alert("Informe o nome da conta.");
    setSavingAccount(true);
    const r = await createBankAccount({
      name: newAccountName,
      initialBalance: newAccountBalance,
      initialBalanceDate: newAccountDate,
      accountType: newAccountType,
    });
    setSavingAccount(false);
    if (!r.ok || !r.data) {
      alert("Não foi possível criar a conta: " + (r.error?.message ?? "erro desconhecido"));
      return;
    }
    setAccounts((prev) => [...prev, r.data as BankAccount].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    setNewAccountName("");
    setNewAccountBalance(0);
    setNewAccountBalanceInput(formatMoneyInputBR(0));
  };

  const handleToggleAccountActive = async (acc: BankAccount) => {
    const r = await updateBankAccount(acc.id, { active: !acc.active });
    if (!r.ok || !r.data) return alert("Não foi possível atualizar a conta.");
    setAccounts((prev) => prev.map((a) => (a.id === acc.id ? (r.data as BankAccount) : a)));
  };

  const handleSaveAccountBalance = async (acc: BankAccount) => {
    const raw = editAccountBalanceInput[acc.id];
    const dateVal = editAccountDate[acc.id] || acc.initialBalanceDate;
    const balanceVal = raw !== undefined ? parseMoneyInputBR(raw) : acc.initialBalance;
    setSavingAccountEditId(acc.id);
    const r = await updateBankAccount(acc.id, { initialBalance: balanceVal, initialBalanceDate: dateVal });
    setSavingAccountEditId(null);
    if (!r.ok || !r.data) return alert("Não foi possível salvar o saldo.");
    setAccounts((prev) => prev.map((a) => (a.id === acc.id ? (r.data as BankAccount) : a)));
    setEditingAccountId(null);
  };

  const handleAddCategory = async () => {
    if (!newCatCategory.trim() || !newCatGroupTitle.trim() || !newCatSubcategory.trim()) {
      return alert("Preencha categoria, grupo e subcategoria.");
    }
    if (!newCatDre || !newCatDfc) {
      return alert("Selecione o grupo_dre e o grupo_dfc — nenhuma subcategoria pode ser criada sem essa classificação.");
    }
    setSavingCategory(true);
    const r = await createCashFlowCategory({
      type: newCatType,
      category: newCatCategory,
      groupTitle: newCatGroupTitle,
      subcategory: newCatSubcategory,
      grupoDre: newCatDre,
      grupoDfc: newCatDfc,
    });
    setSavingCategory(false);
    if (!r.ok || !r.data) {
      alert("Não foi possível criar: " + (r.error?.message ?? "já existe ou erro desconhecido"));
      return;
    }
    setCategories((prev) => [...prev, r.data as CashFlowCategory]);
    setNewCatCategory("");
    setNewCatGroupTitle("");
    setNewCatSubcategory("");
  };

  const handleUpdateCategoryGroup = async (cat: CashFlowCategory, field: "grupoDre" | "grupoDfc", value: string) => {
    const r = await updateCashFlowCategory(cat.id, { [field]: value } as any);
    if (!r.ok || !r.data) return alert("Não foi possível atualizar.");
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? (r.data as CashFlowCategory) : c)));
  };

  const categoriesByTypeAndCategory = useMemo(() => {
    const map = new Map<string, CashFlowCategory[]>();
    categories.forEach((c) => {
      const key = `${c.type}||${c.category}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return map;
  }, [categories]);

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
              activeTab === "cashflow"
                ? "border-b-2 border-primary-600 text-primary-600"
                : "text-gray-500"
            }`}
            onClick={() => setActiveTab("cashflow")}
          >
            Plano de Contas
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

      {/* ================= PLANO DE CONTAS / CONTAS BANCÁRIAS ================= */}
      {activeTab === "cashflow" && isAdmin && (
        <div className="max-w-4xl space-y-8">
          {loadingCashflowConfig ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : (
            <>
              {/* Contas bancárias */}
              <div>
                <h2 className="text-xl font-semibold mb-3">Contas bancárias</h2>
                <div className="space-y-2 mb-4">
                  {accounts.map((acc) =>
                    editingAccountId === acc.id ? (
                      <div key={acc.id} className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2">
                        <p className="text-sm font-semibold text-gray-800 mb-2">{acc.name}</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Saldo inicial</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              className={inputClass}
                              value={editAccountBalanceInput[acc.id] ?? formatMoneyInputBR(acc.initialBalance)}
                              onChange={(e) =>
                                setEditAccountBalanceInput((prev) => ({
                                  ...prev,
                                  [acc.id]: sanitizeMoneyInputBR(e.target.value),
                                }))
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Data do saldo inicial</label>
                            <input
                              type="date"
                              className={inputClass}
                              value={editAccountDate[acc.id] ?? acc.initialBalanceDate ?? ""}
                              onChange={(e) => setEditAccountDate((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveAccountBalance(acc)}
                              disabled={savingAccountEditId === acc.id}
                              className="text-xs font-semibold px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
                            >
                              {savingAccountEditId === acc.id ? "Salvando..." : "Salvar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAccountId(null)}
                              className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={acc.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                          acc.active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            {acc.name}
                            {acc.accountType === "reserva" && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 uppercase">Reserva</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            Saldo inicial: R$ {formatMoneyInputBR(acc.initialBalance)} em{" "}
                            {acc.initialBalanceDate ? new Date(acc.initialBalanceDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAccountId(acc.id);
                              setEditAccountBalanceInput((prev) => ({ ...prev, [acc.id]: formatMoneyInputBR(acc.initialBalance) }));
                              setEditAccountDate((prev) => ({ ...prev, [acc.id]: acc.initialBalanceDate || "" }));
                            }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleAccountActive(acc)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${
                              acc.active
                                ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {acc.active ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border-t pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Nome da conta</label>
                    <input
                      type="text"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      placeholder="Ex.: Nubank PJ"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Saldo inicial (R$)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newAccountBalanceInput}
                      onChange={(e) => {
                        const raw = sanitizeMoneyInputBR(e.target.value);
                        setNewAccountBalanceInput(raw);
                        setNewAccountBalance(parseMoneyInputBR(raw));
                      }}
                      onBlur={() => setNewAccountBalanceInput(formatMoneyInputBR(newAccountBalance))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Data do saldo inicial</label>
                    <input
                      type="date"
                      value={newAccountDate}
                      onChange={(e) => setNewAccountDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tipo de conta</label>
                    <select value={newAccountType} onChange={(e) => setNewAccountType(e.target.value as "movimento" | "reserva")} className={inputClass}>
                      <option value="movimento">Movimento</option>
                      <option value="reserva">Reserva/Investimento</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddAccount}
                    disabled={savingAccount}
                    className="bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
                  >
                    {savingAccount ? "Salvando..." : "+ Adicionar conta"}
                  </button>
                </div>
              </div>

              {/* Conta padrão por forma de pagamento */}
              <div className="border-t pt-6">
                <h2 className="text-xl font-semibold mb-1">Conta padrão por forma de pagamento</h2>
                <p className="text-xs text-gray-500 mb-3">
                  Usada pra pré-preencher a conta ao registrar um recebimento de venda. Cartão não tem padrão fixo —
                  sempre pergunta qual maquininha foi usada.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-md">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Dinheiro</label>
                    <select
                      value={defaultAccountDinheiro}
                      onChange={(e) => setDefaultAccountDinheiro(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Sem padrão</option>
                      {accounts.filter((a) => a.active).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">PIX</label>
                    <select
                      value={defaultAccountPix}
                      onChange={(e) => setDefaultAccountPix(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Sem padrão</option>
                      {accounts.filter((a) => a.active).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveDefaults}
                  disabled={savingCashflowDefaults}
                  className="mt-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
                >
                  {savingCashflowDefaults ? "Salvando..." : "Salvar padrões"}
                </button>
              </div>

              {/* DRE — reconhecimento de receita e meta de margem */}
              <div className="border-t pt-6">
                <h2 className="text-xl font-semibold mb-1">DRE</h2>
                <p className="text-xs text-gray-500 mb-3">
                  Regra de reconhecimento de receita e meta única de margem líquida, usada em todos os alertas do sistema.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-md">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Data de reconhecimento da venda</label>
                    <select
                      value={saleRecognitionDate}
                      onChange={(e) => setSaleRecognitionDate(e.target.value as "delivery" | "approval")}
                      className={inputClass}
                    >
                      <option value="delivery">Entrega</option>
                      <option value="approval">Aprovação do orçamento</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Meta de margem líquida (%)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={targetNetMargin}
                      onChange={(e) => setTargetNetMargin(e.target.value.replace(/[^0-9,.]/g, ""))}
                      placeholder="Ex: 20"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Custo de material na DRE</label>
                    <select
                      value={materialCostMode}
                      onChange={(e) => setMaterialCostMode(e.target.value as "budgeted" | "cashflow")}
                      className={inputClass}
                    >
                      <option value="budgeted">Custo orçado dos pedidos concluídos</option>
                      <option value="cashflow">Compras lançadas no Caixa</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Início dos dados confiáveis</label>
                    <input
                      type="date"
                      value={reliableDataStart}
                      onChange={(e) => setReliableDataStart(e.target.value)}
                      className={inputClass}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Períodos antes dessa data aparecem como "não conferido" em DRE, DFC e Vendas.</p>
                  </div>
                </div>

                <h3 className="text-sm font-semibold text-gray-700 mt-5 mb-1">Margem mínima por setor (%)</h3>
                <p className="text-xs text-gray-500 mb-2">
                  Em Relatórios → Vendas, produtos com margem sobre o custo orçado abaixo desse valor ficam em vermelho ("preço abaixo do mínimo").
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
                  {SECTORS.map((sec) => (
                    <div key={sec}>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">{SECTOR_LABELS[sec]}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={minMarginBySector[sec] ?? ""}
                        onChange={(e) =>
                          setMinMarginBySector((prev) => ({ ...prev, [sec]: e.target.value.replace(/[^0-9,.]/g, "") }))
                        }
                        placeholder="Ex: 30"
                        className={inputClass}
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSaveDefaults}
                  disabled={savingCashflowDefaults}
                  className="mt-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
                >
                  {savingCashflowDefaults ? "Salvando..." : "Salvar"}
                </button>
              </div>

              {/* Plano de contas */}
              <div className="border-t pt-6">
                <h2 className="text-xl font-semibold mb-1">Plano de contas</h2>
                <p className="text-xs text-gray-500 mb-3">
                  Classificação de cada subcategoria pro DRE e pro DFC — editável aqui, sem mexer em relatório nenhum.
                </p>

                {(["Entrada", "Saída"] as const).map((t) => (
                  <div key={t} className="mb-6">
                    <h3 className="text-sm font-bold uppercase text-gray-600 mb-2">{t}</h3>
                    {Array.from(categoriesByTypeAndCategory.entries())
                      .filter(([key]) => key.startsWith(`${t}||`))
                      .map(([key, items]) => {
                        const categoryName = key.split("||")[1];
                        return (
                          <div key={key} className="mb-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{categoryName}</p>
                            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                              {items
                                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                                .map((cat) => (
                                  <div key={cat.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm bg-white">
                                    <span className="flex-1 min-w-[160px] text-gray-700">{cat.subcategory}</span>
                                    <select
                                      value={cat.grupoDre}
                                      onChange={(e) => handleUpdateCategoryGroup(cat, "grupoDre", e.target.value)}
                                      className="text-xs border border-gray-300 rounded px-2 py-1"
                                    >
                                      {Object.entries(DRE_GROUP_LABELS).map(([k, label]) => (
                                        <option key={k} value={k}>{label}</option>
                                      ))}
                                    </select>
                                    <select
                                      value={cat.grupoDfc}
                                      onChange={(e) => handleUpdateCategoryGroup(cat, "grupoDfc", e.target.value)}
                                      className="text-xs border border-gray-300 rounded px-2 py-1"
                                    >
                                      {Object.entries(DFC_GROUP_LABELS).map(([k, label]) => (
                                        <option key={k} value={k}>{label}</option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}

                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">+ Adicionar subcategoria</p>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                    <select value={newCatType} onChange={(e) => setNewCatType(e.target.value as any)} className={inputClass}>
                      <option value="Entrada">Entrada</option>
                      <option value="Saída">Saída</option>
                    </select>
                    <input type="text" placeholder="Categoria" value={newCatCategory} onChange={(e) => setNewCatCategory(e.target.value)} className={inputClass} />
                    <input type="text" placeholder="Grupo" value={newCatGroupTitle} onChange={(e) => setNewCatGroupTitle(e.target.value)} className={inputClass} />
                    <input type="text" placeholder="Subcategoria" value={newCatSubcategory} onChange={(e) => setNewCatSubcategory(e.target.value)} className={inputClass} />
                    <select value={newCatDre} onChange={(e) => setNewCatDre(e.target.value as DreGroup)} className="text-xs border border-gray-300 rounded px-2 py-2">
                      <option value="">grupo_dre...</option>
                      {Object.entries(DRE_GROUP_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                    <select value={newCatDfc} onChange={(e) => setNewCatDfc(e.target.value as DfcGroup)} className="text-xs border border-gray-300 rounded px-2 py-2">
                      <option value="">grupo_dfc...</option>
                      {Object.entries(DFC_GROUP_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    disabled={savingCategory}
                    className="mt-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
                  >
                    {savingCategory ? "Salvando..." : "+ Adicionar"}
                  </button>
                </div>
              </div>
            </>
          )}
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
