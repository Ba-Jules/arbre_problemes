import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export default function QRCodeGenerator({ url, title = "Participants" }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) return;
    setError(null);

    // On encode UNIQUEMENT l’URL (pas de JSON, pas de texte annexe)
    QRCode.toCanvas(
      canvasRef.current,
      url,
      {
        errorCorrectionLevel: "M",
        margin: 2,
        scale: 6,
        // couleurs neutres pour une meilleure lecture
        color: { dark: "#000000", light: "#ffffff" },
      },
      (err) => {
        if (err) setError(err.message || String(err));
      }
    );
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      console.warn("Copie impossible:", e);
    }
  };

  return (
    <div className="bg-white rounded-md shadow border p-3">
      <details open>
        <summary className="text-sm font-bold">QR participants</summary>
        <div className="flex flex-col items-center gap-2 mt-2">
          <canvas ref={canvasRef} aria-label="QR code participants" />
          <div className="text-xs text-center font-bold">{title}</div>
          <button
            className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
            onClick={copy}
            type="button"
          >
            Copier le lien
          </button>
          <a
            href={url}
            className="text-xs text-blue-600 underline break-all text-center"
            target="_blank"
            rel="noreferrer"
          >
            {url}
          </a>
          {error && (
            <div className="text-xs text-red-600 mt-1">Erreur QR : {error}</div>
          )}
        </div>
      </details>
    </div>
  );
}
