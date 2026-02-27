import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";

type EmployeeCost = {
  base_salary: number | null;
  net_salary: number | null;
};

const brl = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const EmployeesCostCard: React.FC = () => {
  const [totalBruto, setTotalBruto] = useState(0);
  const [totalLiquido, setTotalLiquido] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadEmployeesCost = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("employees")
      .select("base_salary, net_salary");

    if (error) {
      console.error("Erro ao carregar custos dos funcionários:", error);
      setLoading(false);
      return;
    }

    const bruto = (data ?? []).reduce(
      (sum, e) => sum + Number(e.base_salary || 0),
      0
    );

    const liquido = (data ?? []).reduce(
      (sum, e) => sum + Number(e.net_salary || 0),
      0
    );

    setTotalBruto(bruto);
    setTotalLiquido(liquido);
    setLoading(false);
  };

  useEffect(() => {
    loadEmployeesCost();
  }, []);

  return (
    <div className="p-4 rounded-lg bg-gray-50 border space-y-3">
      <h4 className="font-semibold text-gray-800">Funcionários</h4>

      {loading ? (
        <p className="text-sm text-gray-500">Calculando custos...</p>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            Custo automático baseado no cadastro de funcionários
          </p>

          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Salário Bruto</span>
              <strong>{brl(totalBruto)}</strong>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Total Salário Líquido</span>
              <strong>{brl(totalLiquido)}</strong>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default EmployeesCostCard;
