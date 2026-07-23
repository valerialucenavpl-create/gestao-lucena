import React, { useState } from "react";
import { Agendamento, AgendaSegment, AgendaServiceType, AgendaStatus } from "../../types";
import { createAgendamento, updateAgendamento } from "../../services/agendaServices";
import { AGENDA_SEGMENTS, AGENDA_SERVICE_TYPES, AGENDA_STATUSES, formatDateToISO } from "../../utils/agenda";

export type AgendaSellerOption = { id: string | number; name: string };
export type AgendaClientOption = { id: string; name: string; phone?: string };

interface AgendaModalProps {
  sellers: AgendaSellerOption[];
  clients: AgendaClientOption[];
  defaultDate?: string;
  editItem?: Agendamento;
  onClose: () => void;
  onCreated: (item: Agendamento) => void;
  onUpdated?: (item: Agendamento) => void;
}

const AgendaModal: React.FC<AgendaModalProps> = ({ sellers, clients, defaultDate, editItem, onClose, onCreated, onUpdated }) => {
  const [clientName, setClientName] = useState(editItem?.clientName ?? "");
  const [phone, setPhone] = useState(editItem?.phone ?? "");
  const [sellerName, setSellerName] = useState(editItem?.sellerName ?? "");
  const [segment, setSegment] = useState<AgendaSegment>(editItem?.segment ?? AGENDA_SEGMENTS[0]);
  const [serviceType, setServiceType] = useState<AgendaServiceType | "">(editItem?.serviceType ?? "");
  const [description, setDescription] = useState(editItem?.description ?? "");
  const [date, setDate] = useState(editItem?.date ?? defaultDate ?? formatDateToISO(new Date()));
  const [time, setTime] = useState(editItem?.time ?? "");
  const [address, setAddress] = useState(editItem?.address ?? "");
  const [status, setStatus] = useState<AgendaStatus>(editItem?.status ?? "Pendente");
  const [saving, setSaving] = useState(false);

  const isEditing = !!editItem;

  const handleClientNameChange = (value: string) => {
    setClientName(value);
    const match = clients.find((c) => c.name.toLowerCase() === value.toLowerCase());
    if (match?.phone && !phone) setPhone(match.phone);
  };

  const handleSave = async () => {
    if (!clientName.trim()) {
      alert("Informe o nome do cliente.");
      return;
    }
    if (!sellerName.trim()) {
      alert("Selecione a vendedora responsável.");
      return;
    }
    if (!segment) {
      alert("Selecione o segmento.");
      return;
    }
    if (!description.trim()) {
      alert("Descreva o serviço.");
      return;
    }
    if (!date) {
      alert("Informe a data agendada.");
      return;
    }

    const matchedClient = clients.find((c) => c.name.toLowerCase() === clientName.trim().toLowerCase());

    setSaving(true);

    let result;
    if (isEditing && editItem) {
      result = await updateAgendamento(editItem.id, {
        clientName: clientName.trim(),
        clientId: matchedClient?.id,
        phone: phone.trim() || undefined,
        sellerName,
        segment,
        serviceType: serviceType || undefined,
        description: description.trim(),
        date,
        time: time || undefined,
        address: address.trim() || undefined,
        status,
      });
    } else {
      result = await createAgendamento({
        clientName: clientName.trim(),
        clientId: matchedClient?.id,
        phone: phone.trim() || undefined,
        sellerName,
        segment,
        serviceType: serviceType || undefined,
        description: description.trim(),
        date,
        time: time || undefined,
        address: address.trim() || undefined,
        status,
      });
    }

    setSaving(false);

    if (!result.ok || !result.data) {
      const detail = (result as any).error?.message;
      alert(`Erro ao salvar agendamento.${detail ? `\n\nDetalhes: ${detail}` : " Tente novamente."}`);
      return;
    }

    if (isEditing && onUpdated) {
      onUpdated(result.data);
    } else {
      onCreated(result.data);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-blue-100 bg-white p-6 shadow-xl">
        <h3 className="mb-6 text-xl font-bold text-slate-800">{isEditing ? "Editar agendamento" : "Novo agendamento"}</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Nome do cliente *</label>
            <input
              list="agenda-clients-list"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              value={clientName}
              onChange={(e) => handleClientNameChange(e.target.value)}
            />
            <datalist id="agenda-clients-list">
              {clients.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Telefone</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Vendedora responsável *</label>
            <select
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
            >
              <option value="">Selecione...</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Segmento *</label>
            <select
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              value={segment}
              onChange={(e) => setSegment(e.target.value as AgendaSegment)}
            >
              {AGENDA_SEGMENTS.map((seg) => (
                <option key={seg} value={seg}>
                  {seg}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Tipo</label>
            <select
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as AgendaServiceType | "")}
            >
              <option value="">Não especificado</option>
              {AGENDA_SERVICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Status</label>
            <select
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              value={status}
              onChange={(e) => setStatus(e.target.value as AgendaStatus)}
            >
              {AGENDA_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Descrição do serviço *</label>
            <textarea
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Data agendada *</label>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Horário</label>
            <input
              type="time"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Endereço / Local</label>
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Endereço onde o serviço será realizado"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-300 px-5 py-2.5 text-slate-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-primary-700 px-5 py-2.5 font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
          >
            {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgendaModal;
