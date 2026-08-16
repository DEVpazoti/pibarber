/**
 * Busca de endereço pelo CEP, na ViaCEP.
 *
 * É grátis, não pede chave, e economiza cinco campos de digitação no celular —
 * o que, num formulário de endereço, é a diferença entre preencher e desistir.
 *
 * Roda no navegador de propósito: é a digitação do CEP que dispara a consulta,
 * e não faz sentido gastar um round-trip no nosso servidor para isso.
 */

export type EnderecoViaCEP = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
};

type RespostaViaCEP = Partial<EnderecoViaCEP> & { erro?: boolean | string };

/**
 * Devolve o endereço, ou null quando o CEP não existe / a consulta falha.
 *
 * NUNCA lança: um CEP digitado errado não pode quebrar o formulário. Quem
 * chama decide o que mostrar quando vem null.
 */
export async function buscarCEP(cep: string): Promise<EnderecoViaCEP | null> {
  const digitos = cep.replace(/\D/g, "");
  if (digitos.length !== 8) return null;

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, {
      headers: { Accept: "application/json" },
    });

    if (!resposta.ok) {
      console.error("[viacep] resposta não-ok:", resposta.status);
      return null;
    }

    const dados = (await resposta.json()) as RespostaViaCEP;

    // A ViaCEP responde 200 com { "erro": true } quando o CEP não existe.
    if (dados.erro) return null;

    return {
      cep: dados.cep ?? digitos,
      logradouro: dados.logradouro ?? "",
      complemento: dados.complemento ?? "",
      bairro: dados.bairro ?? "",
      localidade: dados.localidade ?? "",
      uf: dados.uf ?? "",
    };
  } catch (error) {
    console.error("[viacep] falha na consulta:", error);
    return null;
  }
}

/** As 27 unidades da federação, para o select de estado. */
export const ESTADOS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
