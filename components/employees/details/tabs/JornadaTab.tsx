import React from "react";
import { useSingleRecord } from "../useSingleRecord";

type Jornada = {
  horario_entrada: string;
  inicio_almoco: string;
  fim_almoco: string;
  horario_saida: string;
  trabalha_sabado: boolean;
  horario_sabado: string;
};

const DEFAULTS: Jornada = {
  horario_entrada: "",
  inicio_almoco: "",
  fim_almoco: "",
  horario_saida: "",
  trabalha_sabado: false,
  horario_sabado: "",
};

const inputCls = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900";
const labelCls = "block text-sm font-medium text-gray-700";

const JornadaTab: React.FC<{ funcionarioId: number }> = ({ funcionarioId }) => {
  const { record, setRecord, loading, saving, save } = useSingleRecord<Jornada>(
    "funcionario_jornada",
    funcionarioId,
    DEFAULTS
  );

  if (loading) return <p className="text-sm text-gray-400">Carregando...</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className={labelCls}>Horário de entrada</label>
          <input
            type="time"
            value={record.horario_entrada || ""}
            onChange={(e) => setRecord({ ...record, horario_entrada: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Início do almoço</label>
          <input
            type="time"
            value={record.inicio_almoco || ""}
            onChange={(e) => setRecord({ ...record, inicio_almoco: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Fim do almoço</label>
          <input
            type="time"
            value={record.fim_almoco || ""}
            onChange={(e) => setRecord({ ...record, fim_almoco: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Horário de saída</label>
          <input
            type="time"
            value={record.horario_saida || ""}
            onChange={(e) => setRecord({ ...record, horario_saida: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={record.trabalha_sabado}
            onChange={(e) => setRecord({ ...record, trabalha_sabado: e.target.checked })}
          />
          Trabalha aos sábados?
        </label>
        {record.trabalha_sabado && (
          <div className="mt-2 max-w-xs">
            <label className={labelCls}>Horário de sábado</label>
            <input
              type="text"
              placeholder="Ex: 08:00 às 12:00"
              value={record.horario_sabado || ""}
              onChange={(e) => setRecord({ ...record, horario_sabado: e.target.value })}
              className={inputCls}
            />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => save(record)}
        disabled={saving}
        className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar jornada"}
      </button>
    </div>
  );
};

export default JornadaTab;
