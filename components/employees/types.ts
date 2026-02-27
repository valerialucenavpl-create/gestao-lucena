export type Dependent = {
  name: string;
  age: string;
};

export type Employee = {
  id?: number;
  name: string;
  role: string;
  department: string;
  admission_date: string | null;
  cpf: string | null;
  address: string | null;
  phone: string | null;
  gender: string | null;

  base_salary: number;
  net_salary: number;
  hour_value: number;
  minute_value: number;

  dependents_info: string | null;
};
