"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { initializeEngine } from "@ink/engine";
import { InkChatSettingsProvider } from "@/context/InkChatSettingsProvider";
import { GlobalModals } from "@/components/GlobalModals";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }));

  useEffect(() => {
    initializeEngine({
      google: {
        clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
        clientSecret: ""
      }
    });
  }, []);

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <InkChatSettingsProvider>
        {children}
        <GlobalModals />
        </InkChatSettingsProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
