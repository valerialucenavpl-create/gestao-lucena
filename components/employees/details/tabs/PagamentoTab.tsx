import React from "react";
import { useSingleRecord } from "../useSingleRecord";
import RecordsEditor from "../RecordsEditor";

type Pagamento = {
  dia_pagamento: number | "";
  forma_pagamento: string;
  banco: string;
  chave_pix: string;
  agencia: string;
  conta: string;
};

const DEFAULTS: Pagamento = {
  dia_pagamento: "",
  forma_pagamento: "PIX",
  banco: "",
  chave_pix: "",
  agencia: "",
  conta: "",
};

const inputCls = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-gray-900";
const labelCls = "block text-sm font-medium text-gray-700";

const PagamentoTab: React.FC<{ funcionarioId: number; baseSalary: number }> = ({ funcionarioId, baseSalary }) => {
  const { record, setRecord, loading, saving, save } = useSingleRecord<Pagamento>(
    "funcionario_pagamento",
    funcionarioId,
    DEFAULTS
  );

  return (
    <div className="space-y-8">
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Dados de pagamento</h4>
        {loading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Salário base</label>
                <div className="mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-700">
                  R$ {baseSalary.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <label className={labelCls}>Dia do pagamento</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={record.dia_pagamento}
                  onChange={(e) => setRecord({ ...record, dia_pagamento: Number(e.target.value) || "" })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Forma de pagamento</label>
                <select
                  value={record.forma_pagamento}
                  onChange={(e) => setRecord({ ...record, forma_pagamento: e.target.value })}
                  className={inputCls}
                >
                  <option value="PIX">PIX</option>
                  <option value="Depósito em conta">Depósito em conta</option>
                </select>
              </div>

              {record.forma_pagamento === "PIX" ? (
                <div>
                  <label className={labelCls}>Chave PIX (opcional)</label>
                  <input
                    type="text"
                    value={record.chave_pix}
                    onChange={(e) => setRecord({ ...record, chave_pix: e.target.value })}
                    className={inputCls}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className={labelCls}>Agência (opcional)</label>
                    <input
                      type="text"
                      value={record.agencia}
                      onChange={(e) => setRecord({ ...record, agencia: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Conta (opcional)</label>
                    <input
                      type="text"
                      value={record.conta}
                      onChange={(e) => setRecord({ ...record, conta: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </>
              )}
              <div>
                <label className={labelCls}>Banco (opcional)</label>
                <input
                  type="text"
                  value={record.banco}
                  onChange={(e) => setRecord({ ...record, banco: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => save(record)}
              disabled={saving}
              className="mt-4 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar dados de pagamento"}
            </button>
          </>
        )}
      </div>

      <div className="border-t pt-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Vales</h4>
        <RecordsEditor
          table="vales"
          funcionarioId={funcionarioId}
          fields={[
            { key: "data", label: "Data", type: "date" },
            { key: "valor", label: "Valor (R$)", type: "money" },
            { key: "descricao", label: "Descrição (opcional)", type: "text" },
            { key: "mes_referencia", label: "Mês ref. (AAAA-MM)", type: "text", widthClassName: "w-32" },
          ]}
          totalsField="valor"
          totalsLabel="Total de vales"
          scopeTotalsToCurrentMonth
          emptyHint="Nenhum vale lançado ainda."
        />
      </div>

      <div className="border-t pt-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">
          Horas extras
          <span className="block text-xs font-normal text-gray-400 mt-0.5">
            Hora extra é sempre paga — a empresa não usa banco de horas.
          </span>
        </h4>
        <RecordsEditor
          table="horas_extras"
          funcionarioId={funcionarioId}
          fields={[
            { key: "data", label: "Data", type: "date" },
            { key: "quantidade_horas", label: "Qtd. horas", type: "number" },
            { key: "valor_pago", label: "Valor pago (R$)", type: "money" },
            { key: "mes_referencia", label: "Mês ref. (AAAA-MM)", type: "text", widthClassName: "w-32" },
          ]}
          totalsField="valor_pago"
          totalsLabel="Total pago em horas extras"
          scopeTotalsToCurrentMonth
          emptyHint="Nenhuma hora extra lançada ainda."
        />
      </div>
    </div>
  );
};

export default PagamentoTab;
