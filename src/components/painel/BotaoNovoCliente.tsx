"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";

import { ClienteDialog } from "@/components/painel/ClienteDialog";
import { Button } from "@/components/ui";

/**
 * O botão "Novo cliente" e o diálogo que ele abre.
 *
 * Fica separado para a lista de clientes continuar sendo Server Component:
 * só o botão precisa de estado, e só ele carrega JavaScript.
 */
export function BotaoNovoCliente({ tamanho = "md" }: { tamanho?: "sm" | "md" | "lg" }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button
        tamanho={tamanho}
        onClick={() => setAberto(true)}
        iconeEsquerda={<UserPlus className="h-4 w-4" aria-hidden />}
      >
        Novo cliente
      </Button>

      <ClienteDialog aberto={aberto} aoFechar={() => setAberto(false)} />
    </>
  );
}
