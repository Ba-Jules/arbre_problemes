import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * Génère un QR code fiable (canvas), avec:
 * - re-rendu si l’URL change
 * - bouton Télécharger (PNG)
 * - bouton Copier le lien
 * - fallback texte si le canvas n’est pas supporté
 */
export default function QRCodeGenerator({
  url,
  size = 180,
  title = "QR participants",
  className = "",
}) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setError(null);
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Quelques options utiles pour une meilleure lisibilité
      const opts = {
        errorCorrectionLevel: "M",
        margin: 2,
        scale: 8,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      };

      try {
        await QRCode.toCanvas(canvas, url || "", opts);
        if (cancelled) return;
      } catch (e) {
        if (!cancelled) setError(e?.message || "Impossible de générer le QR");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = "participants-qr.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url || "");
      alert("Lien copié ✅");
    } catch {
      prompt("Copiez le lien :", url || "");
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="text-xs font-semibold mb-2 flex items-center justify-between">
        <span>▼ {title}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-xs"
          >
            PNG
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-xs"
          >
            Copier le lien
          </button>
        </div>
      </div>

      <div
        className="bg-white border rounded p-3 flex items-center justify-center"
        style={{ width: size + 20, height: size + 20 }}
      >
        {error ? (
          <div className="text-xs text-red-600 text-center leading-snug">
            {error}
            <br />
            <span className="text-[11px] text-gray-600">
              (Vous pouvez toujours utiliser le bouton “Copier le lien”)
            </span>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            style={{ width: size, height: size }}
            aria-label="QR code participants"
          />
        )}
      </div>

      <div className="mt-2 text-[11px] break-all leading-snug">
        {url || ""}
      </div>
    </div>
  );
}
