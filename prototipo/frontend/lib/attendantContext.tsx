"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { getMe, type AttendantProfile } from "./api";

interface AttendantContextValue {
  profile: AttendantProfile | null;
  loading: boolean;
  refresh: () => void;
}

const AttendantContext = createContext<AttendantContextValue>({
  profile: null,
  loading: true,
  refresh: () => {},
});

export function AttendantProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<AttendantProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const me = await getMe();
    setProfile(me ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => listener.subscription.unsubscribe();
  }, [refresh]);

  return (
    <AttendantContext.Provider value={{ profile, loading, refresh }}>
      {children}
    </AttendantContext.Provider>
  );
}

export const useAttendant = () => useContext(AttendantContext);
