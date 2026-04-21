import Link from "next/link";
import { redirect } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 text-primary">
            <Gamepad2 className="h-4 w-4" />
          </div>
          GameServerOS
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-xl">
          <h1 className="text-xl font-semibold">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Log in to manage your game servers.
          </p>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
