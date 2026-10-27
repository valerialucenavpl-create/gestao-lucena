import React, { useEffect, useMemo, useState } from "react";
import { Agendamento } from "../../types";
import { getAgendamentos } from "../../services/agendaServices";
import { formatDateToISO, sortAgendamentosByDateTime } from "../../utils/agenda";

// A partir do meio-dia, o lembrete passa a destacar os compromissos de
// AMANHÃ em vez dos de hoje — nesse horário os de hoje já devem estar
// encaminhados, e é hora de conferir/avisar quem tem algo marcado amanhã.
const HIGHLIGHT_TOMORROW_HOUR = 12;

const AgendaReminderCard: React.FC = () => {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await getAgendamentos();
      if (active) setAgendamentos(res.ok ? res.data : []);
    })();
    return () => {
      active = false;
    };
  }, []);

  const todayISO = formatDateToISO(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowISO = formatDateToISO(tomorrowDate);
  const isAfternoon = new Date().getHours() >= HIGHLIGHT_TOMORROW_HOUR;

  // Mostra TUDO que estiver marcado pra hoje/amanhã, de qualquer categoria
  // (entrega, instalação, medição, manutenção, visita etc.) — só exclui o
  // que já foi concluído ou cancelado.
  const { todayList, tomorrowList } = useMemo(() => {
    const eligible = agendamentos.filter((a) => a.status !== "Cancelado" && a.status !== "Concluído");
    return {
      todayList: sortAgendamentosByDateTime(eligible.filter((a) => a.date === todayISO)),
      tomorrowList: sortAgendamentosByDateTime(eligible.filter((a) => a.date === tomorrowISO)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamentos, todayISO, tomorrowISO]);

  const hasReminders = todayList.length > 0 || tomorrowList.length > 0;
  if (!hasReminders) return null;

  const renderList = (list: Agendamento[], emptyLabel: string) =>
    list.length === 0 ? (
      <p className="mt-1 text-sm text-gray-500">{emptyLabel}</p>
    ) : (
      <ul className="mt-2 space-y-1.5">
        {list.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 font-semibold text-gray-800">
              <span className="truncate">{a.clientName || "Cliente"}</span>
              {a.description && <span className="ml-1 font-normal text-gray-700">— {a.description}</span>}
              <span className="ml-1 font-normal text-gray-500">
                {a.serviceType ? `(${a.serviceType})` : ""}
                {a.time ? ` · ${a.time}` : ""}
              </span>
            </span>
            <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-[11px] font-bold uppercase text-red-700">
              Avisar Cliente
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-5 shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xl">🚨</span>
        <h3 className="text-lg font-extrabold uppercase tracking-wide text-red-700">
          Lembrete da Agenda
        </h3>
        <span className="ml-auto rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase text-white">
          Avisar Cliente
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div
          className={`rounded-xl border p-4 ${
            isAfternoon ? "border-red-200 bg-white/60" : "border-red-400 bg-white ring-2 ring-red-300"
          }`}
        >
          <p className="text-xs font-bold uppercase text-red-600">Hoje {!isAfternoon && "— confira agora"}</p>
          {renderList(todayList, "Nenhum compromisso para hoje.")}
        </div>

        <div
          className={`rounded-xl border p-4 ${
            isAfternoon ? "border-red-400 bg-white ring-2 ring-red-300" : "border-red-200 bg-white/60"
          }`}
        >
          <p className="text-xs font-bold uppercase text-red-600">Amanhã {isAfternoon && "— confira agora"}</p>
          {renderList(tomorrowList, "Nenhum compromisso para amanhã.")}
        </div>
      </div>
    </div>
  );
};

export default AgendaReminderCard;
