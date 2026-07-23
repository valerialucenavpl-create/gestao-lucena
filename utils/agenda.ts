import type { Agendamento, AgendaSegment, AgendaServiceType, AgendaStatus } from "../types";
import { formatDateToISO, parseDateFlexible, formatDateShort } from "./deliveryEntries";

export { formatDateToISO, parseDateFlexible, formatDateShort };

export const AGENDA_SEGMENTS: AgendaSegment[] = ["Vidro/Esquadria", "Mármore/Granito", "Portão"];

export const AGENDA_SERVICE_TYPES: AgendaServiceType[] = [
  "Medição",
  "Instalação",
  "Entrega",
  "Orçamento",
  "Visita",
  "Manutenção",
];

export const AGENDA_STATUSES: AgendaStatus[] = ["Pendente", "Confirmado", "Concluído", "Cancelado"];

// Cores por segmento — pontinhos do calendário e borda esquerda da lista
export const AGENDA_SEGMENT_DOT_COLORS: Record<AgendaSegment, string> = {
  "Vidro/Esquadria": "bg-teal-500",
  "Mármore/Granito": "bg-amber-500",
  "Portão": "bg-slate-500",
};

export const AGENDA_SEGMENT_BORDER_COLORS: Record<AgendaSegment, string> = {
  "Vidro/Esquadria": "border-teal-500",
  "Mármore/Granito": "border-amber-500",
  "Portão": "border-slate-500",
};

export const AGENDA_SEGMENT_LABEL_COLORS: Record<AgendaSegment, string> = {
  "Vidro/Esquadria": "bg-teal-50 text-teal-700 border-teal-200",
  "Mármore/Granito": "bg-amber-50 text-amber-700 border-amber-200",
  "Portão": "bg-slate-50 text-slate-700 border-slate-200",
};

// Cores por status — badges
export const AGENDA_STATUS_STYLES: Record<AgendaStatus, string> = {
  Pendente: "bg-amber-50 text-amber-700 border-amber-200",
  Confirmado: "bg-blue-50 text-blue-700 border-blue-200",
  "Concluído": "bg-green-50 text-green-700 border-green-200",
  Cancelado: "bg-red-50 text-red-700 border-red-200",
};

// Conta apenas pendentes com data >= hoje (não conta concluídos/cancelados/atrasados)
export const isPendingUpcoming = (item: Agendamento, todayIso: string) =>
  item.status === "Pendente" && item.date >= todayIso;

// Itens que aparecem como "próximos" no card do dashboard
export const isUpcomingActive = (item: Agendamento, todayIso: string) =>
  (item.status === "Pendente" || item.status === "Confirmado") && item.date >= todayIso;

// Compara horários "HH:mm" — itens sem horário vão para o final
export const compareByTime = (a: Agendamento, b: Agendamento) => {
  if (!a.time && !b.time) return 0;
  if (!a.time) return 1;
  if (!b.time) return -1;
  return a.time.localeCompare(b.time);
};

export const sortAgendamentosByDateTime = (items: Agendamento[]) =>
  [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return compareByTime(a, b);
  });

export const formatWhatsAppLink = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const withCountryCode = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountryCode}`;
};
