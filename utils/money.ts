export const formatMoneyInputBR = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const sanitizeMoneyInputBR = (value: string) => {
  const onlyNumbersAndComma = String(value || "").replace(/[^\d,]/g, "");
  const commaIndex = onlyNumbersAndComma.indexOf(",");
  if (commaIndex < 0) return onlyNumbersAndComma;

  const integerPart = onlyNumbersAndComma.slice(0, commaIndex + 1);
  const decimalPart = onlyNumbersAndComma.slice(commaIndex + 1).replace(/,/g, "");
  return `${integerPart}${decimalPart}`;
};

export const parseMoneyInputBR = (value: string) => {
  const cleaned = sanitizeMoneyInputBR(value);
  if (!cleaned) return 0;
  const asNumber = Number(cleaned.replace(",", "."));
  return Number.isFinite(asNumber) ? asNumber : 0;
};
