import React from "react";
import { isPeriodUnreliable } from "../../utils/salesReport";

const formatBR = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
};

// Aviso no topo das abas de Relatórios quando o período escolhido começa
// antes da data de início dos dados confiáveis (Configurações).
const UnreliablePeriodBanner: React.FC<{ fromDate: string; reliableStart: string }> = ({ fromDate, reliableStart }) => {
  if (!isPeriodUnreliable(fromDate, reliableStart)) return null;
  return (
    <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-semibold border bg-amber-50 border-amber-300 text-amber-800">
      <span>⚠️</span>
      <span>Período anterior a {formatBR(reliableStart)} — dados não conferidos, use apenas como referência</span>
    </div>
  );
};

export const NotConferredTag: React.FC = () => (
  <span className="block text-[10px] font-semibold uppercase text-gray-400">não conferido</span>
);

export default UnreliablePeriodBanner;
