// src/components/AccountStatementModal.tsx
// Extrato de UMA conta (Banco Cora, BB, Caixa físico...) mês a mês — aberto
// ao clicar no card de saldo da conta no Caixa. Serve pra conferir os
// lançamentos do sistema contra o extrato real do banco: mostra saldo
// anterior, cada lançamento com o saldo acumulado depois dele e o saldo no
// fim do mês (que deve bater com o saldo do banco naquele dia).
import React, { useMemo, useState } from "react";
import { BankAccount, CashFlowEntry } from "../types";

type Props = {
  account: BankAccount;
  cashFlow: CashFlowEntry[];
  onClose: () => void;
};

const ymdToTime = (ymd?: string) => {
  if (!ymd) return NaN;
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};

const formatBR = (ymd?: string) => {
  if (!ymd) return "-";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
};

const money = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const signed = (e: CashFlowEntry) => (e.type === "Saída" ? -1 : 1) * Number(e.amount || 0);

// Marcação "conferido" é só uma ajuda visual de quem está conferindo, neste
// navegador — não vai pro banco.
const CHECK_KEY = "caixa-extrato-conferidos";
const loadChecked = (): Set<string> => {
  try {
    const raw = localStorage.getItem(CHECK_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};
const saveChecked = (s: Set<string>) => {
  try {
    localStorage.setItem(CHECK_KEY, JSON.stringify([...s]));
  } catch {
    /* sem storage — marcação some ao recarregar */
  }
};

type Row =
  | { kind: "initial"; date: string; balance: number }
  | { kind: "entry"; entry: CashFlowEntry; balance: number | null };

const AccountStatementModal: React.FC<Props> = ({ account, cashFlow, onClose }) => {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [checked, setChecked] = useState<Set<string>>(loadChecked);

  const toggleChecked = (id: string) => {
    setChecked((prev) => {
      const next = new Set<string>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveChecked(next);
      return next;
    });
  };

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const data = useMemo(() => {
    const monthStartT = cursor.getTime();
    const monthEndT = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();
    const initial = Number(account.initialBalance || 0);
    // Mesma regra do saldo dos cards: o saldo inicial é o saldo no FIM do dia
    // de corte, então só lançamentos com data POSTERIOR ao corte entram.
    const cutoffT = ymdToTime(account.initialBalanceDate);
    const hasCutoff = !Number.isNaN(cutoffT);
    const counts = (t: number) => !hasCutoff || t > cutoffT;

    const accountEntries = cashFlow.filter((e) => e.accountId === account.id);

    // Saldo no início do mês — só dá pra saber se o mês começa depois do
    // corte (antes disso o sistema não sabe o saldo real da conta).
    let opening: number | null = null;
    if (!hasCutoff || monthStartT > cutoffT) {
      opening =
        initial +
        accountEntries
          .filter((e) => {
            const t = ymdToTime(e.date);
            return !Number.isNaN(t) && t < monthStartT && counts(t);
          })
          .reduce((s, e) => s + signed(e), 0);
    }

    const inMonth = accountEntries
      .filter((e) => {
        const t = ymdToTime(e.date);
        return t >= monthStartT && t < monthEndT;
      })
      .sort((a, b) => {
        const diff = ymdToTime(a.date) - ymdToTime(b.date);
        if (diff !== 0) return diff;
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      });

    const rows: Row[] = [];
    let running = opening;
    const cutoffInMonth = hasCutoff && cutoffT >= monthStartT && cutoffT < monthEndT;
    let initialInserted = false;
    const insertInitial = () => {
      if (initialInserted || !cutoffInMonth) return;
      rows.push({ kind: "initial", date: account.initialBalanceDate as string, balance: initial });
      running = initial;
      initialInserted = true;
    };

    let entradas = 0;
    let saidas = 0;
    for (const e of inMonth) {
      const t = ymdToTime(e.date);
      if (cutoffInMonth && t > cutoffT) insertInitial();
      if (e.type === "Saída") saidas += Number(e.amount || 0);
      else entradas += Number(e.amount || 0);
      if (counts(t) && running !== null) {
        running += signed(e);
        rows.push({ kind: "entry", entry: e, balance: running });
      } else {
        rows.push({ kind: "entry", entry: e, balance: null });
      }
    }
    insertInitial();

    return { opening, rows, entradas, saidas, closing: running, count: inMonth.length };
  }, [account, cashFlow, cursor]);

  const checkedInMonth = data.rows.filter((r) => r.kind === "entry" && checked.has(r.entry.id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 p-5 border-b">
          <div>
            <h3 className="text-xl font-bold">Extrato — {account.name}</h3>
            <p className="text-sm text-gray-500">Lançamentos do Caixa nesta conta, pra conferir com o extrato do banco</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl leading-none px-2" title="Fechar">
            ×
          </button>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center justify-center gap-4 py-3 border-b">
          <button
            type="button"
            onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="h-9 w-9 rounded-full border border-gray-300 hover:bg-gray-100 text-lg"
            title="Mês anterior"
          >
            ‹
          </button>
          <span className="min-w-[180px] text-center font-semibold capitalize">{monthLabel}</span>
          <button
            type="button"
            onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="h-9 w-9 rounded-full border border-gray-300 hover:bg-gray-100 text-lg"
            title="Próximo mês"
          >
            ›
          </button>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5 pb-3">
          <div className="border rounded-lg p-3">
            <p className="text-xs text-gray-500">Saldo anterior</p>
            <p className="font-bold">{data.opening !== null ? money(data.opening) : "—"}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-gray-500">Entradas</p>
            <p className="font-bold text-green-600">{money(data.entradas)}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-gray-500">Saídas</p>
            <p className="font-bold text-red-600">{money(data.saidas)}</p>
          </div>
          <div className="border rounded-lg p-3 bg-sky-50 border-sky-200">
            <p className="text-xs text-sky-700">Saldo no fim do mês</p>
            <p className="font-bold">{data.closing !== null ? money(data.closing) : "—"}</p>
          </div>
        </div>
        {data.opening === null && (
          <p className="px-5 pb-2 text-xs text-amber-700">
            Mês anterior à data do saldo inicial da conta ({formatBR(account.initialBalanceDate)}) — os lançamentos até essa data
            não entram no saldo, por isso aparecem sem saldo acumulado.
          </p>
        )}

        {/* Lançamentos */}
        <div className="overflow-auto px-5 pb-5">
          {data.rows.length === 0 ? (
            <p className="py-10 text-center text-gray-500">Nenhum lançamento nesta conta em {monthLabel}.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="py-2 pr-2 w-8" title="Conferido">✓</th>
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">Descrição</th>
                  <th className="py-2 pr-3">Categoria</th>
                  <th className="py-2 pr-3 text-right">Valor</th>
                  <th className="py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) =>
                  r.kind === "initial" ? (
                    <tr key="initial" className="border-b bg-gray-50 italic text-gray-600">
                      <td />
                      <td className="py-2 pr-3 whitespace-nowrap">{formatBR(r.date)}</td>
                      <td className="py-2 pr-3" colSpan={3}>Saldo inicial cadastrado da conta</td>
                      <td className="py-2 text-right font-semibold whitespace-nowrap">{money(r.balance)}</td>
                    </tr>
                  ) : (
                    <tr
                      key={r.entry.id}
                      className={`border-b ${checked.has(r.entry.id) ? "bg-green-50" : ""}`}
                    >
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={checked.has(r.entry.id)}
                          onChange={() => toggleChecked(r.entry.id)}
                          title="Marcar como conferido"
                        />
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatBR(r.entry.date)}</td>
                      <td className="py-2 pr-3">
                        {r.entry.description || "-"}
                        {r.entry.isTransfer && (
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">
                            Transferência
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">{r.entry.category || "-"}</td>
                      <td
                        className={`py-2 pr-3 text-right font-semibold whitespace-nowrap ${
                          r.entry.type === "Saída" ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {r.entry.type === "Saída" ? "-" : "+"}
                        {money(Number(r.entry.amount || 0))}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">{r.balance !== null ? money(r.balance) : "—"}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
          {data.count > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              {data.count} lançamento(s) · {checkedInMonth} conferido(s)
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountStatementModal;
