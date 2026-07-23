import React, { useState } from "react";
import { Agendamento, AgendaStatus } from "../../types";
import {
  AGENDA_SEGMENT_BORDER_COLORS,
  AGENDA_SEGMENT_LABEL_COLORS,
  AGENDA_STATUSES,
  AGENDA_STATUS_STYLES,
  formatWhatsAppLink,
} from "../../utils/agenda";

interface AgendaListItemProps {
  item: Agendamento;
  compact?: boolean;
  onChangeStatus?: (id: string, status: AgendaStatus) => void;
  onDelete?: (id: string) => void;
  onEdit?: (item: Agendamento) => void;
}

const AgendaListItem: React.FC<AgendaListItemProps> = ({ item, compact, onChangeStatus, onDelete, onEdit }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isConcluido = item.status === "Concluído";
  const whatsappLink = item.phone ? formatWhatsAppLink(item.phone) : "";

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-3 shadow-sm border-l-4 ${
        AGENDA_SEGMENT_BORDER_COLORS[item.segment]
      } ${isConcluido ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {item.time && (
            <span className="text-sm font-semibold text-gray-700">{item.time}</span>
          )}
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${AGENDA_STATUS_STYLES[item.status]}`}
          >
            {item.status}
          </span>
        </div>

        {(onChangeStatus || onDelete || onEdit) && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="h-7 w-7 rounded-full border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-50"
              title="Ações"
            >
              ⋮
            </button>

            {menuOpen && (
              <div className="absolute right-0 z-10 mt-2 w-44 rounded-lg border border-gray-200 bg-white shadow-lg">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(item);
                      setMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Editar
                  </button>
                )}
                {onEdit && (onChangeStatus || onDelete) && (
                  <div className="border-t border-gray-100" />
                )}
                {onChangeStatus &&
                  AGENDA_STATUSES.filter((status) => status !== item.status).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        onChangeStatus(item.id, status);
                        setMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Marcar como {status}
                    </button>
                  ))}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(item.id);
                      setMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                  >
                    Excluir
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-1 font-bold text-gray-800">{item.clientName}</p>
      <p className="text-sm text-gray-600">{item.description}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full border px-2 py-0.5 font-semibold ${AGENDA_SEGMENT_LABEL_COLORS[item.segment]}`}>
          {item.segment}
          {item.serviceType ? ` · ${item.serviceType}` : ""}
        </span>
      </div>

      {!compact && (
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          {item.sellerName && <p>Vendedora: {item.sellerName}</p>}
          {item.phone && (
            <p>
              Telefone:{" "}
              {whatsappLink ? (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-green-600 hover:underline"
                >
                  {item.phone}
                </a>
              ) : (
                item.phone
              )}
            </p>
          )}
          {item.address && <p>Endereço: {item.address}</p>}
        </div>
      )}
    </div>
  );
};

export default AgendaListItem;
