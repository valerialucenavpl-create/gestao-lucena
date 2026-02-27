import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabase";

type Props = {
  id?: string;
  setActiveView?: (v: any) => void;
};

const ROLES = [
  "ADMINISTRADOR",
  "GERENTE ADMINISTRATIVO",
  "ANALISTA COMERCIAL",
  "AUXILIAR ADMINISTRATIVO",
  "VENDEDORA",
  "SERRALHEIRO DE PRODUÇÃO",
  "AUXILIAR DE PRODUÇÃO",
  "AUXILIAR DE INSTALAÇÃO",
  "INSTALADOR",
  "MARMORISTA DE PRODUÇÃO",
];

const SECTORS = ["Administração", "Vendas", "Produção"];
const GENDERS = ["Feminino", "Masculino"];

/** =========================
 *  HELPERS
 *  ========================= */
const onlyDigits = (v: string) => v.replace(/\D/g, "");

const cpfMask = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
};

const phoneMask = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
};

const dateMask = (v: string) => {
  const d = onlyDigits(v).slice(0, 8);
  return d
    .replace(/^(\d{2})(\d)/, "$1/$2")
    .replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
};

// ✅ DD/MM/YYYY -> YYYY-MM-DD (para colunas date)
const brToISO = (br: string) => {
  const d = onlyDigits(br);
  if (d.length !== 8) return null;
  const dd = d.slice(0, 2);
  const mm = d.slice(2, 4);
  const yyyy = d.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
};

const brToDate = (br: string) => {
  const d = onlyDigits(br);
  if (d.length !== 8) return null;
  const dd = Number(d.slice(0, 2));
  const mm = Number(d.slice(2, 4));
  const yyyy = Number(d.slice(4, 8));
  const dt = new Date(yyyy, mm - 1, dd);
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return dt;
};

