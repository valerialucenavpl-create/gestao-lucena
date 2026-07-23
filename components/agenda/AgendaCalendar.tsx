import React, { useMemo, useState } from "react";
import { Agendamento } from "../../types";
import { AGENDA_SEGMENT_DOT_COLORS, formatDateToISO } from "../../utils/agenda";

interface AgendaCalendarProps {
  agendamentos: Agendamento[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const AgendaCalendar: React.FC<AgendaCalendarProps> = ({ agendamentos, selectedDate, onSelectDate }) => {
  const initial = useMemo(() => {
    const d = new Date(`${selectedDate}T00:00:00`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [selectedDate]);

  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const todayIso = formatDateToISO(new Date());

  const segmentsByDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    agendamentos.forEach((item) => {
      if (item.status === "Cancelado") return;
      if (!map.has(item.date)) map.set(item.date, new Set());
      map.get(item.date)!.add(item.segment);
    });
    return map;
  }, [agendamentos]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const startWeekday = firstDay.getDay();

    const result: { iso: string | null; day: number | null }[] = [];

    for (let i = 0; i < startWeekday; i++) {
      result.push({ iso: null, day: null });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = formatDateToISO(new Date(viewYear, viewMonth, day));
      result.push({ iso, day });
    }

    while (result.length % 7 !== 0) {
      result.push({ iso: null, day: null });
    }

    return result;
  }, [viewYear, viewMonth]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrevMonth}
          className="rounded-lg border border-gray-200 px-2 py-1 text-gray-500 hover:bg-gray-50"
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <h4 className="text-base font-bold text-gray-800">
          {MONTH_LABELS[viewMonth]} {viewYear}
        </h4>
        <button
          type="button"
          onClick={goNextMonth}
          className="rounded-lg border border-gray-200 px-2 py-1 text-gray-500 hover:bg-gray-50"
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-400">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell.iso) return <div key={idx} className="aspect-square" />;

          const isToday = cell.iso === todayIso;
          const isSelected = cell.iso === selectedDate;
          const segments = Array.from(segmentsByDate.get(cell.iso) || []);

          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onSelectDate(cell.iso!)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition ${
                isSelected
                  ? "border-primary-600 bg-primary-600 text-white font-bold"
                  : isToday
                  ? "border-primary-400 bg-primary-50 text-primary-700 font-semibold"
                  : "border-transparent text-gray-700 hover:bg-gray-50"
              }`}
            >
              {cell.day}
              {segments.length > 0 && (
                <span className="mt-0.5 flex gap-0.5">
                  {segments.map((seg) => (
                    <span
                      key={seg}
                      className={`h-1.5 w-1.5 rounded-full ${AGENDA_SEGMENT_DOT_COLORS[seg as keyof typeof AGENDA_SEGMENT_DOT_COLORS]} ${
                        isSelected ? "ring-1 ring-white" : ""
                      }`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AgendaCalendar;
