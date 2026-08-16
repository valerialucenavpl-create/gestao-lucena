import { useEffect, useState } from "react";
import { supabase } from "../../../services/supabase";

// Hook genérico para tabelas "1 linha por funcionário" (jornada, pagamento,
// férias): carrega a linha existente ou devolve os valores padrão, e
// oferece save() que faz upsert por funcionario_id.
export function useSingleRecord<T extends Record<string, any>>(
  table: string,
  funcionarioId: number,
  defaults: T
) {
  const [record, setRecord] = useState<T>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("funcionario_id", funcionarioId)
        .maybeSingle();
      if (!cancelled) {
        if (error) console.error(error);
        setRecord(data ? { ...defaults, ...data } : defaults);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, funcionarioId]);

  const save = async (patch: Partial<T>) => {
    setSaving(true);
    const next = { ...record, ...patch };
    const { data, error } = await supabase
      .from(table)
      .upsert({ ...next, funcionario_id: funcionarioId }, { onConflict: "funcionario_id" })
      .select()
      .single();
    setSaving(false);
    if (error) {
      alert("Não foi possível salvar: " + error.message);
      return;
    }
    setRecord({ ...defaults, ...data });
  };

  return { record, setRecord, loading, saving, save };
}
