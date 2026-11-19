import { ToastProvider } from "@citeverify/ui";
import { RouterProvider } from "react-router";
import { AuthProvider } from "./lib/auth.tsx";
import { router } from "./router.tsx";

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  );
}
