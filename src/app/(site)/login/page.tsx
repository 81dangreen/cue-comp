import type { Metadata } from "next";
import { Suspense } from "react";
import { loginAction } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Card className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Organiser log in</h1>
      <ActionForm action={loginAction} className="mt-5 space-y-4">
        <Suspense>
          <NextField searchParams={searchParams} />
        </Suspense>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="w-full" pendingText="Logging in…">
          Log in
        </SubmitButton>
      </ActionForm>
    </Card>
  );
}

async function NextField({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  return typeof next === "string" ? <input type="hidden" name="next" value={next} /> : null;
}
