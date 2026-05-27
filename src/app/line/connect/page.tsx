import { Suspense } from "react";
import { LineConnectClient } from "./LineConnectClient";

export default function LineConnectPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-midnight px-5 text-center text-moon">
          <div>
            <div className="moon-glow mx-auto h-20 w-20 rounded-full animate-pulse" />
            <p className="mt-6 text-lg">正在連接宇宙訊息...</p>
          </div>
        </main>
      }
    >
      <LineConnectClient />
    </Suspense>
  );
}
