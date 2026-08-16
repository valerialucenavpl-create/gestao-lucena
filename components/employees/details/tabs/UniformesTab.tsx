import React from "react";
import RecordsEditor from "../RecordsEditor";
import { uploadEmployeeAttachment } from "../storage";

const UniformesTab: React.FC<{ funcionarioId: number }> = ({ funcionarioId }) => {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Entregas de uniforme / EPI</h4>
      <RecordsEditor
        table="uniformes_epis"
        funcionarioId={funcionarioId}
        fields={[
          { key: "data", label: "Data", type: "date" },
          { key: "item", label: "Item", type: "text" },
          { key: "tipo", label: "Tipo", type: "select", options: ["Uniforme", "EPI"], widthClassName: "w-32" },
          { key: "tamanho", label: "Tamanho (opcional)", type: "text", widthClassName: "w-28" },
          { key: "recebimento_confirmado", label: "Recebimento confirmado", type: "checkbox" },
          { key: "anexo_url", label: "Foto do recibo assinado (opcional)", type: "file" },
        ]}
        uploadFile={(file) => uploadEmployeeAttachment(file, funcionarioId, "uniformes")}
        emptyHint="Nenhuma entrega registrada ainda."
      />
    </div>
  );
};

export default UniformesTab;
