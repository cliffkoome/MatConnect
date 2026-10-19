import type { Metadata } from "next";
import { Suspense } from "react";
import "@/styles/pages/auth.css";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Login" };

export default function LoginPage() {
  return (
    <div className="page-auth">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
