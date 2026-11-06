import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Card({ children, className = "", title }: CardProps) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      {title && (
        <div className="border-b border-gray-100 bg-gray-50/50 px-4 py-3.5 sm:px-6 sm:py-4">
          <h3 className="text-base font-bold text-gray-800 sm:text-lg">{title}</h3>
        </div>
      )}
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}
