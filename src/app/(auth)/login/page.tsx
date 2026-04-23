import Link from "next/link";
import { redirect } from "next/navigation";
import { HxCard } from "@/components/hex/card";
import { HexWordmark } from "@/components/hex/logo";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
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
            Welcome back
          </h1>
          <p className="mb-6 text-[13px] text-[var(--hx-muted-fg)]">
            Log in to manage your hosts and game servers.
          </p>
          <LoginForm />
        </HxCard>
        <p className="mt-4 text-center text-[13px] text-[var(--hx-muted-fg)]">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-[var(--hx-accent-fg)] hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
