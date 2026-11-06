"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function InkAuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <span className="text-xs text-stone-400">확인 중...</span>;
  }
  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("google")}
        className="rounded-xl bg-stone-950 px-3 py-2 text-xs font-bold text-white sm:px-4"
      >
        Google 로그인
      </button>
    );
  }

  const initial = (session.user.name || session.user.email || "U").slice(0, 1).toUpperCase();
  return (
    <button
      type="button"
      onClick={() => signOut()}
      title={`${session.user.email} · 로그아웃`}
      aria-label={`${session.user.email} 계정에서 로그아웃`}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-950 text-sm font-black text-white shadow-sm"
    >
      {initial}
    </button>
  );
}
