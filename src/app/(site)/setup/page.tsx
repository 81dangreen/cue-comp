import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { setupAction } from "@/actions/auth";
import { setupKeyRequired } from "@/lib/setup";
import { db } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Set up" };

export default function SetupPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Setup />
    </Suspense>
  );
}

async function Setup() {
  if ((await db.user.count()) > 0) redirect("/login");
  const needsKey = setupKeyRequired();
  return (
    <Card className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-bold">Set up your organisation</h1>
      <p className="mt-1 text-sm text-muted">You&apos;ll be the owner. You can add other organisers later.</p>
      <ActionForm action={setupAction} className="mt-5 space-y-4">
        {needsKey && (
          <Field label="Setup key" hint="The SETUP_KEY value from the server settings">
            <Input name="setupKey" type="password" required autoComplete="off" />
          </Field>
        )}
        <Field label="Club or league name">
          <Input name="organizationName" required placeholder="e.g. Riverside Pool Club" />
        </Field>
        <Field label="Your name">
          <Input name="name" required autoComplete="name" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <SubmitButton className="w-full" pendingText="Creating…">
          Create organisation
        </SubmitButton>
      </ActionForm>
    </Card>
  );
}
