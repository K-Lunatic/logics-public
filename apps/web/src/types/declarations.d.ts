// 🚀 TypeScript에게 ai/react가 있음을 알려주는 마법의 주문
declare module 'ai/react' {
  export * from 'ai';
}

interface CustomSession {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    id?: string | null; // 👈 id 명시
  };
  expires: string;
}
