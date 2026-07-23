import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../icons/Icon";
import { Agendamento } from "../../types";
import { getAgendamentos } from "../../services/agendaServices";
import {
  AGENDA_SEGMENT_DOT_COLORS,
  formatDateToISO,
  isPendingUpcoming,
  isUpcomingActive,
  sortAgendamentosByDateTime,
} from "../../utils/agenda";
import AgendaListItem from "./AgendaListItem";

const AgendaCard: React.FC = () => {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);

  useEffect(() => {
    const load = async () => {
      const res = await getAgendamentos();
      setAgendamentos(res.ok ? res.data : []);
      setLoading(false);
    };
    load();
  }, []);

  const todayIso = formatDateToISO(new Date());

  const pendingCount = useMemo(
    () => agendamentos.filter((item) => isPendingUpcoming(item, todayIso)).length,
    [agendamentos, todayIso]
  );

  const upcoming = useMemo(
    () =>
      sortAgendamentosByDateTime(agendamentos.filter((item) => isUpcomingActive(item, todayIso))).slice(0, 4),
    [agendamentos, todayIso]
  );

  const expandedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return formatDateToISO(d);
  }, [dayOffset]);

  const expandedDateLabel = useMemo(() => {
    const d = new Date(`${expandedDate}T00:00:00`);
    return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  }, [expandedDate]);

  const itemsForExpandedDate = useMemo(
    () => sortAgendamentosByDateTime(agendamentos.filter((item) => item.date === expandedDate)),
    [agendamentos, expandedDate]
  );

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white">Agenda</h3>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
            {pendingCount} pendente{pendingCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        </div>
      ) : (
        <>
          {upcoming.length === 0 ? (
            <p className="py-3 text-sm text-gray-400 dark:text-gray-500">Nenhum agendamento próximo.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {upcoming.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${AGENDA_SEGMENT_DOT_COLORS[item.segment]}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                        {item.clientName}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {item.segment}
                        {item.serviceType ? ` · ${item.serviceType}` : ""} — {item.description}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
                    <p>{new Date(`${item.date}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>
                    {item.time && <p>{item.time}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="mt-2 flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800"
          >
            Ver agenda do dia
            <Icon className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}>
              <path d="M9 18l6-6-6-6" />
            </Icon>
          </button>

          {expanded && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDayOffset((d) => d - 1)}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                  aria-label="Dia anterior"
                >
                  ‹
                </button>
                <p className="text-sm font-semibold capitalize text-gray-700 dark:text-gray-200">
                  {expandedDateLabel}
                </p>
                <button
                  type="button"
                  onClick={() => setDayOffset((d) => d + 1)}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                  aria-label="Próximo dia"
                >
                  ›
                </button>
              </div>

              {itemsForExpandedDate.length === 0 ? (
                <p className="py-2 text-center text-sm text-gray-400 dark:text-gray-500">
                  Nenhum agendamento para este dia.
                </p>
              ) : (
                itemsForExpandedDate.map((item) => <AgendaListItem key={item.id} item={item} compact />)
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AgendaCard;
