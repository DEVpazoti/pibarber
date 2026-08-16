import type { NextConfig } from "next";

/**
 * O host do nosso Storage, tirado da própria URL do Supabase.
 *
 * Vem de `NEXT_PUBLIC_SUPABASE_URL` para não haver um segundo lugar dizendo
 * qual é o projeto — trocar de projeto Supabase e esquecer de trocar aqui
 * daria "hostname não configurado" só em produção, e só nas telas com imagem.
 */
function hostDoSupabase(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const host = hostDoSupabase();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // O nosso Storage, declarado explicitamente. Vem primeiro porque é o
      // caminho normal desde que o upload existe (ver docs/imagens.md).
      ...(host ? [{ protocol: "https" as const, hostname: host }] : []),

      // ⚠️ O CURINGA CONTINUA, e é decisão consciente.
      //
      // Logo, capa e foto ainda aceitam URL externa — é a alternativa que
      // convive com o upload, e é o que está gravado hoje em todo registro
      // criado antes dele. Restringir aqui não protegeria nada (a URL é
      // escolhida por quem já tem permissão de escrever no registro) e
      // quebraria toda imagem existente de uma vez.
      //
      // O que ele custa: o otimizador do Next passa a poder buscar imagem de
      // qualquer host https. Se um dia o campo de URL sair, tire isto junto.
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
