import { supabase } from "../../../services/supabase";

// Bucket dedicado a documentos de funcionario (atestado, recibo de
// uniforme/EPI assinado etc.) - diferente das fotos de produto/material,
// e sensivel, entao o bucket deve ser PRIVADO e o link sempre uma signed
// URL (nunca getPublicUrl), igual ao fallback ja usado em
// utils/materialPhoto.ts para os buckets de material.
const BUCKET = "employee-documents";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9.-]+/g, "_");

export async function uploadEmployeeAttachment(
  file: File,
  funcionarioId: number,
  pasta: string
): Promise<string> {
  const path = `${funcionarioId}/${pasta}/${Date.now()}-${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) throw signError || new Error("Nao foi possivel gerar o link do anexo.");

  return data.signedUrl;
}
