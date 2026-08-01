import React, { useEffect, useMemo, useState } from "react";
import { Agendamento, AgendaStatus, User } from "../../types";
import { supabase } from "../../services/supabase";
import { getAgendamentos, updateAgendamento, deleteAgendamento } from "../../services/agendaServices";
import {
  AGENDA_SEGMENTS,
  AGENDA_SEGMENT_DOT_COLORS,
  formatDateToISO,
  sortAgendamentosByDateTime,
} from "../../utils/agenda";
import AgendaCalendar from "./AgendaCalendar";
import AgendaListItem from "./AgendaListItem";
import AgendaModal, { AgendaClientOption, AgendaSellerOption } from "./AgendaModal";

interface AgendaPageProps {
  currentUser: User;
}

const AgendaPage: React.FC<AgendaPageProps> = () => {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [sellers, setSellers] = useState<AgendaSellerOption[]>([]);
  const [clients, setClients] = useState<AgendaClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(formatDateToISO(new Date()));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Agendamento | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [agendaRes, sellersRes] = await Promise.all([
        getAgendamentos(),
        supabase.from("sellers").select("id,name").eq("active", true).order("name", { ascending: true }),
      ]);

      setAgendamentos(agendaRes.ok ? agendaRes.data : []);
      setSellers(Array.isArray(sellersRes.data) ? (sellersRes.data as AgendaSellerOption[]) : []);

      const clientsRes = await supabase.from("clients").select("id,name,phone").is("deleted_at", null);
      setClients(Array.isArray(clientsRes.data) ? (clientsRes.data as AgendaClientOption[]) : []);

      setLoading(false);
    };

    load();
  }, []);

  const itemsForSelectedDate = useMemo(
    () => sortAgendamentosByDateTime(agendamentos.filter((item) => item.date === selectedDate)),
    [agendamentos, selectedDate]
  );

  const handleCreated = (item: Agendamento) => {
    setAgendamentos((prev) => [...prev, item]);
    setSelectedDate(item.date);
    setIsModalOpen(false);
  };

  const handleUpdated = (item: Agendamento) => {
    setAgendamentos((prev) => prev.map((a) => (a.id === item.id ? item : a)));
    setEditingItem(null);
  };

  const handleEdit = (item: Agendamento) => {
    setEditingItem(item);
  };

  const handleChangeStatus = async (id: string, status: AgendaStatus) => {
    const result = await updateAgendamento(id, { status });
    if (!result.ok || !result.data) {
      alert("Erro ao atualizar status. Tente novamente.");
      return;
    }
    setAgendamentos((prev) => prev.map((item) => (item.id === id ? result.data! : item)));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja excluir este agendamento?")) return;
    const result = await deleteAgendamento(id);
    if (!result.ok) {
      alert("Erro ao excluir agendamento. Tente novamente.");
      return;
    }
    setAgendamentos((prev) => prev.filter((item) => item.id !== id));
  };

  const selectedDateLabel = useMemo(() => {
    const d = new Date(`${selectedDate}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? selectedDate
      : d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }, [selectedDate]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Agenda</h2>
          <p className="mt-1 text-sm text-slate-500">
            Medições, instalações, entregas, orçamentos e visitas agendadas com os clientes.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-xl bg-primary-700 px-5 py-2.5 font-semibold text-white transition hover:bg-primary-800"
        >
          + Novo agendamento
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-3">
            <AgendaCalendar
              agendamentos={agendamentos}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-3 text-xs">
              {AGENDA_SEGMENTS.map((seg) => (
                <div key={seg} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${AGENDA_SEGMENT_DOT_COLORS[seg]}`} />
                  <span className="font-medium text-gray-600">{seg}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <h3 className="text-sm font-bold capitalize text-gray-800">{selectedDateLabel}</h3>
              <p className="text-xs text-gray-500">
                {itemsForSelectedDate.length === 0
                  ? "Nenhum agendamento para este dia."
                  : `${itemsForSelectedDate.length} agendamento(s)`}
              </p>
            </div>

            {itemsForSelectedDate.map((item) => (
              <AgendaListItem
                key={item.id}
                item={item}
                onEdit={handleEdit}
                onChangeStatus={handleChangeStatus}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {isModalOpen && (
        <AgendaModal
          sellers={sellers}
          clients={clients}
          defaultDate={selectedDate}
          onClose={() => setIsModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {editingItem && (
        <AgendaModal
          sellers={sellers}
          clients={clients}
          editItem={editingItem}
          onClose={() => setEditingItem(null)}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
};

export default AgendaPage;
