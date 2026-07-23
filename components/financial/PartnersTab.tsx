import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabase";
import {
  formatMoneyInputBR,
  parseMoneyInputBR,
  sanitizeMoneyInputBR,
} from "../../utils/money";

type Partner = {
  id: string;
  name: string;
  pro_labore: number;
  inss_value: number;
  net_value: number;
};

const INSS_TETO = 8475.55;
const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

const calcInssSocio = (proLabore: number) =>
  round2(Math.min(proLabore, INSS_TETO) * 0.11);

const formatBRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PartnersTab: React.FC = () => {
  const [items, setItems] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Partner | null>(null);
  const [name, setName] = useState("");
  const [proLabore, setProLabore] = useState("");

  const load = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("partners")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Erro ao carregar sócios:", error);
      setItems([]);
    } else {
      setItems((data as Partner[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const proLaboreNum = useMemo(() => parseMoneyInputBR(proLabore), [proLabore]);
  const inssPreview = useMemo(() => calcInssSocio(proLaboreNum), [proLaboreNum]);
  const netPreview = useMemo(() => round2(proLaboreNum - inssPreview), [proLaboreNum, inssPreview]);

  const reset = () => {
    setEditing(null);
    setName("");
    setProLabore("");
  };

  const save = async () => {
    if (!name || proLaboreNum <= 0) return;

    const inss_value = calcInssSocio(proLaboreNum);
    const net_value = round2(proLaboreNum - inss_value);

    const payload = {
      name,
      pro_labore: proLaboreNum,
      inss_value,
      net_value,
    };

    if (editing) {
      await supabase.from("partners").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("partners").insert([payload]);
    }

    reset();
    load();
  };

  const edit = (it: Partner) => {
    setEditing(it);
    setName(it.name);
    setProLabore(formatMoneyInputBR(Number(it.pro_labore || 0)));
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir sócio?")) return;
    await supabase.from("partners").delete().eq("id", id);
    load();
  };

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, p) => ({
          proLabore: acc.proLabore + Number(p.pro_labore || 0),
          inss: acc.inss + Number(p.inss_value || 0),
          net: acc.net + Number(p.net_value || 0),
        }),
        { proLabore: 0, inss: 0, net: 0 }
      ),
    [items]
  );

  if (loading) return <p>Carregando...</p>;

  return (
    <div className="bg-white p-6 rounded-xl shadow space-y-6">
      <h3 className="text-lg font-semibold">Sócios (pró-labore)</h3>
      <p className="text-sm text-gray-500">
        Sócios não têm FGTS, 13º, férias ou multa de 40%. INSS = 11% do pró-labore (limitado ao
        teto de {formatBRL(INSS_TETO)}). O valor bruto do pró-labore entra no custo fixo mensal da
        empresa.
      </p>

      {/* FORM */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <input
          className="p-2 border rounded"
          placeholder="Nome do sócio"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="p-2 border rounded"
          placeholder="Pró-labore (R$)"
          value={proLabore}
          onChange={(e) => setProLabore(sanitizeMoneyInputBR(e.target.value))}
          onBlur={() => setProLabore(formatMoneyInputBR(parseMoneyInputBR(proLabore)))}
        />

        <div className="text-sm text-gray-600">
          <p>INSS (11%): <strong>{formatBRL(inssPreview)}</strong></p>
          <p>Líquido: <strong>{formatBRL(netPreview)}</strong></p>
        </div>

        <div className="flex gap-2">
          <button onClick={save} className="px-4 py-2 rounded bg-blue-600 text-white">
            {editing ? "Salvar" : "Adicionar"}
          </button>
          {editing && (
            <button onClick={reset} className="px-4 py-2 rounded bg-gray-200">
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* TOTAIS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
          <p className="font-semibold text-blue-800">Total Pró-labore (bruto)</p>
          <p className="text-xl font-bold text-blue-900">{formatBRL(totals.proLabore)}</p>
          <p className="text-xs text-blue-700">Soma ao custo fixo mensal da empresa</p>
        </div>

        <div className="p-4 rounded-lg bg-gray-50 border">
          <p className="font-semibold">Total INSS (11%)</p>
          <p className="text-sm text-gray-600">{formatBRL(totals.inss)}</p>
        </div>

        <div className="p-4 rounded-lg bg-gray-50 border">
          <p className="font-semibold">Total Líquido</p>
          <p className="text-sm text-gray-600">{formatBRL(totals.net)}</p>
        </div>
      </div>

      {/* TABELA */}
      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 text-left">Sócio</th>
            <th className="p-2 text-left">Pró-labore (bruto)</th>
            <th className="p-2 text-left">INSS (11%)</th>
            <th className="p-2 text-left">Líquido</th>
            <th className="p-2 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-4 text-center text-gray-500">
                Nenhum sócio cadastrado
              </td>
            </tr>
          ) : (
            items.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.name}</td>
                <td className="p-2">{formatBRL(Number(p.pro_labore || 0))}</td>
                <td className="p-2">{formatBRL(Number(p.inss_value || 0))}</td>
                <td className="p-2">{formatBRL(Number(p.net_value || 0))}</td>
                <td className="p-2 text-center space-x-3">
                  <button onClick={() => edit(p)} className="text-blue-600 hover:underline">
                    Editar
                  </button>
                  <button onClick={() => remove(p.id)} className="text-red-600 hover:underline">
                    Excluir
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default PartnersTab;
