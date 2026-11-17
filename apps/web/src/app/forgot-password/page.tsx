import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ForgotForm } from "@/components/auth/ForgotForm";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <AuthFrame title="Reset your password" subtitle="We'll email you a secure link." footer={<Link className="underline" href="/login">Back to sign in</Link>}>
      <ForgotForm />
    </AuthFrame>
  );
}
