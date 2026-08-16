"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * IMAGENS — envio direto do aparelho para o Supabase Storage.
 *
 * Por que o arquivo NÃO passa pelo nosso servidor: uma Server Action da Vercel
 * tem limite de corpo em torno de 4,5 MB. Se o upload fosse por lá, o limite de
 * 5 MB prometido na tela quebraria antes de chegar no nosso código — e o erro
 * viria do runtime, sem mensagem que ajude alguém. Indo direto, quem autoriza é
 * a policy do bucket, no mesmo modelo de RLS do resto do projeto.
 * Ver `docs/imagens.md` e `supabase/14_storage_imagens.sql`.
 *
 * O arquivo é REDIMENSIONADO E CONVERTIDO no navegador antes de subir. Foto de
 * celular hoje tem 4 a 12 MB; a logo de uma barbearia precisa de 512px. Subir o
 * original seria pagar armazenamento e banda para entregar pixel que ninguém vê
 * — e faria a página do cliente baixar megabytes numa rede 4G de rua.
 */

export const BUCKET = "imagens";

/** 5 MB — o mesmo número declarado no bucket, para o erro vir da tela e não do servidor. */
export const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"] as const;

/** O `accept` do input de arquivo. */
export const ACCEPT = TIPOS_ACEITOS.join(",");

/**
 * Onde cada imagem mora, e de que tamanho.
 *
 * O caminho é sempre `{pasta}/{dono}/{arquivo}-{carimbo}.{ext}`, e os dois
 * primeiros pedaços são o que a policy do bucket lê para decidir quem pode
 * escrever ali — mexer nestes nomes exige mexer em `pode_escrever_imagem()`
 * no `supabase/14_storage_imagens.sql`.
 *
 * ⚠️ Em `barbeiro`, o `dono` é a BARBEARIA, não o profissional. Profissional
 * novo ainda não tem id no momento em que a foto é escolhida — a pasta dele
 * não existiria para escrever. Como a permissão de mexer em profissional é a
 * do dono da loja, a pasta da loja diz a mesma coisa e existe desde sempre.
 */
export const DESTINOS = {
  logo: { pasta: "barbearias", arquivo: "logo", lado: 512 },
  capa: { pasta: "barbearias", arquivo: "capa", lado: 1600 },
  barbeiro: { pasta: "barbeiros", arquivo: "foto", lado: 512 },
  cliente: { pasta: "clientes", arquivo: "foto", lado: 512 },
} as const;

export type TipoDeImagem = keyof typeof DESTINOS;

/* ==========================================================================
   Validação
   ========================================================================== */

/** Devolve a mensagem de erro, ou null se o arquivo serve. */
export function conferirArquivo(arquivo: File): string | null {
  if (!TIPOS_ACEITOS.includes(arquivo.type as (typeof TIPOS_ACEITOS)[number])) {
    return "Formato não aceito. Use JPG, PNG ou WebP.";
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1).replace(".", ",");
    return `A imagem tem ${mb} MB e o limite é 5 MB. Escolha outra ou reduza antes.`;
  }
  return null;
}

/* ==========================================================================
   Redimensionamento
   ========================================================================== */

/**
 * Reduz a imagem para caber num quadrado de `lado` e devolve WebP.
 *
 * Mantém a proporção: `lado` é o limite da MAIOR dimensão, não um recorte.
 * Imagem menor que o limite não é ampliada — esticar 200px para 512px só
 * entrega borrão maior.
 *
 * Sem dependência nenhuma: `createImageBitmap` + `<canvas>` são do navegador.
 * Se o navegador não souber gerar WebP, o `toBlob` devolve PNG e o fluxo segue
 * — por isso o tipo real é lido do Blob, e não presumido.
 */
export async function reduzir(
  arquivo: File,
  lado: number,
): Promise<{ blob: Blob; extensao: string }> {
  const bitmap = await createImageBitmap(arquivo);

  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;

  const contexto = canvas.getContext("2d");
  if (!contexto) {
    bitmap.close();
    throw new Error("Este navegador não conseguiu processar a imagem.");
  }

  contexto.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    // 0.85 é o ponto onde o WebP para de melhorar a olho nu e continua
    // engordando o arquivo.
    canvas.toBlob(resolve, "image/webp", 0.85),
  );

  if (!blob) throw new Error("Não consegui preparar a imagem para envio.");

  return { blob, extensao: blob.type === "image/webp" ? "webp" : "png" };
}

/* ==========================================================================
   Envio
   ========================================================================== */

/** A URL pública de um caminho dentro do bucket. */
function urlPublica(caminho: string): string {
  const supabase = createClient();
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}

/**
 * O caminho dentro do bucket, a partir de uma URL pública nossa.
 *
 * Devolve null quando a URL é externa — que é o caso de toda imagem cadastrada
 * pelo campo de URL. É esse null que impede a limpeza de tentar apagar um
 * arquivo que nunca foi nosso.
 */
export function caminhoDaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const posicao = url.indexOf(marca);
  if (posicao < 0) return null;
  // `split("?")` tira a query de cache que o Storage às vezes acrescenta.
  return decodeURIComponent(url.slice(posicao + marca.length).split("?")[0] ?? "") || null;
}

/**
 * Sobe a imagem e devolve a URL pública.
 *
 * `dono` é o id que manda no caminho — a barbearia, o profissional ou o perfil.
 * É ele que a policy confere.
 *
 * O nome do arquivo leva um carimbo de tempo, e não é enfeite: sobrescrever
 * `logo.webp` deixaria a URL igual, e a imagem antiga continuaria aparecendo
 * por causa do cache do navegador e da CDN. Nome novo = troca visível na hora.
 */
export async function enviarImagem(
  tipo: TipoDeImagem,
  dono: string,
  arquivo: File,
): Promise<string> {
  const erro = conferirArquivo(arquivo);
  if (erro) throw new Error(erro);

  const destino = DESTINOS[tipo];
  const { blob, extensao } = await reduzir(arquivo, destino.lado);
  const caminho = `${destino.pasta}/${dono}/${destino.arquivo}-${Date.now()}.${extensao}`;

  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, blob, {
    contentType: blob.type,
    upsert: false,
  });

  if (error) {
    console.error("[imagens] falha ao enviar:", error);
    // A mensagem crua do Storage ("new row violates row-level security policy")
    // não diz nada para um barbeiro.
    throw new Error("Não consegui enviar a imagem. Tente de novo em instantes.");
  }

  return urlPublica(caminho);
}

/**
 * Apaga do Storage a imagem que estava lá antes.
 *
 * NUNCA levanta erro, e é decisão consciente: a troca da imagem já foi salva
 * quando isto roda. Falhar aqui não pode desfazer o que deu certo — no pior
 * caso sobra um arquivo órfão, que custa centavos e não quebra tela nenhuma.
 * O erro vai para o console para aparecer se virar padrão.
 *
 * URL externa é ignorada em silêncio: não é nossa para apagar.
 */
export async function apagarImagemAntiga(url: string | null | undefined): Promise<void> {
  const caminho = caminhoDaUrl(url);
  if (!caminho) return;

  try {
    const supabase = createClient();
    const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
    if (error) console.error("[imagens] não consegui apagar a anterior:", error);
  } catch (erro) {
    console.error("[imagens] erro inesperado ao apagar a anterior:", erro);
  }
}
