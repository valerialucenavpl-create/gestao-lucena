import React, { useEffect, useMemo, useState } from "react";
import { BankAccount, CashFlowCategory, CashFlowEntry, CashFlowSettings, DfcGroup, DreGroup, Product, Quote, Sale } from "../types";
import { getBankAccounts } from "../services/bankAccountsServices";
import { getCashFlowCategories } from "../services/cashflowCategoriesServices";
import { getCashFlowSettings } from "../services/cashflowSettingsServices";
import { getReceivables } from "../services/receivablesServices";
import { getDfcConferencias, saveDfcConferencia, DfcConferencia } from "../services/dfcConferenciaServices";
import { supabase } from "../services/supabase";
import UnreliablePeriodBanner, { NotConferredTag } from "./common/UnreliablePeriodBanner";
import {
  parseItems, itemRevenue, itemMaterialCost, cancelledQuoteIdsFrom, isCancelledSale, reliableStartOf, isPeriodUnreliable, timeToYmd,
} from "../utils/salesReport";

// ─── Helpers ────────────────────────────────────────────────
const money = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) =>
  `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const ymdToTime = (ymd?: string) => {
  if (!ymd) return NaN;
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map((x) => Number(x));
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};
const inRange = (ymd: string | undefined, fromT: number, toT: number) => {
  const t = ymdToTime(ymd);
  if (Number.isNaN(t)) return false;
  return t >= fromT && t <= toT;
};
const formatBR = (ymd?: string) => {
  if (!ymd) return "-";
  const [y, m, d] = String(ymd).slice(0, 10).split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
};
const toISO = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

type CatKey = string;
const catKey = (type: string, category: string, subcategory: string) =>
  `${type}||${(category || "").trim()}||${(subcategory || "").trim()}`;

type LineKey =
  | "recebimentos_clientes" | "outros_recebimentos"
  | "fornecedores" | "pessoal" | "impostos" | "taxas_comissoes" | "despesas_fixas" | "despesas_financeiras"
  | "aquisicao_imobilizado" | "aplicacoes" | "resgates_aplicacao"
  | "entrada_emprestimos" | "amortizacao_emprestimos" | "aportes_proprietaria" | "distribuicao_lucros";

const LINE_LABELS: Record<LineKey, string> = {
  recebimentos_clientes: "Recebimentos de clientes",
  outros_recebimentos: "Outros recebimentos operacionais",
  fornecedores: "Pagamentos a fornecedores",
  pessoal: "Pagamentos de pessoal",
  impostos: "Impostos",
  taxas_comissoes: "Taxas e comissões",
  despesas_fixas: "Despesas fixas",
  despesas_financeiras: "Despesas financeiras",
  aquisicao_imobilizado: "Aquisição de imobilizado",
  aplicacoes: "Aplicações",
  resgates_aplicacao: "Resgates de aplicação",
  entrada_emprestimos: "Entrada de empréstimos",
  amortizacao_emprestimos: "Amortização de empréstimos (principal)",
  aportes_proprietaria: "Aportes da proprietária",
  distribuicao_lucros: "Distribuição de lucros",
};

const OPERATIONAL_LINES: { key: LineKey; type: "Entrada" | "Saída"; match: (dre?: DreGroup, subcat?: string) => boolean }[] = [
  { key: "recebimentos_clientes", type: "Entrada", match: (dre, sub) => dre === "RECEITA_BRUTA" || sub === "recebimento de crediário / fiado" },
  { key: "outros_recebimentos", type: "Entrada", match: (dre) => dre === "OUTRAS_RECEITAS" || dre === "RESULTADO_FINANCEIRO" },
  { key: "fornecedores", type: "Saída", match: (dre) => dre === "CUSTO_DIRETO" },
  { key: "pessoal", type: "Saída", match: (dre) => dre === "DESPESA_PESSOAL" },
  { key: "impostos", type: "Saída", match: (dre) => dre === "DEDUCOES" },
  { key: "taxas_comissoes", type: "Saída", match: (dre) => dre === "DESPESA_VARIAVEL" },
  { key: "despesas_fixas", type: "Saída", match: (dre) => dre === "DESPESA_FIXA" },
  { key: "despesas_financeiras", type: "Saída", match: (dre) => dre === "RESULTADO_FINANCEIRO" },
];

const INVESTMENT_LINES: { key: LineKey; type: "Entrada" | "Saída"; subcats: string[] }[] = [
  { key: "aquisicao_imobilizado", type: "Saída", subcats: ["aquisição de imobilizado"] },
  { key: "aplicacoes", type: "Saída", subcats: ["aplicação / investimento"] },
  { key: "resgates_aplicacao", type: "Entrada", subcats: ["resgate de aplicação"] },
];

const FINANCING_LINES: { key: LineKey; type: "Entrada" | "Saída"; subcats: string[] }[] = [
  { key: "entrada_emprestimos", type: "Entrada", subcats: ["entrada de empréstimo"] },
  { key: "amortizacao_emprestimos", type: "Saída", subcats: ["amortização de empréstimo (principal)"] },
  { key: "aportes_proprietaria", type: "Entrada", subcats: ["aporte da proprietária"] },
  { key: "distribuicao_lucros", type: "Saída", subcats: ["distribuição de lucros"] },
];

type LineBucket = { total: number; bySub: Map<string, { amount: number; entries: CashFlowEntry[] }> };

const emptyBucket = (): LineBucket => ({ total: 0, bySub: new Map() });

const addToBucket = (bucket: LineBucket, e: CashFlowEntry) => {
  bucket.total += toNum(e.amount);
  const sub = e.subcategory || "-";
  const s = bucket.bySub.get(sub) || { amount: 0, entries: [] };
  s.amount += toNum(e.amount);
  s.entries.push(e);
  bucket.bySub.set(sub, s);
};

// Data a partir da qual o saldo por conta é confiável — cada conta tem sua
// própria data de corte (Configurações → Plano de Contas → Contas
// bancárias); usa a mais recente entre todas como corte "seguro" do
// consolidado (antes disso, alguma conta pode não ter saldo inicial certo).
function computeCutoff(accounts: BankAccount[]): string {
  const dates = accounts.map((a) => a.initialBalanceDate).filter(Boolean).sort();
  return dates.length > 0 ? dates[dates.length - 1] : "2026-09-30";
}

type Props = {
  quotes?: Quote[] | null;
  // Só pra saber quais vendas foram canceladas em Vendas (mesma regra da DRE).
  sales?: Sale[] | null;
  cashFlow?: CashFlowEntry[] | null;
  products?: Product[] | null;
  fromDate: string;
  toDate: string;
};

const Dfc: React.FC<Props> = ({ quotes, sales, cashFlow, products, fromDate, toDate }) => {
  const now = new Date();
  const [viewMode, setViewMode] = useState<"consolidado" | "porConta" | "mensal">("consolidado");
  const [expandedLine, setExpandedLine] = useState<LineKey | null>(null);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [categoriesDb, setCategoriesDb] = useState<CashFlowCategory[]>([]);
  const [settings, setSettings] = useState<CashFlowSettings>({});
  const [receivables, setReceivables] = useState<any[]>([]);
  const [payables, setPayables] = useState<any[]>([]);
  const [conferencias, setConferencias] = useState<DfcConferencia[]>([]);
  const [extratoInputs, setExtratoInputs] = useState<Record<string, string>>({});
  const [savingConferenciaId, setSavingConferenciaId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [accRes, catRes, setRes, recRes, confRes, payRes] = await Promise.all([
        getBankAccounts(),
        getCashFlowCategories(),
        getCashFlowSettings(),
        getReceivables(),
        getDfcConferencias(),
        supabase.from("payables").select("*").is("deleted_at", null),
      ]);
      if (accRes.ok) setAccounts(accRes.data ?? []);
      if (catRes.ok) setCategoriesDb(catRes.data ?? []);
      if (setRes.ok) setSettings(setRes.data ?? {});
      if (recRes.ok) setReceivables(recRes.data ?? []);
      if (confRes.ok) setConferencias(confRes.data ?? []);
      if (!payRes.error) setPayables(payRes.data ?? []);
    };
    load();
  }, []);

  const catMap = useMemo(() => {
    const m = new Map<CatKey, CashFlowCategory>();
    for (const c of categoriesDb) m.set(catKey(c.type, c.category, c.subcategory), c);
    return m;
  }, [categoriesDb]);

  const qs = Array.isArray(quotes) ? quotes : [];
  const cf = Array.isArray(cashFlow) ? cashFlow : [];
  const ps = Array.isArray(products) ? products : [];
  const byId = useMemo(() => ps.reduce((a, p) => { a[String(p.id)] = p; return a; }, {} as Record<string, any>), [ps]);

  const cutoffDate = useMemo(() => computeCutoff(accounts), [accounts]);
  const cutoffT = ymdToTime(cutoffDate);

  const fromT = ymdToTime(fromDate);
  const toT = ymdToTime(toDate);
  const cancelledQuoteIds = useMemo(() => cancelledQuoteIdsFrom(sales), [sales]);
  const reliableStart = reliableStartOf(settings);
  const balanceAvailable = accounts.length > 0 && fromT >= cutoffT;

  // ── Monta a estrutura da DFC (regime de caixa: data do lançamento) ──
  const buildDfc = (periodFromT: number, periodToT: number) => {
    const lines = new Map<LineKey, LineBucket>();
    const unmapped = new Map<string, { count: number; amount: number }>();
    for (const key of Object.keys(LINE_LABELS) as LineKey[]) lines.set(key, emptyBucket());

    const entries = cf.filter((e) => !e.isTransfer && inRange(e.date, periodFromT, periodToT));

    for (const e of entries) {
      const cat = catMap.get(catKey(e.type, e.category || "", e.subcategory || ""));
      const grupoDfc = cat?.grupoDfc;
      if (!cat || !grupoDfc || grupoDfc === "NAO_ENTRA") {
        if (cat?.category !== "TRANSFERÊNCIA") {
          const k = `${e.type}||${e.category || "(sem categoria)"}||${e.subcategory || "(sem subcategoria)"}`;
          const ex = unmapped.get(k);
          if (ex) { ex.count += 1; ex.amount += toNum(e.amount); }
          else unmapped.set(k, { count: 1, amount: toNum(e.amount) });
        }
        continue;
      }

      if (grupoDfc === "OPERACIONAL") {
        const line = OPERATIONAL_LINES.find((l) => l.type === e.type && l.match(cat.grupoDre, e.subcategory));
        if (line) addToBucket(lines.get(line.key)!, e);
        else addToBucket(lines.get(e.type === "Entrada" ? "outros_recebimentos" : "despesas_fixas")!, e);
      } else if (grupoDfc === "INVESTIMENTO") {
        const line = INVESTMENT_LINES.find((l) => l.type === e.type && l.subcats.includes((e.subcategory || "").toLowerCase()));
        if (line) addToBucket(lines.get(line.key)!, e);
        else addToBucket(lines.get(e.type === "Entrada" ? "resgates_aplicacao" : "aplicacoes")!, e);
      } else if (grupoDfc === "FINANCIAMENTO") {
        const line = FINANCING_LINES.find((l) => l.type === e.type && l.subcats.includes((e.subcategory || "").toLowerCase()));
        if (line) addToBucket(lines.get(line.key)!, e);
        else addToBucket(lines.get(e.type === "Entrada" ? "entrada_emprestimos" : "amortizacao_emprestimos")!, e);
      }
    }

    const recebimentosClientes = lines.get("recebimentos_clientes")!.total;
    const outrosRecebimentos = lines.get("outros_recebimentos")!.total;
    const fornecedores = lines.get("fornecedores")!.total;
    const pessoal = lines.get("pessoal")!.total;
    const impostos = lines.get("impostos")!.total;
    const taxasComissoes = lines.get("taxas_comissoes")!.total;
    const despesasFixas = lines.get("despesas_fixas")!.total;
    const despesasFinanceiras = lines.get("despesas_financeiras")!.total;
    const caixaOperacoes = recebimentosClientes + outrosRecebimentos - fornecedores - pessoal - impostos - taxasComissoes - despesasFixas - despesasFinanceiras;

    const aquisicaoImobilizado = lines.get("aquisicao_imobilizado")!.total;
    const aplicacoes = lines.get("aplicacoes")!.total;
    const resgatesAplicacao = lines.get("resgates_aplicacao")!.total;
    const caixaInvestimentos = resgatesAplicacao - aquisicaoImobilizado - aplicacoes;

    const entradaEmprestimos = lines.get("entrada_emprestimos")!.total;
    const amortizacaoEmprestimos = lines.get("amortizacao_emprestimos")!.total;
    const aportesProprietaria = lines.get("aportes_proprietaria")!.total;
    const distribuicaoLucros = lines.get("distribuicao_lucros")!.total;
    const caixaFinanciamentos = entradaEmprestimos + aportesProprietaria - amortizacaoEmprestimos - distribuicaoLucros;

    const variacaoCaixa = caixaOperacoes + caixaInvestimentos + caixaFinanciamentos;
    const totalRecebimentos = recebimentosClientes + outrosRecebimentos + resgatesAplicacao + entradaEmprestimos + aportesProprietaria;

    return {
      lines, unmapped,
      recebimentosClientes, outrosRecebimentos, fornecedores, pessoal, impostos, taxasComissoes, despesasFixas, despesasFinanceiras, caixaOperacoes,
      aquisicaoImobilizado, aplicacoes, resgatesAplicacao, caixaInvestimentos,
      entradaEmprestimos, amortizacaoEmprestimos, aportesProprietaria, distribuicaoLucros, caixaFinanciamentos,
      variacaoCaixa, totalRecebimentos,
    };
  };

  const current = useMemo(() => buildDfc(fromT, toT), [fromT, toT, cf, catMap]);

  // ── Saldo por conta (mesma regra do Caixa: inicial + lançamentos após a
  // data de corte daquela conta) ──
  const accountBalanceAt = (accountId: string, atT: number): number => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return 0;
    const accCutoffT = ymdToTime(acc.initialBalanceDate);
    let bal = Number(acc.initialBalance || 0);
    for (const e of cf) {
      if (e.accountId !== accountId) continue;
      const t = ymdToTime(e.date);
      if (Number.isNaN(t) || t > atT) continue;
      // Mesma regra de corte do Caixa: saldo inicial já embute tudo até a
      // data de corte (inclusive), só soma o que vem depois dela.
      if (!Number.isNaN(accCutoffT) && t <= accCutoffT) continue;
      bal += e.type === "Saída" ? -toNum(e.amount) : toNum(e.amount);
    }
    return bal;
  };

  const saldoInicialConsolidado = useMemo(() => {
    if (!balanceAvailable) return null;
    return accounts.reduce((s, a) => s + accountBalanceAt(a.id, fromT - 86400000), 0);
  }, [accounts, cf, fromT, balanceAvailable]);
  const saldoFinalConsolidado = useMemo(() => {
    if (!balanceAvailable) return null;
    return accounts.reduce((s, a) => s + accountBalanceAt(a.id, toT), 0);
  }, [accounts, cf, toT, balanceAvailable]);

  // ── Por conta ──
  const porConta = useMemo(() => {
    if (!balanceAvailable) return [];
    return accounts.map((acc) => {
      const entriesAcc = cf.filter((e) => e.accountId === acc.id && inRange(e.date, fromT, toT));
      const entradas = entriesAcc.filter((e) => e.type === "Entrada" && !e.isTransfer).reduce((s, e) => s + toNum(e.amount), 0);
      const saidas = entriesAcc.filter((e) => e.type === "Saída" && !e.isTransfer).reduce((s, e) => s + toNum(e.amount), 0);
      const transfRecebidas = entriesAcc.filter((e) => e.type === "Entrada" && e.isTransfer).reduce((s, e) => s + toNum(e.amount), 0);
      const transfEnviadas = entriesAcc.filter((e) => e.type === "Saída" && e.isTransfer).reduce((s, e) => s + toNum(e.amount), 0);
      const saldoInicial = accountBalanceAt(acc.id, fromT - 86400000);
      const saldoFinal = accountBalanceAt(acc.id, toT);
      return { account: acc, entradas, saidas, transfRecebidas, transfEnviadas, saldoInicial, saldoFinal };
    });
  }, [accounts, cf, fromT, toT, balanceAvailable]);

  const periodMonthKey = toDate.slice(0, 7);
  const conferenciaByAccount = useMemo(() => {
    const m = new Map<string, DfcConferencia>();
    conferencias.filter((c) => c.periodMonth === periodMonthKey).forEach((c) => m.set(c.accountId, c));
    return m;
  }, [conferencias, periodMonthKey]);

  const handleSaveConferencia = async (accountId: string) => {
    const raw = extratoInputs[accountId];
    if (raw === undefined || raw.trim() === "") return;
    const value = Number(raw.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value)) return alert("Valor inválido.");
    setSavingConferenciaId(accountId);
    try {
      const r = await saveDfcConferencia({ accountId, periodMonth: periodMonthKey, extratoBalance: value });
      if (!r.ok) return alert("Não foi possível salvar: " + (r.error?.message ?? "ver console"));
      setConferencias((prev) => [...prev.filter((c) => !(c.accountId === accountId && c.periodMonth === periodMonthKey)), r.data as DfcConferencia]);
    } finally {
      setSavingConferenciaId(null);
    }
  };

  // ── Mensal (12 meses) ──
  const monthly = useMemo(() => {
    if (viewMode !== "mensal") return [];
    const months: { key: string; label: string; fromT: number; toT: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        fromT: from.getTime(), toT: to.getTime(),
      });
    }
    return months.map((m) => ({
      ...m,
      data: buildDfc(m.fromT, m.toT),
      saldoFinal: accounts.length > 0 && m.fromT >= cutoffT ? accounts.reduce((s, a) => s + accountBalanceAt(a.id, m.toT), 0) : null,
      notConferred: isPeriodUnreliable(timeToYmd(m.fromT), reliableStart),
    }));
  }, [viewMode, cf, catMap, accounts, cutoffT, reliableStart]);

  // ── Lucro x Caixa (comparação com a DRE, mesma regra de reconhecimento) ──
  const recognitionField: "approvedAt" | "deliveredAt" = settings.saleRecognitionDate === "approval" ? "approvedAt" : "deliveredAt";

  // ── Lucro x Caixa — decomposição exata (Etapa 5.1 item 5) ──
  const lucroXCaixa = useMemo(() => {
    const isCompraMercadorias = (e: CashFlowEntry) => (e.subcategory || "").trim().toLowerCase() === "compra de mercadorias";

    // A) Receita da DRE (mesma base da DRE: itens dos pedidos reconhecidos no
    // período pela data de entrega/aprovação, conforme a config).
    const recognizedQuotes = qs.filter(
      (q) => q.status === "Aprovado" && !isCancelledSale(q, cancelledQuoteIds) && inRange((q as any)[recognitionField], fromT, toT)
    );
    let revenueFromItems = 0;
    recognizedQuotes.forEach((q) => {
      // item.price já é o total da linha (unitário × quantidade).
      parseItems((q as any).items).forEach((item: any) => { revenueFromItems += itemRevenue(item); });
    });
    const revenueExtras = recognizedQuotes.reduce((s, q) => s + toNum((q as any).freight) + toNum((q as any).installation) + toNum((q as any).priceDifference), 0);
    const receitaBrutaDre = revenueFromItems + revenueExtras;

    // Pagamentos (Entrada ligada a orçamento) dentro do período, recebidos
    // pelos pedidos reconhecidos NESTE período — usado pra achar quanto
    // dessa receita já virou caixa agora vs. ficou de fora (sinal antigo ou
    // ainda em aberto).
    const recognizedIds = new Set(recognizedQuotes.map((q) => String(q.id)));
    const paymentsInPeriodForRecognized = cf
      .filter((e) => e.type === "Entrada" && !e.isTransfer && e.orcamentoId && recognizedIds.has(String(e.orcamentoId)) && inRange(e.date, fromT, toT))
      .reduce((s, e) => s + toNum(e.amount), 0);
    // Negativo (ou zero) quando a venda gerou mais receita do que caixa
    // recebido agora — cobre sinal recebido ANTES (sinal antigo) e saldo
    // ainda em aberto (recebível), os dois motivos de "receita sem caixa".
    const sinaisAntigosOuSaldoEmAberto = paymentsInPeriodForRecognized - receitaBrutaDre;

    // Sinais recebidos NO período de vendas ainda "Aguardando" (nem
    // reconhecidas) — caixa que entrou mas ainda não virou receita.
    const sinaisAbertos = cf
      .filter((e) => {
        if (e.type !== "Entrada" || e.isTransfer || !e.orcamentoId) return false;
        if (!inRange(e.date, fromT, toT)) return false;
        const q = qs.find((qq) => String(qq.id) === String(e.orcamentoId));
        return q && q.status === "Aprovado" && !q.saleCompleted && !q.deliveredAt;
      })
      .reduce((s, e) => s + toNum(e.amount), 0);

    // Recebimentos no período de vendas já entregues em períodos ANTERIORES
    // (receita já reconhecida antes, caixa só chegou agora).
    const recebimentosEntregasAnteriores = cf
      .filter((e) => {
        if (e.type !== "Entrada" || e.isTransfer || !e.orcamentoId) return false;
        if (!inRange(e.date, fromT, toT)) return false;
        const q = qs.find((qq) => String(qq.id) === String(e.orcamentoId));
        return q && q.status === "Aprovado" && (q as any).deliveredAt && ymdToTime((q as any).deliveredAt) < fromT;
      })
      .reduce((s, e) => s + toNum(e.amount), 0);

    // Vendas de balcão (sem orcamento_id) — conta igual nos dois lados
    // (DFC "recebimentos de clientes" e DRE via cfReceitaBrutaExtra), então
    // contribui ~0 pra diferença; mostrado só como contexto.
    const vendasSemOrcamento = cf
      .filter((e) => e.type === "Entrada" && !e.isTransfer && !e.orcamentoId && inRange(e.date, fromT, toT))
      .filter((e) => {
        const cat = catMap.get(catKey(e.type, e.category || "", e.subcategory || ""));
        return cat?.grupoDre === "RECEITA_BRUTA" || e.subcategory === "recebimento de crediário / fiado";
      })
      .reduce((s, e) => s + toNum(e.amount), 0);

    const diferencaRecebimentos = sinaisAbertos + recebimentosEntregasAnteriores + sinaisAntigosOuSaldoEmAberto;

    // B) Despesas — DFC (regime de caixa, por data) x DRE (por competência).
    const cfSaidaByDate = cf.filter((e) => e.type === "Saída" && !e.isTransfer && inRange(e.date, fromT, toT));
    const cfSaidaByCompetencia = cf.filter((e) => e.type === "Saída" && !e.isTransfer && inRange(e.competenciaDate || e.date, fromT, toT));
    const comprasMercadoriasPorData = cfSaidaByDate.filter(isCompraMercadorias).reduce((s, e) => s + toNum(e.amount), 0);

    const materialQuotes = qs.filter(
      (q) => q.status === "Aprovado" && !isCancelledSale(q, cancelledQuoteIds) && inRange((q as any).deliveredAt, fromT, toT)
    );
    let materialAplicadoTotal = 0;
    materialQuotes.forEach((q) => {
      // Mesma regra da DRE: só material (mão de obra está em Despesas com Pessoal).
      parseItems((q as any).items).forEach((item: any) => { materialAplicadoTotal += itemMaterialCost(item); });
    });
    const useBudgeted = (settings.materialCostMode || "budgeted") === "budgeted" && materialQuotes.length > 0;
    const comprasVsMaterial = comprasMercadoriasPorData - materialAplicadoTotal;

    const sumGrupoDreSaida = (rows: CashFlowEntry[], excludeCompra: boolean) => {
      let total = 0;
      for (const e of rows) {
        if (excludeCompra && isCompraMercadorias(e)) continue;
        const cat = catMap.get(catKey(e.type, e.category || "", e.subcategory || ""));
        if (!cat || !cat.grupoDre || cat.grupoDre === "NAO_ENTRA") continue;
        total += toNum(e.amount);
      }
      return total;
    };

    const dfcPagamentosOperacionais = current.fornecedores + current.pessoal + current.impostos + current.taxasComissoes + current.despesasFixas + current.despesasFinanceiras;
    const restDfc = dfcPagamentosOperacionais - comprasMercadoriasPorData;
    const dreDespesas = sumGrupoDreSaida(cfSaidaByCompetencia, useBudgeted) + (useBudgeted ? materialAplicadoTotal : 0);
    const restDre = dreDespesas - (useBudgeted ? materialAplicadoTotal : comprasMercadoriasPorData);
    const diferencaCompetenciaPagamento = restDfc - restDre;
    const diferencaPagamentos = comprasVsMaterial + diferencaCompetenciaPagamento;

    const cfEntradaInPeriod = cf.filter((e) => e.type === "Entrada" && !e.orcamentoId && !e.isTransfer && inRange(e.date, fromT, toT));
    let outrasReceitasCf = 0;
    cfEntradaInPeriod.forEach((e) => {
      const cat = catMap.get(catKey(e.type, e.category || "", e.subcategory || ""));
      if (cat?.grupoDre && cat.grupoDre !== "NAO_ENTRA" && cat.grupoDre !== "RECEITA_BRUTA") outrasReceitasCf += toNum(e.amount);
    });

    const lucroLiquido = receitaBrutaDre + vendasSemOrcamento + outrasReceitasCf - dreDespesas;
    const caixaOperacoes = current.caixaOperacoes;
    const diferenca = caixaOperacoes - lucroLiquido;
    const outros = diferenca - diferencaRecebimentos + diferencaPagamentos;

    return {
      lucroLiquido, caixaOperacoes, diferenca,
      sinaisAbertos, recebimentosEntregasAnteriores, sinaisAntigosOuSaldoEmAberto, vendasSemOrcamento, diferencaRecebimentos,
      comprasVsMaterial, diferencaCompetenciaPagamento, diferencaPagamentos,
      comprasMercadorias: comprasMercadoriasPorData, materialAplicadoTotal,
      outros,
    };
  }, [qs, cf, catMap, fromT, toT, recognitionField, settings.materialCostMode, current, cancelledQuoteIds]);

  // ── Projeção de caixa 30/60/90 dias ──
  const [includedOverdueClients, setIncludedOverdueClients] = useState<Set<string>>(new Set());
  const projecao = useMemo(() => {
    const today = now;
    const todayT = today.getTime();
    const movimentoAccounts = accounts.filter((a) => a.accountType !== "reserva");
    const reservaAccounts = accounts.filter((a) => a.accountType === "reserva");
    const saldoAtual = movimentoAccounts.reduce((s, a) => s + accountBalanceAt(a.id, todayT), 0);
    const reservaDisponivel = reservaAccounts.reduce((s, a) => s + accountBalanceAt(a.id, todayT), 0);
    const overdue60T = todayT - 60 * 86400000;

    type Ev = { date: string; delta: number; label: string };
    const events: Ev[] = [];
    const excludedOverdue: { customerName: string; amount: number; dueDate: string }[] = [];

    // Só títulos de Contas a Receber entram aqui (não soma de novo o saldo
    // dos pedidos "Aguardando" — o título já representa esse valor, senão
    // duplica). Título de venda ainda "Aguardando" usa o prazo prometido da
    // venda como data do evento; os demais usam o vencimento do título.
    receivables.forEach((r: any) => {
      const payments = cf.filter((e) => e.type === "Entrada" && !e.isTransfer && String(e.orcamentoId ?? "") === String(r.quoteId));
      const paid = payments.reduce((s, p) => s + toNum(p.amount), 0);
      const remaining = Math.max(0, toNum(r.amount) - paid);
      if (remaining <= 0.005) return;

      const quote = qs.find((q) => String(q.id) === String(r.quoteId));
      const awaitingDelivery = quote && quote.status === "Aprovado" && !quote.saleCompleted && !(quote as any).deliveredAt;
      const eventDate = awaitingDelivery ? (quote as any).deliveryDate : r.dueDate;
      if (!eventDate) return;

      const eventT = ymdToTime(eventDate);
      if (!awaitingDelivery && !Number.isNaN(eventT) && eventT < overdue60T) {
        const clientKey = r.customerName || "Cliente não identificado";
        if (!includedOverdueClients.has(clientKey)) {
          excludedOverdue.push({ customerName: clientKey, amount: remaining, dueDate: r.dueDate });
          return;
        }
      }
      events.push({ date: eventDate, delta: remaining, label: `Recebimento — ${r.customerName || "Cliente"}${awaitingDelivery ? " (a receber na entrega)" : ""}` });
    });
    payables.forEach((p: any) => {
      (p.installments || []).forEach((inst: any) => {
        if (!inst.paid && inst.dueDate) events.push({ date: inst.dueDate, delta: -toNum(inst.amount), label: `Pagamento — ${p.name || p.supplier || "Conta a pagar"}` });
      });
    });

    const totalExcludedOverdue = excludedOverdue.reduce((s, r) => s + r.amount, 0);

    const horizon = addDays(today, 90);
    const inWindow = events.filter((e) => {
      const t = ymdToTime(e.date);
      return !Number.isNaN(t) && t >= todayT && t <= horizon.getTime();
    }).sort((a, b) => ymdToTime(a.date) - ymdToTime(b.date));

    let running = saldoAtual;
    let firstNegativeDate: string | null = saldoAtual < 0 ? toISO(today) : null;
    const checkpoints = [30, 60, 90].map((days) => ({ days, dateT: addDays(today, days).getTime(), balance: saldoAtual }));

    for (const ev of inWindow) {
      running += ev.delta;
      if (firstNegativeDate === null && running < 0) firstNegativeDate = ev.date;
      const evT = ymdToTime(ev.date);
      checkpoints.forEach((cp) => { if (evT <= cp.dateT) cp.balance = running; });
    }

    return { saldoAtual, reservaDisponivel, checkpoints, firstNegativeDate, events: inWindow, excludedOverdue, totalExcludedOverdue };
  }, [accounts, cf, receivables, payables, qs, includedOverdueClients]);

  // Despesas recorrentes (apareceram em pelo menos 2 dos últimos 3 meses)
  // sem nenhum lançamento parecido em Contas a Pagar nos próximos 90 dias —
  // possível esquecimento, não uma certeza (é heurística por nome).
  const despesasRecorrentesSemMatch = useMemo(() => {
    const monthsBack = [0, 1, 2].map((i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { fromT: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), toT: new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime() };
    });
    const subcatMonthCount = new Map<string, Set<number>>();
    cf.filter((e) => e.type === "Saída" && !e.isTransfer).forEach((e) => {
      const cat = catMap.get(catKey(e.type, e.category || "", e.subcategory || ""));
      if (!cat || (cat.grupoDre !== "DESPESA_FIXA" && cat.grupoDre !== "DESPESA_PESSOAL")) return;
      monthsBack.forEach((m, idx) => {
        if (inRange(e.date, m.fromT, m.toT)) {
          const set = subcatMonthCount.get(e.subcategory || "") || new Set();
          set.add(idx);
          subcatMonthCount.set(e.subcategory || "", set);
        }
      });
    });

    const horizonT = addDays(now, 90).getTime();
    const upcomingPayableText = payables
      .flatMap((p: any) => (p.installments || []).filter((inst: any) => !inst.paid && inst.dueDate && ymdToTime(inst.dueDate) <= horizonT).map(() => p))
      .map((p: any) => `${p.name || ""} ${p.payableCategory || ""} ${p.productCategory || ""} ${p.supplier || ""}`.toLowerCase());

    const missing: string[] = [];
    subcatMonthCount.forEach((months, subcat) => {
      if (months.size < 2) return;
      const hasMatch = upcomingPayableText.some((text) => text.includes(subcat.toLowerCase()));
      if (!hasMatch) missing.push(subcat);
    });
    return missing;
  }, [cf, catMap, payables]);

  const pctOfRecebimentos = (v: number) => (current.totalRecebimentos > 0 ? pct((v / current.totalRecebimentos) * 100) : "—");

  const handleExportPdf = () => {
    const line = (label: string, value: number, bold = false) => `
      <tr style="${bold ? "font-weight:700;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb" : ""}">
        <td style="padding:6px 8px">${label}</td>
        <td style="padding:6px 8px;text-align:right;${value < 0 ? "color:#dc2626" : ""}">${money(value)}</td>
      </tr>`;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>DFC</title>
      <style>@page{margin:20mm 15mm}body{font-family:Arial,sans-serif;font-size:13px;color:#111}
      h1{font-size:20px;color:#1e3a5f;margin:0 0 4px}.sub{color:#6b7280;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}</style></head><body>
      <h1>DFC — Demonstração do Fluxo de Caixa</h1>
      <div class="sub">Período: ${formatBR(fromDate)} a ${formatBR(toDate)} — visão: ${viewMode} — gerado em ${new Date().toLocaleDateString("pt-BR")}</div>
      <table>
        ${saldoInicialConsolidado !== null ? line("Saldo inicial", saldoInicialConsolidado, true) : ""}
        ${line("(+) Recebimentos de clientes", current.recebimentosClientes)}
        ${line("(+) Outros recebimentos operacionais", current.outrosRecebimentos)}
        ${line("(-) Pagamentos a fornecedores", -current.fornecedores)}
        ${line("(-) Pagamentos de pessoal", -current.pessoal)}
        ${line("(-) Impostos", -current.impostos)}
        ${line("(-) Taxas e comissões", -current.taxasComissoes)}
        ${line("(-) Despesas fixas", -current.despesasFixas)}
        ${line("(-) Despesas financeiras", -current.despesasFinanceiras)}
        ${line("= CAIXA GERADO PELAS OPERAÇÕES", current.caixaOperacoes, true)}
        ${line("(-) Aquisição de imobilizado", -current.aquisicaoImobilizado)}
        ${line("(-) Aplicações", -current.aplicacoes)}
        ${line("(+) Resgates de aplicação", current.resgatesAplicacao)}
        ${line("= CAIXA DE INVESTIMENTOS", current.caixaInvestimentos, true)}
        ${line("(+) Entrada de empréstimos", current.entradaEmprestimos)}
        ${line("(-) Amortização de empréstimos", -current.amortizacaoEmprestimos)}
        ${line("(+) Aportes da proprietária", current.aportesProprietaria)}
        ${line("(-) Distribuição de lucros", -current.distribuicaoLucros)}
        ${line("= CAIXA DE FINANCIAMENTOS", current.caixaFinanciamentos, true)}
        ${line("= VARIAÇÃO DE CAIXA NO PERÍODO", current.variacaoCaixa, true)}
        ${saldoFinalConsolidado !== null ? line("SALDO FINAL", saldoFinalConsolidado, true) : ""}
      </table>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`;
    const win = window.open("", "_blank");
    if (!win) { alert("Permita pop-ups para gerar o PDF."); return; }
    win.document.write(html);
    win.document.close();
  };

  const Row = ({ label, value, lineKey, isSubtotal, indent }: { label: string; value: number; lineKey?: LineKey; isSubtotal?: boolean; indent?: boolean }) => {
    const isExpanded = lineKey && expandedLine === lineKey;
    const bucket = lineKey ? current.lines.get(lineKey) : undefined;
    return (
      <>
        <tr
          className={`${isSubtotal ? "font-bold border-t border-b bg-gray-50" : ""} ${lineKey ? "cursor-pointer hover:bg-gray-50" : ""}`}
          onClick={() => lineKey && setExpandedLine(isExpanded ? null : lineKey)}
        >
          <td className={`py-2 px-3 ${indent ? "pl-6 text-gray-600" : ""}`}>
            {lineKey && <span className="text-gray-400 mr-1">{isExpanded ? "▾" : "▸"}</span>}
            {label}
          </td>
          <td className={`py-2 px-3 text-right ${value < 0 ? "text-red-600" : ""}`}>{money(value)}</td>
          <td className="py-2 px-3 text-right text-gray-400 text-xs">{pctOfRecebimentos(value)}</td>
        </tr>
        {isExpanded && bucket && (
          <tr>
            <td colSpan={3} className="bg-gray-50 px-3 pb-2">
              {Array.from(bucket.bySub.entries()).sort((a, b) => b[1].amount - a[1].amount).map(([sub, data]) => (
                <div key={sub}>
                  <div
                    className="flex justify-between text-xs py-1 pl-6 cursor-pointer hover:text-primary-600"
                    onClick={(ev) => { ev.stopPropagation(); setExpandedSub(expandedSub === `${lineKey}-${sub}` ? null : `${lineKey}-${sub}`); }}
                  >
                    <span>{sub}</span>
                    <span className="font-semibold">{money(data.amount)}</span>
                  </div>
                  {expandedSub === `${lineKey}-${sub}` && (
                    <div className="pl-10 pb-1">
                      {data.entries.map((e) => (
                        <div key={e.id} className="flex justify-between text-xs text-gray-500 py-0.5">
                          <span>{formatBR(e.date)} — {e.description || "-"}</span>
                          <span>{money(toNum(e.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </td>
          </tr>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">DFC — Fluxo de Caixa</h2>
          <p className="text-xs text-gray-500">Regime de caixa (data do pagamento/recebimento) — método direto</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setViewMode("consolidado")} className={`px-3 py-1 text-xs rounded-lg ${viewMode === "consolidado" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>Consolidado</button>
          <button onClick={() => setViewMode("porConta")} className={`px-3 py-1 text-xs rounded-lg ${viewMode === "porConta" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>Por conta</button>
          <button onClick={() => setViewMode("mensal")} className={`px-3 py-1 text-xs rounded-lg ${viewMode === "mensal" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>Mensal (12 meses)</button>
          <button onClick={handleExportPdf} className="px-3 py-1 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700">Exportar PDF</button>
        </div>
      </div>

      {viewMode !== "mensal" && <UnreliablePeriodBanner fromDate={fromDate} reliableStart={reliableStart} />}

      {!balanceAvailable && viewMode !== "mensal" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
          ℹ Saldos por conta disponíveis a partir de {formatBR(cutoffDate)}.
        </div>
      )}

      {viewMode === "porConta" ? (
        !balanceAvailable ? (
          <div className="bg-white rounded-xl p-8 shadow-sm text-center text-gray-400">
            Visão "Por conta" indisponível para períodos anteriores a {formatBR(cutoffDate)}.
          </div>
        ) : (
          <div className="space-y-4">
            {porConta.map((row) => {
              const conf = conferenciaByAccount.get(row.account.id);
              const diff = conf ? row.saldoFinal - conf.extratoBalance : null;
              return (
                <div key={row.account.id} className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      {row.account.name}
                      {row.account.accountType === "reserva" && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 uppercase">Reserva</span>
                      )}
                    </h3>
                    <span className="font-bold text-lg">{money(row.saldoFinal)}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm mb-3">
                    <div><p className="text-xs text-gray-400">Saldo inicial</p><p className="font-semibold">{money(row.saldoInicial)}</p></div>
                    <div><p className="text-xs text-gray-400">Entradas</p><p className="font-semibold text-green-600">{money(row.entradas)}</p></div>
                    <div><p className="text-xs text-gray-400">Saídas</p><p className="font-semibold text-red-600">{money(row.saidas)}</p></div>
                    <div><p className="text-xs text-gray-400">Transf. recebidas</p><p className="font-semibold text-blue-600">{money(row.transfRecebidas)}</p></div>
                    <div><p className="text-xs text-gray-400">Transf. enviadas</p><p className="font-semibold text-blue-600">{money(row.transfEnviadas)}</p></div>
                  </div>
                  <div className="border-t pt-3 flex flex-wrap items-end gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Saldo do extrato ({periodMonthKey})</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={conf ? String(conf.extratoBalance) : "0,00"}
                        value={extratoInputs[row.account.id] ?? ""}
                        onChange={(e) => setExtratoInputs((prev) => ({ ...prev, [row.account.id]: e.target.value }))}
                        className="border rounded-lg px-2 py-1 text-sm w-32"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveConferencia(row.account.id)}
                      disabled={savingConferenciaId === row.account.id}
                      className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-60"
                    >
                      {savingConferenciaId === row.account.id ? "Salvando..." : "Salvar"}
                    </button>
                    {diff !== null && (
                      <span className={`text-sm font-semibold ${Math.abs(diff) < 0.005 ? "text-green-600" : "text-red-600"}`}>
                        Diferença: {money(diff)} {Math.abs(diff) < 0.005 ? "✅" : "⚠️"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : viewMode === "mensal" ? (
        <div className="bg-white rounded-xl p-4 shadow-sm overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Linha</th>
                {monthly.map((m) => (
                  <th key={m.key} className={`text-right py-2 px-3 whitespace-nowrap ${m.notConferred ? "text-gray-400 bg-gray-50" : ""}`}>
                    {m.label}
                    {m.notConferred && <NotConferredTag />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Caixa Operações", key: "caixaOperacoes" },
                { label: "Caixa Investimentos", key: "caixaInvestimentos" },
                { label: "Caixa Financiamentos", key: "caixaFinanciamentos" },
                { label: "Variação de Caixa", key: "variacaoCaixa" },
              ].map((row) => (
                <tr key={row.key} className={row.key === "variacaoCaixa" ? "font-bold border-t" : ""}>
                  <td className="py-1.5 px-3">{row.label}</td>
                  {monthly.map((m) => {
                    const v = (m.data as any)[row.key] as number;
                    return (
                      <td key={m.key} className={`py-1.5 px-3 text-right ${m.notConferred ? "text-gray-400 bg-gray-50" : v < 0 ? "text-red-600" : ""}`}>
                        {money(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t">
                <td className="py-1.5 px-3 font-semibold">Saldo final</td>
                {monthly.map((m) => (
                  <td key={m.key} className={`py-1.5 px-3 text-right font-semibold ${m.notConferred ? "text-gray-400 bg-gray-50" : ""}`}>{m.saldoFinal !== null ? money(m.saldoFinal) : "—"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl p-5 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left py-1 px-3">Linha</th>
                  <th className="text-right py-1 px-3">Valor</th>
                  <th className="text-right py-1 px-3">% Recebimentos</th>
                </tr>
              </thead>
              <tbody>
                {saldoInicialConsolidado !== null ? (
                  <Row label="SALDO INICIAL (consolidado)" value={saldoInicialConsolidado} isSubtotal />
                ) : (
                  <tr>
                    <td className="py-2 px-3 font-bold">SALDO INICIAL (consolidado)</td>
                    <td className="py-2 px-3 text-right text-gray-400" colSpan={2}>não disponível</td>
                  </tr>
                )}
                <tr><td colSpan={3} className="pt-3 pb-1 px-3 text-xs font-bold uppercase text-gray-500">Atividades Operacionais</td></tr>
                <Row label="(+) Recebimentos de clientes" value={current.recebimentosClientes} lineKey="recebimentos_clientes" indent />
                <Row label="(+) Outros recebimentos operacionais" value={current.outrosRecebimentos} lineKey="outros_recebimentos" indent />
                <Row label="(-) Pagamentos a fornecedores" value={-current.fornecedores} lineKey="fornecedores" indent />
                <Row label="(-) Pagamentos de pessoal" value={-current.pessoal} lineKey="pessoal" indent />
                <Row label="(-) Impostos" value={-current.impostos} lineKey="impostos" indent />
                <Row label="(-) Taxas e comissões" value={-current.taxasComissoes} lineKey="taxas_comissoes" indent />
                <Row label="(-) Despesas fixas" value={-current.despesasFixas} lineKey="despesas_fixas" indent />
                <Row label="(-) Despesas financeiras" value={-current.despesasFinanceiras} lineKey="despesas_financeiras" indent />
                <Row label="= CAIXA GERADO PELAS OPERAÇÕES" value={current.caixaOperacoes} isSubtotal />

                <tr><td colSpan={3} className="pt-3 pb-1 px-3 text-xs font-bold uppercase text-gray-500">Atividades de Investimento</td></tr>
                <Row label="(-) Aquisição de imobilizado" value={-current.aquisicaoImobilizado} lineKey="aquisicao_imobilizado" indent />
                <Row label="(-) Aplicações" value={-current.aplicacoes} lineKey="aplicacoes" indent />
                <Row label="(+) Resgates de aplicação" value={current.resgatesAplicacao} lineKey="resgates_aplicacao" indent />
                <Row label="= CAIXA DE INVESTIMENTOS" value={current.caixaInvestimentos} isSubtotal />

                <tr><td colSpan={3} className="pt-3 pb-1 px-3 text-xs font-bold uppercase text-gray-500">Atividades de Financiamento</td></tr>
                <Row label="(+) Entrada de empréstimos" value={current.entradaEmprestimos} lineKey="entrada_emprestimos" indent />
                <Row label="(-) Amortização de empréstimos (principal)" value={-current.amortizacaoEmprestimos} lineKey="amortizacao_emprestimos" indent />
                <Row label="(+) Aportes da proprietária" value={current.aportesProprietaria} lineKey="aportes_proprietaria" indent />
                <Row label="(-) Distribuição de lucros" value={-current.distribuicaoLucros} lineKey="distribuicao_lucros" indent />
                <Row label="= CAIXA DE FINANCIAMENTOS" value={current.caixaFinanciamentos} isSubtotal />

                <Row label="= VARIAÇÃO DE CAIXA NO PERÍODO" value={current.variacaoCaixa} isSubtotal />
                {saldoFinalConsolidado !== null ? (
                  <Row label="SALDO FINAL" value={saldoFinalConsolidado} isSubtotal />
                ) : (
                  <tr>
                    <td className="py-2 px-3 font-bold border-t">SALDO FINAL</td>
                    <td className="py-2 px-3 text-right text-gray-400 border-t" colSpan={2}>não disponível</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Lucro x Caixa */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3">Lucro x Caixa</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="border rounded-lg p-3">
                <p className="text-xs text-gray-500">Lucro Líquido (DRE)</p>
                <p className={`text-xl font-bold ${lucroXCaixa.lucroLiquido >= 0 ? "text-blue-600" : "text-red-600"}`}>{money(lucroXCaixa.lucroLiquido)}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-xs text-gray-500">Caixa Gerado pelas Operações</p>
                <p className={`text-xl font-bold ${lucroXCaixa.caixaOperacoes >= 0 ? "text-blue-600" : "text-red-600"}`}>{money(lucroXCaixa.caixaOperacoes)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-2">Diferença (Caixa − Lucro): {money(lucroXCaixa.diferenca)}</p>
            <p className="text-xs font-semibold text-gray-600 mb-1">A) Diferença de recebimentos: {money(lucroXCaixa.diferencaRecebimentos)}</p>
            <div className="space-y-1 text-sm mb-3 pl-2">
              <div className="flex justify-between"><span className="text-gray-600">Sinais recebidos de vendas "Aguardando"</span><span className="font-semibold">{money(lucroXCaixa.sinaisAbertos)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Recebimentos de vendas entregues em períodos anteriores</span><span className="font-semibold">{money(lucroXCaixa.recebimentosEntregasAnteriores)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Receita reconhecida agora, recebida em outro momento (sinais antigos/saldo em aberto)</span><span className="font-semibold">{money(lucroXCaixa.sinaisAntigosOuSaldoEmAberto)}</span></div>
              <div className="flex justify-between text-gray-400"><span>Vendas sem orçamento (balcão) — informativo</span><span>{money(lucroXCaixa.vendasSemOrcamento)}</span></div>
            </div>
            <p className="text-xs font-semibold text-gray-600 mb-1">B) Diferença de pagamentos: {money(lucroXCaixa.diferencaPagamentos)}</p>
            <div className="space-y-1 text-sm mb-3 pl-2">
              <div className="flex justify-between"><span className="text-gray-600">Compras de mercadorias x material aplicado</span><span className="font-semibold">{money(lucroXCaixa.comprasVsMaterial)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Diferença competência x pagamento</span><span className="font-semibold">{money(lucroXCaixa.diferencaCompetenciaPagamento)}</span></div>
            </div>
            <div className={`flex justify-between text-sm border-t pt-2 ${Math.abs(lucroXCaixa.outros) > 100 ? "text-red-600 font-bold" : "text-gray-600"}`}>
              <span>Outros (residual)</span>
              <span className="font-semibold">{money(lucroXCaixa.outros)}</span>
            </div>
            {Math.abs(lucroXCaixa.outros) > 100 && (
              <p className="text-xs text-red-600 mt-1">⚠ Residual acima de R$ 100 — pode haver lançamento fora do padrão esperado.</p>
            )}
          </div>

          {/* Projeção de caixa */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-3">Projeção de Caixa</h3>
            <p className="text-xs text-gray-500">Saldo atual (contas movimento): {money(projecao.saldoAtual)}</p>
            {projecao.reservaDisponivel > 0 && (
              <p className="text-xs text-indigo-600 mb-3">Reserva disponível: {money(projecao.reservaDisponivel)}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              {projecao.checkpoints.map((cp) => (
                <div key={cp.days} className={`border rounded-lg p-3 text-center ${cp.balance < 0 ? "bg-red-50 border-red-300" : ""}`}>
                  <p className="text-xs text-gray-500">Em {cp.days} dias</p>
                  <p className={`text-lg font-bold ${cp.balance < 0 ? "text-red-600" : "text-gray-800"}`}>{money(cp.balance)}</p>
                </div>
              ))}
            </div>
            {projecao.firstNegativeDate && (
              <p className="text-sm text-red-600 font-semibold mt-3">⚠ Saldo fica negativo a partir de {formatBR(projecao.firstNegativeDate)}.</p>
            )}

            {projecao.reservaDisponivel > 0 && (
              <div className="mt-3 border-t pt-3">
                <p className="text-xs font-semibold text-indigo-700 mb-2">Saldo projetado usando a reserva</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {projecao.checkpoints.map((cp) => {
                    const withReserve = cp.balance + projecao.reservaDisponivel;
                    return (
                      <div key={cp.days} className={`border rounded-lg p-3 text-center ${withReserve < 0 ? "bg-red-50 border-red-300" : "bg-indigo-50 border-indigo-200"}`}>
                        <p className="text-xs text-gray-500">Em {cp.days} dias</p>
                        <p className={`text-lg font-bold ${withReserve < 0 ? "text-red-600" : "text-indigo-700"}`}>{money(withReserve)}</p>
                      </div>
                    );
                  })}
                </div>
                {projecao.checkpoints.some((cp) => cp.balance + projecao.reservaDisponivel < 0) && (
                  <p className="text-sm text-red-600 font-semibold mt-2">
                    ⚠ Mesmo usando a reserva, o saldo fica negativo — primeira faixa afetada: em{" "}
                    {projecao.checkpoints.find((cp) => cp.balance + projecao.reservaDisponivel < 0)?.days} dias.
                  </p>
                )}
              </div>
            )}

            {projecao.totalExcludedOverdue > 0.005 && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-800 mb-2">
                  Vencidos há +60 dias (não incluídos): {money(projecao.totalExcludedOverdue)}
                </p>
                <div className="space-y-1">
                  {projecao.excludedOverdue.map((r, i) => (
                    <label key={i} className="flex items-center justify-between text-xs text-amber-700 gap-2">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            setIncludedOverdueClients((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.customerName);
                              else next.delete(r.customerName);
                              return next;
                            });
                          }}
                        />
                        {r.customerName} — vencido em {formatBR(r.dueDate)}
                      </span>
                      <span className="font-semibold">{money(r.amount)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">Entradas e saídas do período (conferência)</p>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {projecao.events.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhum evento nos próximos 90 dias.</p>
                ) : (
                  projecao.events.map((e, i) => (
                    <div key={i} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-500">{formatBR(e.date)} — {e.label}</span>
                      <span className={`font-semibold ${e.delta < 0 ? "text-red-600" : "text-green-600"}`}>{money(e.delta)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {despesasRecorrentesSemMatch.length > 0 && (
              <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-orange-800 mb-1">⚠ Possível despesa faltando na projeção</p>
                <p className="text-xs text-orange-700 mb-2">Apareceram em pelo menos 2 dos últimos 3 meses, mas não há nada parecido em Contas a Pagar nos próximos 90 dias:</p>
                <ul className="text-xs text-orange-700 list-disc pl-4">
                  {despesasRecorrentesSemMatch.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Subcategorias sem grupo_dfc */}
          {current.unmapped.size > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="font-semibold text-amber-800 mb-2">Subcategorias sem classificação de DFC no período</h3>
              <div className="space-y-1 text-sm">
                {Array.from(current.unmapped.entries()).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-amber-700">
                    <span>{k.replace(/\|\|/g, " / ")}</span>
                    <span>{v.count} lançamento(s) — {money(v.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dfc;
