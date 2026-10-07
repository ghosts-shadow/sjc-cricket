import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Organiser sign in", robots: { index: false } };

export default function LoginPage(props: PageProps<"/admin/login">) {
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">Organiser sign in</h1>
        <p className="mt-1 text-sm text-muted">For entering results and live scoring.</p>
      </div>
      <Suspense>
        <NextPath searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function NextPath({ searchParams }: { searchParams: PageProps<"/admin/login">["searchParams"] }) {
  const next = (await searchParams).next;
  return <LoginForm next={typeof next === "string" ? next : ""} />;
}
