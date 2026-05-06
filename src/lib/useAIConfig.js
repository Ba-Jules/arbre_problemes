/**
 * useAIConfig.js — Hook de configuration IA (localStorage)
 *
 * Toutes les instances du hook restent synchronisées dans la même page
 * via un événement custom dispatché à chaque save/clear.
 */
import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "atelier_ai_config";
const SYNC_EVENT  = "atelier_ai_config_changed";

const DEFAULT_CONFIG = { provider: "", apiKey: "", model: "", configured: false };

const PROVIDER_DEFAULTS = {
  openai:     { model: "gpt-4o",               label: "OpenAI",     hint: "sk-…" },
  anthropic:  { model: "claude-opus-4-6",      label: "Anthropic",  hint: "sk-ant-…" },
  google:     { model: "gemini-1.5-pro-latest", label: "Gemini",     hint: "AIzaSy…" },
  openrouter: { model: "openai/gpt-4o",         label: "OpenRouter", hint: "sk-or-v1-…" },
  autre:      { model: "",                       label: "Autre",      hint: "Votre clé API…" },
};

function readFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function useAIConfig() {
  const [config, setConfig] = useState(readFromStorage);

  /* Toutes les instances s'abonnent à l'événement de sync */
  useEffect(() => {
    const handler = (e) => setConfig(e.detail ?? DEFAULT_CONFIG);
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, []);

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
    /* Notifier TOUTES les instances dans cette page */
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
    setConfig(next);
    return next;
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: DEFAULT_CONFIG }));
    setConfig(DEFAULT_CONFIG);
  }, []);

  return { config, save, clear, PROVIDER_DEFAULTS };
}
