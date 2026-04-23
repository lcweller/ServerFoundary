import Link from "next/link";
import { redirect } from "next/navigation";
import { HxCard } from "@/components/hex/card";
import { HexWordmark } from "@/components/hex/logo";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: "var(--hx-app-bg)" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-5 flex justify-center">
          <HexWordmark size={18} />
        </div>
        <HxCard padding={32}>
          <h1
            className="m-0 mb-1 text-[20px] font-semibold"
            style={{ letterSpacing: "-0.02em" }}
          >
            Create your account
          </h1>
          <p className="mb-6 text-[13px] text-[var(--hx-muted-fg)]">
            Start hosting game servers in minutes.
          </p>
          <SignupForm />
        </HxCard>
        <p className="mt-4 text-center text-[13px] text-[var(--hx-muted-fg)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-[var(--hx-accent-fg)] hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
