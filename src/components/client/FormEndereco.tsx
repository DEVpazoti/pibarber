"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { salvarMeuEndereco } from "@/app/actions/client";
import { Button, Field, Input, Select } from "@/components/ui";
import type { UserAddress } from "@/lib/types";
import { buscarCEP, ESTADOS } from "@/lib/viacep";
import { mascaraCEP, soDigitos } from "@/lib/utils";

/**
 * Endereço, com preenchimento automático pelo CEP (ViaCEP).
 *
 * São CINCO campos a menos para digitar num teclado de celular. Se a consulta
 * falhar ou o CEP não existir, nada trava: os campos continuam editáveis à
 * mão, com um aviso discreto.
 */
export function FormEndereco({ endereco }: { endereco: UserAddress | null }) {
  const [cep, setCep] = useState(mascaraCEP(endereco?.zip_code ?? ""));
  const [rua, setRua] = useState(endereco?.street ?? "");
  const [numero, setNumero] = useState(endereco?.number ?? "");
  const [complemento, setComplemento] = useState(endereco?.complement ?? "");
  const [bairro, setBairro] = useState(endereco?.neighborhood ?? "");
  const [cidade, setCidade] = useState(endereco?.city ?? "");
  const [estado, setEstado] = useState(endereco?.state ?? "");

  const [buscandoCep, setBuscandoCep] = useState(false);
  const [avisoCep, setAvisoCep] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  async function aoDigitarCep(valor: string) {
    const mascarado = mascaraCEP(valor);
    setCep(mascarado);
    setAvisoCep(null);

    // Dispara sozinho no oitavo dígito: ninguém precisa tocar em "buscar".
    if (soDigitos(mascarado).length !== 8) return;

    setBuscandoCep(true);
    const achado = await buscarCEP(mascarado);
    setBuscandoCep(false);

    if (!achado) {
      setAvisoCep("Não achei esse CEP. Você pode preencher à mão.");
      return;
    }

    // Só sobrescreve o que veio preenchido: quem digitou a rua antes não
    // perde o que escreveu por causa de um CEP genérico de cidade.
    if (achado.logradouro) setRua(achado.logradouro);
    if (achado.bairro) setBairro(achado.bairro);
    if (achado.localidade) setCidade(achado.localidade);
    if (achado.uf) setEstado(achado.uf);
  }

  function salvar() {
    setErro(null);
    setMensagem(null);

    iniciar(async () => {
      const resultado = await salvarMeuEndereco({
        cep,
        rua,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
      });

      if (!resultado.ok) {
        setErro(resultado.message ?? "Não consegui salvar.");
        return;
      }
      setMensagem(resultado.message ?? "Endereço salvo.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="País" htmlFor="pais">
        <Input id="pais" value="Brasil" readOnly disabled />
      </Field>

      <Field
        label="CEP"
        htmlFor="cep"
        obrigatorio
        dica={avisoCep ?? "Preenche o resto sozinho."}
        erro={undefined}
      >
        <Input
          id="cep"
          inputMode="numeric"
          value={cep}
          onChange={(e) => void aoDigitarCep(e.target.value)}
          placeholder="00000-000"
          className="tnum"
          iconeDireita={
            buscandoCep ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-ink-faint" aria-hidden />
            ) : undefined
          }
        />
      </Field>

      <Field label="Endereço" htmlFor="rua" obrigatorio>
        <Input id="rua" value={rua} onChange={(e) => setRua(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Número" htmlFor="numero">
          <Input
            id="numero"
            inputMode="numeric"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
        </Field>
        <Field label="Complemento" htmlFor="complemento">
          <Input
            id="complemento"
            value={complemento}
            onChange={(e) => setComplemento(e.target.value)}
            placeholder="Apto, bloco"
          />
        </Field>
      </div>

      <Field label="Bairro" htmlFor="bairro">
        <Input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      </Field>

      <div className="grid grid-cols-[1fr_100px] gap-3">
        <Field label="Cidade" htmlFor="cidade" obrigatorio>
          <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </Field>
        <Field label="Estado" htmlFor="estado" obrigatorio>
          <Select id="estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">UF</option>
            {ESTADOS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {erro ? (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      {mensagem ? (
        <p className="flex items-start gap-2 text-sm text-money">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {mensagem}
        </p>
      ) : null}

      <Button tamanho="lg" larguraTotal carregando={salvando} onClick={salvar}>
        Salvar
      </Button>
    </div>
  );
}
