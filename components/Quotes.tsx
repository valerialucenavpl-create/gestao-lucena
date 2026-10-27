import React, { useMemo, useState } from "react";
import { Icon } from "./icons/Icon";
import { Quote, User, View } from "../types";

interface QuotesProps {
  quotes?: Quote[]; // <- pode vir undefined em runtime
  currentUser?: User | null;
  setActiveView: (view: View, id?: string) => void;
  onDeleteQuote?: (id: string) => void;
  onDuplicateQuote?: (quote: Quote) => void;
  onUpdateQuote?: (u: any) => void | Promise<any>;
}

const fmtMoney = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Remove acentos pra "joao" achar "João" — mesmo padrão usado na busca de
// cliente do orçamento (utils/deliveryEntries.normalizeText).
const normalizeSearch = (v: string) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Datas de orçamento são salvas como meia-noite UTC (dia "puro", sem hora)
// — ler com getDate()/getMonth() locais volta um dia em fusos atrás de UTC
// (Brasil inteiro). Ler os componentes UTC exibe o dia exatamente como foi
// salvo, mesmo padrão já usado no filtro de período de Vendas.
const fmtQuoteDate = (value: string | undefined | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

// Filtros da lista guardados fora do componente — ele desmonta ao abrir um
// orçamento, e sem isso "Voltar" reabria a lista sem a busca digitada (e a
// rolagem restaurada pelo App caía num ponto diferente da lista).
const savedFilters = { search: "", showOnlyLegacy: false };

// Motivo mais recente registrado ao marcar "Não fechou".
const getNotClosedReason = (q: Quote): string | null => {
  const entries = (q.contactLog || []).filter((e) => e.kind === "not_closed");
  if (entries.length === 0) return null;
  const last = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  return last.text.replace(/^Não fechou:\s*/, "");
};

// Salvar não pode ficar "pendurado" pra sempre: se o banco não responder
// (rede instável, sessão renovando depois de a aba ficar parada) ou a chamada
// estourar uma exceção, devolve erro em vez de travar o botão em "Salvando…".
const SAVE_TIMEOUT_MS = 20000;
const saveWithTimeout = async (fn: () => any): Promise<{ ok: boolean; error?: any }> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<{ ok: boolean; error: any }>((resolve) => {
      timer = setTimeout(
        () => resolve({ ok: false, error: { message: "o servidor demorou demais para responder. Verifique a internet, recarregue a página (F5) e tente de novo." } }),
        SAVE_TIMEOUT_MS
      );
    });
    const result: any = await Promise.race([Promise.resolve(fn()), timeout]);
    return result && result.ok === false ? result : { ok: true };
  } catch (err: any) {
    console.error("Erro ao salvar orçamento:", err);
    return { ok: false, error: { message: err?.message ?? String(err) } };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const Quotes: React.FC<QuotesProps> = ({
  quotes,
  currentUser,
  setActiveView,
  onDeleteQuote,
  onDuplicateQuote,
  onUpdateQuote,
}) => {
  // garante sempre array
  const safeQuotes = useMemo(() => (Array.isArray(quotes) ? quotes : []), [quotes]);
  const [search, setSearchState] = useState(savedFilters.search);
  const [showOnlyLegacy, setShowOnlyLegacyState] = useState(savedFilters.showOnlyLegacy);
  const setSearch = (v: string) => { savedFilters.search = v; setSearchState(v); };
  const setShowOnlyLegacy = (v: boolean | ((prev: boolean) => boolean)) =>
    setShowOnlyLegacyState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      savedFilters.showOnlyLegacy = next;
      return next;
    });
  const legacyCount = useMemo(() => safeQuotes.filter((q) => q.originLegacy).length, [safeQuotes]);
  const isAdmin = currentUser?.role === "Admin";
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [contactModalQuote, setContactModalQuote] = useState<Quote | null>(null);
  const [contactText, setContactText] = useState("");
  const [contactNextDate, setContactNextDate] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const [notClosedModalQuote, setNotClosedModalQuote] = useState<Quote | null>(null);
  const [notClosedReason, setNotClosedReason] = useState("");
  const [savingNotClosed, setSavingNotClosed] = useState(false);

  const toggleNotClosed = async (q: Quote) => {
    setMenuOpenId(null);
    if (!onUpdateQuote) return;
    if (q.notClosed) {
      const r = await saveWithTimeout(() => onUpdateQuote({ id: q.id, notClosed: false }));
      if (!r.ok) alert("Não foi possível salvar: " + (r.error?.message ?? "erro desconhecido"));
      return;
    }
    // Marcar "Não fechou" pede o motivo antes de salvar.
    setNotClosedReason("");
    setNotClosedModalQuote(q);
  };

  const handleSaveNotClosed = async () => {
    if (!notClosedModalQuote || !onUpdateQuote) return;
    const motivo = notClosedReason.trim();
    if (!motivo) return;
    setSavingNotClosed(true);
    const result = await saveWithTimeout(() => onUpdateQuote({
      id: notClosedModalQuote.id,
      notClosed: true,
      contactLog: [
        ...(notClosedModalQuote.contactLog || []),
        {
          id: `nc${Date.now()}`,
          text: `Não fechou: ${motivo}`,
          date: new Date().toISOString(),
          author: currentUser?.name,
          kind: "not_closed",
        },
      ],
    }));
    setSavingNotClosed(false);
    if (!result.ok) {
      alert("Não foi possível salvar: " + (result.error?.message ?? "erro desconhecido"));
      return;
    }
    setNotClosedModalQuote(null);
  };

  const openContactModal = (q: Quote) => {
    setMenuOpenId(null);
    setContactModalQuote(q);
    setContactText("");
    setContactNextDate(q.nextContactDate || "");
  };

  const handleAddContact = async () => {
    if (!contactModalQuote || !onUpdateQuote) return;
    if (!contactText.trim() && !contactNextDate) return;
    setSavingContact(true);

    const nextLog = contactText.trim()
      ? [
          ...(contactModalQuote.contactLog || []),
          {
            id: `c${Date.now()}`,
            text: contactText.trim(),
            date: new Date().toISOString(),
            author: currentUser?.name,
          },
        ]
      : contactModalQuote.contactLog || [];

    const result = await saveWithTimeout(() => onUpdateQuote({
      id: contactModalQuote.id,
      contactLog: nextLog,
      nextContactDate: contactNextDate || null,
    }));
    setSavingContact(false);
    if (!result.ok) {
      alert("Não foi possível salvar: " + (result.error?.message ?? "erro desconhecido"));
      return;
    }
    setContactModalQuote({ ...contactModalQuote, contactLog: nextLog, nextContactDate: contactNextDate });
    setContactText("");
  };

  // Só Admin ou quem escreveu o registro pode excluí-lo.
  const canDeleteContact = (entry: { author?: string }) =>
    currentUser?.role === "Admin" || (!!entry.author && entry.author === currentUser?.name);

  const handleDeleteContact = async (entryId: string) => {
    if (!contactModalQuote || !onUpdateQuote) return;
    if (!window.confirm("Excluir este registro de contato?")) return;
    setSavingContact(true);
    const nextLog = (contactModalQuote.contactLog || []).filter((e) => e.id !== entryId);
    const result = await saveWithTimeout(() => onUpdateQuote({ id: contactModalQuote.id, contactLog: nextLog }));
    setSavingContact(false);
    if (!result.ok) {
      alert("Não foi possível excluir: " + (result.error?.message ?? "erro desconhecido"));
      return;
    }
    setContactModalQuote({ ...contactModalQuote, contactLog: nextLog });
  };
  // Mês do resumo — 0 = mês atual, -1 = anterior, etc. Só afeta o card de
  // resumo, não a lista de orçamentos abaixo.
  const [summaryMonthOffset, setSummaryMonthOffset] = useState(0);

  // Resumo do mês por vendedora — só Admin vê. "Aberto" = ainda Pendente
  // (cliente não decidiu); "Fechado" = já Aprovado (virou venda) — mesmo
  // padrão de leitura de data em UTC usado no resto da tela, pra não bater
  // um dia errado por fuso.
  const monthStats = useMemo(() => {
    const base = new Date();
    base.setUTCMonth(base.getUTCMonth() + summaryMonthOffset);
    const now = base;
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();

    const monthQuotes = safeQuotes.filter((q) => {
      if (!q.date) return false;
      const d = new Date(q.date);
      return !isNaN(d.getTime()) && d.getUTCFullYear() === y && d.getUTCMonth() === m;
    });

    const bySalesperson = new Map<string, { open: number; closed: number }>();
    let totalOpen = 0;

    monthQuotes.forEach((q) => {
      const name = q.salesperson?.trim() || "Sem vendedora";
      const entry = bySalesperson.get(name) || { open: 0, closed: 0 };
      const value = Number(q.totalPrice || 0);
      if (q.status === "Aprovado") {
        entry.closed += value;
      } else if (q.status === "Pendente") {
        entry.open += value;
        totalOpen += value;
      }
      bySalesperson.set(name, entry);
    });

    return {
      bySalesperson: Array.from(bySalesperson.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR")),
      totalOpen,
      totalCount: monthQuotes.length,
      monthLabel: now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    };
  }, [safeQuotes, summaryMonthOffset]);

  // Orçamento aprovado já virou venda (some pra tela de Vendas) — não faz
  // mais sentido continuar aparecendo aqui como se ainda fosse orçamento.
  const visibleQuotes = useMemo(
    () =>
      safeQuotes
        .filter((q) => (showOnlyLegacy ? q.originLegacy : q.status !== "Aprovado"))
        .sort((a, b) => (b.quoteNumber ?? 0) - (a.quoteNumber ?? 0)),
    [safeQuotes, showOnlyLegacy]
  );

  const filteredQuotes = useMemo(() => {
    const term = normalizeSearch(search);
    if (!term) return visibleQuotes;
    return visibleQuotes.filter((q) => {
      const haystack = [
        q.customerName,
        q.salesperson,
        q.status,
        q.quoteNumber != null ? String(q.quoteNumber) : "",
      ]
        .map(normalizeSearch)
        .join(" ");
      return haystack.includes(term);
    });
  }, [visibleQuotes, search]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-md">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-800">Orçamentos</h1>
          {legacyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowOnlyLegacy((v) => !v)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                showOnlyLegacy ? "bg-amber-600 text-white border-amber-600" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
              }`}
              title="Vendas cadastradas manualmente a partir do sistema antigo"
            >
              Sistema antigo: {legacyCount}
            </button>
          )}
        </div>

        <button
          onClick={() => setActiveView("newQuote")}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Icon className="w-5 h-5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </Icon>
          Novo Orçamento
        </button>
      </div>

      {isAdmin && (
        <div className="mb-5 rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                <Icon className="w-4 h-4">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                </Icon>
              </span>
              <h2 className="text-sm font-bold capitalize text-gray-800">Resumo de {monthStats.monthLabel}</h2>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setSummaryMonthOffset((o) => o - 1)}
                title="Mês anterior"
                className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <Icon className="w-3.5 h-3.5">
                  <polyline points="15 18 9 12 15 6" />
                </Icon>
              </button>
              {summaryMonthOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setSummaryMonthOffset(0)}
                  className="px-1.5 text-[10px] font-semibold text-gray-400 hover:text-gray-600"
                  title="Voltar pro mês atual"
                >
                  hoje
                </button>
              )}
              <button
                type="button"
                onClick={() => setSummaryMonthOffset((o) => Math.min(0, o + 1))}
                disabled={summaryMonthOffset >= 0}
                title="Próximo mês"
                className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Icon className="w-3.5 h-3.5">
                  <polyline points="9 18 15 12 9 6" />
                </Icon>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Total em aberto</p>
              <p className="text-lg font-extrabold text-amber-700">R$ {fmtMoney(monthStats.totalOpen)}</p>
            </div>
            <div className="rounded-xl border border-primary-100 bg-primary-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-primary-600">Orçamentos salvos no mês</p>
              <p className="text-lg font-extrabold text-primary-700">{monthStats.totalCount}</p>
            </div>
          </div>

          {monthStats.bySalesperson.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum orçamento neste mês ainda.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2 text-[10px] font-semibold text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Em aberto
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Fechado
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {monthStats.bySalesperson.map(([name, s]) => {
                  const initials = name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase())
                    .join("");
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-2.5 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 shadow-sm"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-[10px] font-bold text-white">
                        {initials || "?"}
                      </span>
                      <span className="text-xs font-semibold text-gray-700">{name}</span>
                      <span className="h-3 w-px bg-gray-200" />
                      <span className="text-[11px] font-bold text-amber-600">R$ {fmtMoney(s.open)}</span>
                      <span className="text-[11px] font-bold text-emerald-600">R$ {fmtMoney(s.closed)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div className="mb-4 relative max-w-sm">
        <Icon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </Icon>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, número, vendedor ou status..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-gray-700">
          <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-3">N°</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Vendedor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3 text-center">Ações</th>
            </tr>
          </thead>

          <tbody>
            {filteredQuotes.map((q) => (
              <tr
                key={q.id}
                className={`border-b transition-colors ${
                  q.notClosed ? "bg-red-50 hover:bg-red-100" : "hover:bg-gray-50"
                }`}
                style={{ position: "relative", zIndex: menuOpenId === q.id ? 20 : undefined }}
              >
                <td className="px-4 py-3 font-medium">N° {q.quoteNumber ?? "—"}</td>
                <td className="px-4 py-3">
                  {q.customerName}
                  {q.notClosed && (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                      Não fechou
                    </span>
                  )}
                  {q.notClosed && getNotClosedReason(q) && (
                    <p className="mt-0.5 text-xs text-red-600">Motivo: {getNotClosedReason(q)}</p>
                  )}
                  {(q.contactLog?.length ?? 0) > 0 && (
                    <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                      {q.contactLog!.length} contato{q.contactLog!.length > 1 ? "s" : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{fmtQuoteDate(q.date)}</td>
                <td className="px-4 py-3">{q.salesperson}</td>
                <td className="px-4 py-3">{q.status}</td>
                <td className="px-4 py-3">
                  R$ {Number(q.totalPrice ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setActiveView("quoteDetail", q.id)}
                      className="text-blue-600 hover:underline"
                    >
                      Abrir
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuOpenId((prev) => (prev === q.id ? null : q.id))}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 font-bold text-gray-600 hover:bg-gray-50"
                        title="Ações"
                      >
                        ⋮
                      </button>
                      {menuOpenId === q.id && (
                        <div className="absolute right-0 z-30 mt-2 w-48 rounded-lg border border-gray-200 bg-white text-left shadow-lg">
                          {onDuplicateQuote && (
                            <button
                              onClick={() => {
                                setMenuOpenId(null);
                                onDuplicateQuote(q);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                            >
                              Duplicar
                            </button>
                          )}
                          {onUpdateQuote && (
                            <button
                              onClick={() => toggleNotClosed(q)}
                              className="w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                            >
                              {q.notClosed ? "Desmarcar \"Não Fechou\"" : "Não Fechou"}
                            </button>
                          )}
                          {onUpdateQuote && (
                            <button
                              onClick={() => openContactModal(q)}
                              className="w-full px-3 py-2 text-left text-sm text-sky-700 hover:bg-sky-50"
                            >
                              Registrar contato
                            </button>
                          )}
                          {onDeleteQuote && (
                            <button
                              onClick={() => {
                                setMenuOpenId(null);
                                if (window.confirm("Deseja excluir este orçamento?")) {
                                  onDeleteQuote(q.id);
                                }
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}

            {filteredQuotes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  {search ? "Nenhum orçamento encontrado para essa busca." : "Nenhum orçamento cadastrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {contactModalQuote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setContactModalQuote(null)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-gray-800">
                Contatos — N° {contactModalQuote.quoteNumber ?? "—"} · {contactModalQuote.customerName}
              </h4>
              <button
                type="button"
                onClick={() => setContactModalQuote(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto">
              {(contactModalQuote.contactLog?.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-400">Nenhum contato registrado ainda.</p>
              ) : (
                [...(contactModalQuote.contactLog || [])]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                      <p className="text-gray-700">{entry.text}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-gray-400">
                          {new Date(entry.date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          {entry.author ? ` · ${entry.author}` : ""}
                        </p>
                        {canDeleteContact(entry) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteContact(entry.id)}
                            disabled={savingContact}
                            className="text-[11px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Novo registro</label>
              <textarea
                value={contactText}
                onChange={(e) => setContactText(e.target.value)}
                placeholder="Ex.: Mandei mensagem no WhatsApp pra retomar o orçamento."
                rows={3}
                className="mt-1 w-full rounded border p-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Data para novo contato</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="date"
                  value={contactNextDate}
                  onChange={(e) => setContactNextDate(e.target.value)}
                  className="w-full rounded border p-2 text-sm"
                />
                {contactNextDate && (
                  <button
                    type="button"
                    onClick={() => setContactNextDate("")}
                    className="whitespace-nowrap text-xs text-gray-400 hover:text-gray-600"
                  >
                    limpar
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                Aparece como lembrete no Dashboard da vendedora até essa data.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setContactModalQuote(null)}
                className="rounded border border-gray-300 px-4 py-2 text-gray-700"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleAddContact}
                disabled={savingContact || (!contactText.trim() && !contactNextDate)}
                className="rounded bg-primary-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {savingContact ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {notClosedModalQuote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setNotClosedModalQuote(null)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-gray-800">
                Não fechou — N° {notClosedModalQuote.quoteNumber ?? "—"} · {notClosedModalQuote.customerName}
              </h4>
              <button
                type="button"
                onClick={() => setNotClosedModalQuote(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Motivo</label>
              <textarea
                value={notClosedReason}
                onChange={(e) => setNotClosedReason(e.target.value)}
                placeholder="Ex.: Achou mais barato em outro lugar / desistiu da obra."
                rows={3}
                autoFocus
                className="mt-1 w-full rounded border p-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Fica salvo também no histórico de contatos do orçamento.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNotClosedModalQuote(null)}
                className="rounded border border-gray-300 px-4 py-2 text-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNotClosed}
                disabled={savingNotClosed || !notClosedReason.trim()}
                className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {savingNotClosed ? "Salvando…" : "Marcar como Não fechou"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Quotes;
