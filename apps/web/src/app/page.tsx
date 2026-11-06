// 📂 apps/web/src/app/page.tsx
import DashboardContainer from "../components/DashboardContainer";

export const maxDuration = 300;

export default function Home() {
  // 여기에 useState, useSession 등을 절대 쓰지 마세요.
  return <DashboardContainer />;
}
