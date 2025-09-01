import React from "react";

const DEFAULT_PALETTE = [
  "#ef4444", // rouge
  "#f97316", // orange
  "#eab308", // jaune
  "#22c55e", // vert
  "#06b6d4", // cyan
  "#3b82f6", // bleu
  "#a855f7", // violet
  "#ec4899", // rose
  "#111827", // quasi noir
  "#ffffff", // blanc (texte forcé noir)
];

export default function ColorPalette({
  value,
  onChange,
  colors = DEFAULT_PALETTE,
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {colors.map((c) => {
        const selected = value?.toLowerCase() === c.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            aria-label={`Couleur ${c}`}
            className="w-6 h-6 rounded border"
            style={{
              background: c,
              borderColor: selected ? "#111827" : "rgba(0,0,0,0.15)",
              boxShadow: selected ? "0 0 0 2px #111827 inset" : "none",
            }}
            onClick={() => onChange(c)}
            title={c}
          />
        );
      })}
    </div>
  );
}
