"use client";

import React from "react";
import { InkFace } from "./InkFace";

export type InkCatState = "idle" | "thinking" | "speaking" | "happy";

interface InkFaceLottieProps {
  state?: InkCatState;
  size?: number;
  lottieJsonUrl?: string; // 🚀 추후 .json 파일 경로를 넣으면 자동으로 Lottie 플레이어로 전환냥!
  className?: string;
}

export function InkFaceLottie({
  state = "idle",
  size = 32,
  lottieJsonUrl,
  className = "",
}: InkFaceLottieProps) {
  // 💡 Lottie 파일 연결 전 임시 애니메이션 가이드
  const stateAnimationClass = {
    idle: "hover:scale-105 transition-transform",
    thinking: "animate-pulse duration-700",
    speaking: "animate-bounce duration-500",
    happy: "rotate-6 scale-110 transition-all",
  };

  if (lottieJsonUrl) {
    return (
      <div style={{ width: size, height: size }} className={className}>
        {/* 🚀 Lottie.json 이식 시 <DotLottieReact src={lottieJsonUrl} loop autoplay /> 구동 영역 */}
        <p className="text-[10px] text-stone-400 font-mono">Lottie Active</p>
      </div>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative flex items-center justify-center ${stateAnimationClass[state]} ${className}`}
    >
      <InkFace size={size} />
      {state === "thinking" && (
        <span className="absolute -top-1 -right-1 text-xs animate-spin">✨</span>
      )}
    </div>
  );
}
