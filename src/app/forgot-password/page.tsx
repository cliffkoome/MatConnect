import type { Metadata } from "next";
import { Suspense } from "react";
import "@/styles/pages/auth.css";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset Password" };

export default function ForgotPasswordPage() {
  return (
    <div className="page-auth">
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
