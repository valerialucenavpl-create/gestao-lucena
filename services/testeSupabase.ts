import { supabase } from './supabase';

export async function testarInsert() {
  const { data, error } = await supabase
    .from('usuarios')
    .insert([
      {
        nome: "Teste Supabase",
        email: "teste@teste.com",
        senha: "123456",
        tipo: "admin"
      }
    ]);

  console.log("DATA:", data);
  console.log("ERROR:", error);
}
