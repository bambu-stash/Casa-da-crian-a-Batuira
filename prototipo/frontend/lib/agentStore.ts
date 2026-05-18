"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AgentKey = "gmail" | "whatsapp" | "docs" | "sheets";

interface AgentStore {
  enabled: Record<AgentKey, boolean>;
  toggle: (agent: AgentKey) => void;
  setEnabled: (agent: AgentKey, value: boolean) => void;
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      enabled: { gmail: true, whatsapp: true, docs: true, sheets: true },

      toggle: (agent) =>
        set({ enabled: { ...get().enabled, [agent]: !get().enabled[agent] } }),

      setEnabled: (agent, value) =>
        set({ enabled: { ...get().enabled, [agent]: value } }),
    }),
    { name: "hostmaster-agents" }
  )
);
