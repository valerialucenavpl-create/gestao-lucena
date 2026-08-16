import React from "react";
import { useSingleRecord } from "../useSingleRecord";

type Ferias = {
  data_prevista: string;
  dias_ferias: number;
  abono_pecuniario: boolean;
};

const DEFAULTS: Ferias = {
  data_prevista: "",
  dias_ferias: 30,
  abono_pecuniario: false,
};

const inputCls = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900";
const labelCls = "block text-sm font-medium text-gray-700";

const addMonths = (dateStr: string, months: number) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d;
};

const formatBR = (d: Date) => d.toLocaleDateString("pt-BR");

const FeriasTab: React.FC<{ funcionarioId: number; admissionDate: string | null }> = ({
  funcionarioId,
  admissionDate,
}) => {
  const { record, setRecord, loading, saving, save } = useSingleRecord<Ferias>(
    "funcionario_ferias",
    funcionarioId,
    DEFAULTS
  );

  // Período aquisitivo: 12 meses a partir da admissão (regra CLT).
  // Período concessivo: os 12 meses seguintes ao fim do aquisitivo — é o
  // prazo que a empresa tem pra conceder as férias antes de virar risco
  // trabalhista (férias em dobro).
  let aquisitivoInicio: Date | null = null;
  let aquisitivoFim: Date | null = null;
  let concessivoFim: Date | null = null;
  let diasParaVencer: number | null = null;

  if (admissionDate) {
    aquisitivoInicio = new Date(admissionDate + "T00:00:00");
    aquisitivoFim = addMonths(admissionDate, 12);
    concessivoFim = addMonths(admissionDate, 24);
    diasParaVencer = Math.ceil((concessivoFim.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="space-y-5">
      {!admissionDate ? (
        <p className="text-sm text-amber-600">
          Cadastre a data de admissão deste funcionário (na tela de edição) para calcular os períodos
          automaticamente.
        </p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2 text-sm">
          <div>
            <span className="font-semibold text-gray-600">Período aquisitivo: </span>
            {formatBR(aquisitivoInicio!)} a {formatBR(aquisitivoFim!)}
          </div>
          <div>
            <span className="font-semibold text-gray-600">Período concessivo (prazo para conceder): </span>
            {formatBR(aquisitivoFim!)} a {formatBR(concessivoFim!)}
          </div>
          {diasParaVencer !== null && diasParaVencer < 0 && (
            <span className="inline-block px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
              VENCIDO — risco de férias em dobro
            </span>
          )}
          {diasParaVencer !== null && diasParaVencer >= 0 && diasParaVencer < 60 && (
            <span className="inline-block px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
              Vence em {diasParaVencer} dias
            </span>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Data prevista das férias</label>
              <input
                type="date"
                value={record.data_prevista || ""}
                onChange={(e) => setRecord({ ...record, data_prevista: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Dias de férias</label>
              <input
                type="number"
                min={1}
                max={30}
                value={record.dias_ferias}
                onChange={(e) => setRecord({ ...record, dias_ferias: Number(e.target.value) || 30 })}
                className={inputCls}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={record.abono_pecuniario}
                  onChange={(e) => setRecord({ ...record, abono_pecuniario: e.target.checked })}
                />
                Vendeu 1/3 (abono pecuniário)?
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={() => save(record)}
            disabled={saving}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar férias"}
          </button>
        </>
      )}
    </div>
  );
};

export default FeriasTab;
