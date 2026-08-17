import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";
import { formatMoneyInputBR, parseMoneyInputBR, sanitizeMoneyInputBR } from "../../utils/money";

const FreightConfigTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState<number | null>(null);

  const [kmRateCarInput, setKmRateCarInput] = useState(formatMoneyInputBR(0));
  const [kmRateCar, setKmRateCar] = useState(0);
  const [kmRateMotoInput, setKmRateMotoInput] = useState(formatMoneyInputBR(0));
  const [kmRateMoto, setKmRateMoto] = useState(0);
  const [markupInput, setMarkupInput] = useState("0");
  const [markup, setMarkup] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("freight_config")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1);
      const row = data?.[0];
      if (row) {
        setRowId(row.id);
        setKmRateCar(Number(row.km_rate_car || 0));
        setKmRateCarInput(formatMoneyInputBR(Number(row.km_rate_car || 0)));
        setKmRateMoto(Number(row.km_rate_moto || 0));
        setKmRateMotoInput(formatMoneyInputBR(Number(row.km_rate_moto || 0)));
        setMarkup(Number(row.markup || 0));
        setMarkupInput(String(row.markup || 0));
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const payload = { km_rate_car: kmRateCar, km_rate_moto: kmRateMoto, markup };

    const query = rowId
      ? supabase.from("freight_config").update(payload).eq("id", rowId).select().single()
      : supabase.from("freight_config").insert([payload]).select().single();

    const { data, error } = await query;
    setSaving(false);

    if (error) {
      alert("Não foi possível salvar: " + error.message);
      return;
    }
    if (data) setRowId(data.id);
    alert("Configuração de frete salva.");
  };

  if (loading) return <p className="text-sm text-gray-400">Carregando...</p>;

  return (
    <div className="bg-white p-6 rounded-xl shadow-md space-y-4 max-w-xl">
      <div>
        <h3 className="text-lg font-semibold text-gray-800">Configuração de Frete por KM</h3>
        <p className="text-xs text-gray-500 mt-1">
          Usado na aba "Frete": valor final = (KM × valor/km) × (1 + MKP) ÷ (1 − DVV), onde DVV é
          comissão + imposto já cadastrados em Despesas Variáveis.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Valor por KM — Carro (R$)</label>
          <input
            type="text"
            inputMode="decimal"
            value={kmRateCarInput}
            onChange={(e) => {
              const sanitized = sanitizeMoneyInputBR(e.target.value);
              setKmRateCarInput(sanitized);
              setKmRateCar(parseMoneyInputBR(sanitized));
            }}
            onBlur={() => setKmRateCarInput(formatMoneyInputBR(kmRateCar))}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Valor por KM — Moto (R$)</label>
          <input
            type="text"
            inputMode="decimal"
            value={kmRateMotoInput}
            onChange={(e) => {
              const sanitized = sanitizeMoneyInputBR(e.target.value);
              setKmRateMotoInput(sanitized);
              setKmRateMoto(parseMoneyInputBR(sanitized));
            }}
            onBlur={() => setKmRateMotoInput(formatMoneyInputBR(kmRateMoto))}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">MKP (%)</label>
          <input
            type="number"
            min={0}
            step="1"
            value={markupInput}
            onChange={(e) => {
              setMarkupInput(e.target.value);
              setMarkup(Number(e.target.value) || 0);
            }}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-gray-900"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar configuração"}
      </button>
    </div>
  );
};

export default FreightConfigTab;
