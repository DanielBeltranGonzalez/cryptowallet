"use client";

import { useState, useEffect } from "react";

const CONSENT_KEY = "legal-consent";

export default function ConsentModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem(CONSENT_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white">Aviso Legal y Privacidad</h2>

        <div className="space-y-3 text-sm text-zinc-300">
          <section>
            <p className="font-semibold text-zinc-100 mb-1">Almacenamiento local</p>
            <p>
              Las direcciones de wallet que introduzcas se guardan en el almacenamiento local
              de tu navegador (<code className="text-xs">localStorage</code>). Ningún servidor
              propio almacena ni procesa estos datos.
            </p>
          </section>

          <section>
            <p className="font-semibold text-zinc-100 mb-1">Servicios externos</p>
            <p>
              Para consultar saldos, las direcciones se envían al nodo RPC público de Solana.
              Los precios se obtienen de DexScreener y los tipos de cambio de Frankfurter.
              Son servicios de terceros con sus propias políticas de privacidad.
            </p>
          </section>

          <section>
            <p className="font-semibold text-zinc-100 mb-1">Sin asesoramiento financiero</p>
            <p>
              La información mostrada es puramente informativa y no constituye asesoramiento
              financiero, fiscal ni de inversión de ningún tipo.
            </p>
          </section>

          <section>
            <p className="font-semibold text-zinc-100 mb-1">Cookies</p>
            <p>
              Esta aplicación no utiliza cookies. Solo emplea{" "}
              <code className="text-xs">localStorage</code> para recordar tus direcciones
              y tu aceptación de este aviso.
            </p>
          </section>
        </div>

        <button
          onClick={accept}
          className="w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
        >
          He leído y acepto
        </button>
      </div>
    </div>
  );
}
