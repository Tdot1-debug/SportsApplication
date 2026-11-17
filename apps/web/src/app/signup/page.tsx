import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthFrame
      title="Create your account"
      subtitle="Coaches create a program next. Athletes: use the invitation link your coach sent you."
      footer={<p>Already have an account? <Link className="font-medium text-ink underline" href={`/login${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`}>Sign in</Link></p>}
    >
      <SignupForm next={sp.next} />
      <p className="mt-4 text-xs text-muted">By creating an account you agree to the <Link className="underline" href="/privacy">data use notice</Link>.</p>
    </AuthFrame>
  );
}
