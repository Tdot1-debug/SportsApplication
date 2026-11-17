import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { LoginForm } from "@/components/auth/LoginForm";
import { Notice } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reset?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthFrame
      title="Sign in"
      subtitle="Welcome back to your practice library."
      footer={
        <div className="space-y-2">
          <p><Link className="font-medium text-ink underline" href="/forgot-password">Forgot your password?</Link></p>
          <p>New here? <Link className="font-medium text-ink underline" href={`/signup${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`}>Create an account</Link></p>
        </div>
      }
    >
      {sp.error ? <div className="mb-4"><Notice tone="danger">{sp.error}</Notice></div> : null}
      {sp.reset ? <div className="mb-4"><Notice tone="ok">Password updated. Sign in with your new password.</Notice></div> : null}
      <LoginForm next={sp.next} />
    </AuthFrame>
  );
}
