"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import {
  getDefaultRequestsPerMinute,
  getUserSettingsAction,
  type PublicUserSettings,
} from "@ink/assembler";

export interface PersonaSettings {
  nickname: string;
  tone: "CAT_NYANG" | "POLITE" | "ANALYTICAL" | "CUSTOM";
  customInstructions: string;
  aiModel: PublicUserSettings["aiModel"];
  aiCapabilityMode: PublicUserSettings["aiCapabilityMode"];
  aiReliabilityMode: PublicUserSettings["aiReliabilityMode"];
  aiRequestsPerMinute: PublicUserSettings["aiRequestsPerMinute"];
}

const DEFAULT_SETTINGS: PublicUserSettings = {
  nickname: "Ink",
  tone: "CAT_NYANG",
  customInstructions: "유능하고 정확한 생활 비서",
  fontScale: "MEDIUM",
  hasGeminiApiKey: false,
  hasWeatherApiKey: false,
  aiModel: "gemini-3.6-flash",
  aiCapabilityMode: "AUTO",
  aiReliabilityMode: "BALANCED",
  aiRequestsPerMinute: getDefaultRequestsPerMinute("gemini-3.6-flash"),
};

interface InkChatSettingsContextType {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (value: boolean) => void;
  isToolBuilderOpen: boolean;
  setIsToolBuilderOpen: (value: boolean) => void;
  isChatOpen: boolean;
  setIsChatOpen: (value: boolean) => void;
  persona: PersonaSettings;
  setPersona: (persona: PersonaSettings) => void;
  preferences: PublicUserSettings;
  setPreferences: (settings: PublicUserSettings) => void;
}

const InkChatSettingsContext = createContext<InkChatSettingsContextType | null>(null);

export function InkChatSettingsProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isToolBuilderOpen, setIsToolBuilderOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [preferences, setPreferences] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    let active = true;
    getUserSettingsAction()
      .then((settings) => {
        if (active) setPreferences(settings);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [status]);

  useEffect(() => {
    document.documentElement.dataset.fontScale = preferences.fontScale.toLowerCase();
  }, [preferences.fontScale]);

  const persona = useMemo<PersonaSettings>(
    () => ({
      nickname: preferences.nickname,
      tone: preferences.tone,
      customInstructions: preferences.customInstructions,
      aiModel: preferences.aiModel,
      aiCapabilityMode: preferences.aiCapabilityMode,
      aiReliabilityMode: preferences.aiReliabilityMode,
      aiRequestsPerMinute: preferences.aiRequestsPerMinute,
    }),
    [
      preferences.nickname,
      preferences.tone,
      preferences.customInstructions,
      preferences.aiModel,
      preferences.aiCapabilityMode,
      preferences.aiReliabilityMode,
      preferences.aiRequestsPerMinute,
    ],
  );

  const value = useMemo(
    () => ({
      isSettingsOpen,
      setIsSettingsOpen,
      isToolBuilderOpen,
      setIsToolBuilderOpen,
      isChatOpen,
      setIsChatOpen,
      persona,
      setPersona: (nextPersona: PersonaSettings) =>
        setPreferences((current) => ({ ...current, ...nextPersona })),
      preferences,
      setPreferences,
    }),
    [isSettingsOpen, isToolBuilderOpen, isChatOpen, persona, preferences],
  );

  return (
    <InkChatSettingsContext.Provider value={value}>
      {children}
    </InkChatSettingsContext.Provider>
  );
}

export function useInkChatSettings() {
  const context = useContext(InkChatSettingsContext);
  if (!context) throw new Error("useInkChatSettings must be used within InkChatSettingsProvider");
  return context;
}
