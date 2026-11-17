import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ResetForm } from "@/components/auth/ResetForm";
import { getUser } from "@/lib/auth";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage() {
  const { user } = await getUser();
  if (!user) redirect("/login?error=" + encodeURIComponent("Your reset link has expired. Request a new one."));
  return (
    <AuthFrame title="Choose a new password">
      <ResetForm />
    </AuthFrame>
  );
}
