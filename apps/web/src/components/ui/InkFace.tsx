// packages/ui/InkFace.tsx
import React from 'react';

export function InkFace({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      // stroke를 currentColor로 설정하여 부모 컴포넌트의 text-color를 상속받음
      stroke="currentColor" 
      strokeWidth="3"
    >
      {/* 얼굴 외곽선 및 귀 */}
      <path d="M50 27.5C74.3453 27.5 93.5 43.327 93.5 62.207C93.5 66.9415 92.3128 70.6101 90.2461 73.4854C88.1707 76.3727 85.1264 78.5724 81.2344 80.2207C73.3929 83.5414 62.4114 84.5 50 84.5C37.5886 84.5 26.6071 83.5414 18.7656 80.2207C14.8736 78.5724 11.8293 76.3727 9.75391 73.4854C7.68716 70.6101 6.50002 66.9415 6.5 62.207C6.5 43.327 25.6547 27.5 50 27.5Z" stroke="currentColor"/>
      <path d="M61.0421 27.7404C59.9236 25.3759 81.4128 8.77163 86.2866 14.0194C91.1604 19.2671 88.3927 34.6957 86.2866 44" stroke="currentColor"/>
      <path d="M36.9579 27.7404C38.0764 25.3759 16.5872 8.77163 11.7134 14.0194C6.83964 19.2671 9.60731 34.6957 11.7134 44" stroke="currentColor"/>

      {/* 눈과 코는 배경색과 동일하게 fill을 줘서 뚫려있는 느낌 주기*/}
      <ellipse cx="61" cy="57.5" rx="4" ry="9.5" fill="currentColor" stroke="none"/>
      <ellipse cx="38.5" cy="57.5" rx="4.5" ry="9.5" fill="currentColor" stroke="none"/>
      <ellipse cx="51" cy="68" rx="2" ry="1" fill="currentColor" stroke="none"/>
      
      {/* 수염 */}
      <line x1="28" y1="65.5" x2="11" y2="65.5" stroke="currentColor"/>
      <line x1="28" y1="69.5" x2="11" y2="69.5" stroke="currentColor"/>
      <line x1="88" y1="65.5" x2="72" y2="65.5" stroke="currentColor"/>
      <line x1="88" y1="69.5" x2="72" y2="69.5" stroke="currentColor"/>
    </svg>
  );
}
