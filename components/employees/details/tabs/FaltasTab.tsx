import React, { useEffect, useState } from "react";
import { supabase } from "../../../../services/supabase";
import RecordsEditor from "../RecordsEditor";
import { uploadEmployeeAttachment } from "../storage";

type FaltaRow = { data: string; tipo: string };

const FaltasTab: React.FC<{ funcionarioId: number }> = ({ funcionarioId }) => {
  const [counts, setCounts] = useState<{ justificadas: number; injustificadas: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      const currentYear = new Date().getFullYear();
      const { data, error } = await supabase
        .from("faltas")
        .select("data, tipo")
        .eq("funcionario_id", funcionarioId)
        .gte("data", `${currentYear}-01-01`)
        .lte("data", `${currentYear}-12-31`);
      if (error) {
        console.error(error);
        return;
      }
      const rows = (data as FaltaRow[]) || [];
      setCounts({
        justificadas: rows.filter((r) => r.tipo === "Justificada").length,
        injustificadas: rows.filter((r) => r.tipo === "Injustificada").length,
      });
    })();
  }, [funcionarioId, reloadKey]);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700">Faltas</h4>
          {counts && (
            <span className="text-xs font-bold text-gray-600">
              {new Date().getFullYear()}: {counts.justificadas} justificadas · {counts.injustificadas}{" "}
              injustificadas
            </span>
          )}
        </div>
        <RecordsEditor
          table="faltas"
          funcionarioId={funcionarioId}
          fields={[
            { key: "data", label: "Data", type: "date" },
            {
              key: "tipo",
              label: "Tipo",
              type: "select",
              options: ["Justificada", "Injustificada"],
              widthClassName: "w-40",
            },
            { key: "observacao", label: "Observação (opcional)", type: "text" },
            { key: "anexo_url", label: "Atestado (opcional)", type: "file" },
          ]}
          uploadFile={(file) => uploadEmployeeAttachment(file, funcionarioId, "atestados")}
          onChange={() => setReloadKey((k) => k + 1)}
          emptyHint="Nenhuma falta lançada ainda."
        />
      </div>

      <div className="border-t pt-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Advertências</h4>
        <RecordsEditor
          table="advertencias"
          funcionarioId={funcionarioId}
          fields={[
            { key: "data", label: "Data", type: "date" },
            { key: "motivo", label: "Motivo", type: "text" },
            { key: "anexo_url", label: "Documento assinado (opcional)", type: "file" },
          ]}
          uploadFile={(file) => uploadEmployeeAttachment(file, funcionarioId, "advertencias")}
          emptyHint="Nenhuma advertência registrada ainda."
        />
      </div>
    </div>
  );
};

export default FaltasTab;