const dateToBR = (dt: Date) => {
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = String(dt.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
};

// Digitação de dinheiro: "200000" -> "2.000,00"
const moneyMask = (v: string) => {
  const d = onlyDigits(v);
  if (!d) return "";
  const n = Number(d) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseMoneyBR = (v: string) => {
  const cleaned = v.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const formatBRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const labelCls = "text-sm font-semibold text-gray-800 mb-1";
const inputCls =
  "w-full p-2 rounded border border-black bg-white text-gray-900 placeholder-gray-400 " +
  "focus:outline-none focus:ring-0 focus:border-black";
const EmployeeForm: React.FC<Props> = ({ id, setActiveView }) => {
  // DADOS PESSOAIS
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  // CONTRATAÇÃO
  const [role, setRole] = useState("");
  const [sector, setSector] = useState("");
  const [admission, setAdmission] = useState("");
  const [dependents, setDependents] = useState("");

  // SALÁRIOS
  const [baseSalary, setBaseSalary] = useState("");
  const [netSalary, setNetSalary] = useState("");

  const baseNum = useMemo(() => parseMoneyBR(baseSalary), [baseSalary]);
  const netNum = useMemo(() => parseMoneyBR(netSalary), [netSalary]);

  const monthlyHours = 240;
  const hourValue = useMemo(() => (netNum > 0 ? netNum / monthlyHours : 0), [netNum]);
  const minuteValue = useMemo(() => hourValue / 60, [hourValue]);

  // previsão de férias = admissão + 1 ano (VISUAL apenas)
  const vacationForecast = useMemo(() => {
    const dt = brToDate(admission);
    if (!dt) return "";
    const v = new Date(dt);
    v.setFullYear(v.getFullYear() + 1);
    return dateToBR(v);
  }, [admission]);

  // ✅ CUSTOS AUTOMÁTICOS (baseado no SALÁRIO BASE)
  const costs = useMemo(() => {
    const base = baseNum;

    const inss_value = base * 0.09;
    const inss_employer = base * 0.09;
    const fgts = base * 0.08;
    const fgts_fine_40 = fgts * 0.4;
    const thirteenth_salary = base / 12;
    const vacation_extra = (base / 3) / 12;

    const total_monthly_cost =
      base + inss_employer + fgts + fgts_fine_40 + thirteenth_salary + vacation_extra;

    return {
      monthly_hours: monthlyHours,
      inss_value,
      inss_employer,
      fgts,
      fgts_fine_40,
      thirteenth_salary,
      vacation_extra,
      total_monthly_cost,
    };
  }, [baseNum]);

  // LOAD (edição)
  useEffect(() => {
    if (!id) return;

    supabase
      .from("employees")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar employee:", error);
          return;
        }
        if (!data) return;

        setName(data.name || "");
        setBirth(data.birth_date ? dateMask(String(data.birth_date)) : "");
        setGender(data.gender || "");
        setCpf(data.cpf ? cpfMask(String(data.cpf)) : "");
        setPhone(data.phone ? phoneMask(String(data.phone)) : "");
        setCity(data.city || "");
        setAddress(data.address || "");

        setRole(data.role || "");
        setSector(data.department || "");
        setAdmission(data.admission_date ? dateMask(String(data.admission_date)) : "");
        setDependents(data.dependents || "");

        setBaseSalary(
          typeof data.base_salary === "number"
            ? moneyMask(String(Math.round(data.base_salary * 100)))
            : ""
        );
        setNetSalary(
          typeof data.net_salary === "number"
            ? moneyMask(String(Math.round(data.net_salary * 100)))
            : ""
        );
      });
  }, [id]);

  const goBack = () => setActiveView?.("employees");

  // ✅ tenta salvar, se supabase reclamar de coluna inexistente, remove e tenta de novo
  const saveWithAutoDropUnknown = async (payload: Record<string, any>) => {
    let tries = 0;
    let p = { ...payload };

    while (tries < 12) {
      tries++;

      const res = id
        ? await supabase.from("employees").update(p).eq("id", id)
        : await supabase.from("employees").insert([p]);

      if (!res.error) return { ok: true as const };

      const msg = res.error.message || "";
      const match = msg.match(/Could not find the '([^']+)' column/i);

      // se for coluna inexistente -> remove e tenta novamente
      if (match?.[1]) {
        const col = match[1];
        delete p[col];
        console.warn(`Removendo coluna inexistente do payload e tentando de novo: ${col}`);
        continue;
      }

      // outro erro -> para e mostra
      console.error("Erro ao salvar:", res.error);
      return { ok: false as const, error: res.error };
    }

    return {
      ok: false as const,
      error: { message: "Muitas tentativas. Ainda existe alguma coluna inválida no payload." },
    };
  };
  const handleSave = async () => {
    if (!name || !role || !sector) {
      alert("Preencha nome, cargo e setor");
      return;
    }

    // payload completo (o salvamento remove automaticamente colunas que não existirem)
    const payload: Record<string, any> = {
      name,
      birth_date: brToISO(birth),       // date
      gender,
      cpf,
      phone,
      city,
      address,

      role,
      department: sector,
      admission_date: brToISO(admission), // date
      dependents,

      base_salary: baseNum,
      net_salary: netNum,
      hour_value: hourValue,
      minute_value: minuteValue,

      // custos (se existirem as colunas no supabase, ele salva; se não, ele remove sozinho)
      monthly_hours: costs.monthly_hours,
      inss_value: costs.inss_value,
      inss_employer: costs.inss_employer,
      fgts: costs.fgts,
      fgts_fine_40: costs.fgts_fine_40,
      thirteenth_salary: costs.thirteenth_salary,
      total_monthly_cost: costs.total_monthly_cost,
    };

    // limpa undefined para não atrapalhar
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    const r = await saveWithAutoDropUnknown(payload);

    if (!r.ok) {
      const msg = (r as any).error?.message || "Erro ao salvar";
      alert(`Erro ao salvar: ${msg}`);
      return;
    }

    goBack();
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{id ? "Editar Funcionário" : "Novo Funcionário"}</h2>

        <button
          type="button"
          onClick={goBack}
          className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
        >
          Cancelar
        </button>
      </div>

      {/* 1) DADOS PESSOAIS */}
      <div className="border rounded-xl p-4">
        <h3 className="font-semibold mb-4">Dados pessoais</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className={labelCls}>Nome completo</div>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <div className={labelCls}>Data de nascimento</div>
            <input
              className={inputCls}
              value={birth}
              onChange={(e) => setBirth(dateMask(e.target.value))}
              placeholder="00/00/0000"
              inputMode="numeric"
            />
          </div>

          <div>
            <div className={labelCls}>Gênero</div>
            <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Selecione</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className={labelCls}>CPF</div>
            <input
              className={inputCls}
              value={cpf}
              onChange={(e) => setCpf(cpfMask(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
          </div>

          <div>
            <div className={labelCls}>Telefone</div>
            <input
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(phoneMask(e.target.value))}
              placeholder="(00) 00000-0000"
              inputMode="numeric"
            />
          </div>

          <div>
            <div className={labelCls}>Cidade</div>
            <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>

          <div className="md:col-span-3">
            <div className={labelCls}>Endereço</div>
            <input
              className={inputCls}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, bairro, número, complemento, cidade"
            />
          </div>
        </div>
      </div>

      {/* 2) DADOS DE CONTRATAÇÃO */}
      <div className="border rounded-xl p-4">
        <h3 className="font-semibold mb-4">Dados de contratação</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div className={labelCls}>Salário base</div>
            <input
              className={inputCls}
              value={baseSalary}
              onChange={(e) => setBaseSalary(moneyMask(e.target.value))}
              placeholder="0.000,00"
              inputMode="numeric"
            />
          </div>

          <div>
            <div className={labelCls}>Salário líquido</div>
            <input
              className={inputCls}
              value={netSalary}
              onChange={(e) => setNetSalary(moneyMask(e.target.value))}
              placeholder="0.000,00"
              inputMode="numeric"
            />
          </div>

          <div>
            <div className={labelCls}>Valor hora</div>
            <input className={inputCls} value={formatBRL(hourValue)} readOnly />
          </div>

          <div>
            <div className={labelCls}>Valor minuto</div>
            <input className={inputCls} value={formatBRL(minuteValue)} readOnly />
          </div>

          <div>
            <div className={labelCls}>Cargo</div>
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Selecione</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className={labelCls}>Setor</div>
            <select className={inputCls} value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">Selecione</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className={labelCls}>Data de admissão</div>
            <input
              className={inputCls}
              value={admission}
              onChange={(e) => setAdmission(dateMask(e.target.value))}
              placeholder="00/00/0000"
              inputMode="numeric"
            />
          </div>

          <div>
            <div className={labelCls}>Previsão de férias</div>
            <input className={inputCls} value={vacationForecast} readOnly />
          </div>

          <div className="md:col-span-4">
            <div className={labelCls}>Informação dos dependentes (nomes)</div>
            <input
              className={inputCls}
              value={dependents}
              onChange={(e) => setDependents(e.target.value)}
              placeholder="Ex: João, Maria..."
            />
          </div>
        </div>
      </div>

      {/* 3) CUSTO TOTAL DO COLABORADOR */}
      <div className="border rounded-xl p-4">
        <h3 className="font-semibold mb-4">Custo total do colaborador</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div className={labelCls}>Hora/mês</div>
            <input className={inputCls} value={String(costs.monthly_hours)} readOnly />
          </div>

          <div>
            <div className={labelCls}>Valor do INSS</div>
            <input className={inputCls} value={formatBRL(costs.inss_value)} readOnly />
          </div>

          <div>
            <div className={labelCls}>INSS Patronal</div>
            <input className={inputCls} value={formatBRL(costs.inss_employer)} readOnly />
          </div>

          <div>
            <div className={labelCls}>FGTS</div>
            <input className={inputCls} value={formatBRL(costs.fgts)} readOnly />
          </div>

          <div>
            <div className={labelCls}>FGTS Multa 40%</div>
            <input className={inputCls} value={formatBRL(costs.fgts_fine_40)} readOnly />
          </div>

          <div>
            <div className={labelCls}>Décimo terceiro</div>
            <input className={inputCls} value={formatBRL(costs.thirteenth_salary)} readOnly />
          </div>

          <div className="md:col-span-2">
            <div className={labelCls}>Custo total mensal</div>
            <input
              className={inputCls + " font-bold text-blue-700"}
              value={formatBRL(costs.total_monthly_cost)}
              readOnly
            />
          </div>
        </div>

        <div className="text-xs text-gray-500 mt-3">
          * Cálculo automático: base + INSS patronal + FGTS + multa 40% + 13º + (1/3 férias / 12)
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={goBack}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Salvar
        </button>
      </div>
    </div>
  );
};

export default EmployeeForm;
