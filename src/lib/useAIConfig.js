/**
 * useAIConfig.js — Hook de configuration IA (localStorage)
 *
 * Stocke le fournisseur et la clé API côté client uniquement.
 * Aucun envoi automatique vers un service tiers.
 */
import { useState, useCallback } from "react";

const STORAGE_KEY = "atelier_ai_config";

/**
 * Structure de la config :
 * {
 *   provider : "openai" | "anthropic" | "google" | "",
 *   apiKey   : string,
 *   model    : string,   // modèle par défaut selon provider
 *   configured : boolean,
 * }
 */
const DEFAULT_CONFIG = { provider: "", apiKey: "", model: "", configured: false };

const PROVIDER_DEFAULTS = {
  openai:     { model: "gpt-4o",                 label: "OpenAI",     hint: "sk-…" },
  anthropic:  { model: "claude-opus-4-6",        label: "Anthropic",  hint: "sk-ant-…" },
  google:     { model: "gemini-1.5-pro-latest",   label: "Gemini",     hint: "AIzaSy…" },
  openrouter: { model: "openai/gpt-4o",           label: "OpenRouter", hint: "sk-or-v1-…" },
  autre:      { model: "",                         label: "Autre",      hint: "Votre clé API…" },
};

export function useAIConfig() {
  const [config, setConfig] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const save = useCallback((provider, apiKey) => {
    const defaults = PROVIDER_DEFAULTS[provider] || {};
    const next = {
      provider,
      apiKey: apiKey.trim(),
      model: defaults.model || "",
      configured: !!(provider && apiKey.trim()),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* quota */ }
    setConfig(next);
    return next;
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConfig(DEFAULT_CONFIG);
  }, []);

  return { config, save, clear, PROVIDER_DEFAULTS };
}
