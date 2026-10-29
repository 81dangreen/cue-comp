import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { resetPasswordAction } from "@/actions/team";
import { findReset, MIN_PASSWORD } from "@/lib/team";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPage({ params }: PageProps<"/reset/[token]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reset params={params} />
    </Suspense>
  );
}

async function Reset({ params }: { params: PageProps<"/reset/[token]">["params"] }) {
  const { token } = await params;
  const reset = await findReset(token);
  if (!reset) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-bold">This reset link doesn&apos;t work any more</h1>
        <p className="mt-2 text-muted">It may have been used already or expired. Ask an organiser on your team for a new one.</p>
        <Link href="/login" className="mt-4 inline-block text-accent hover:underline">
          Back to log in
        </Link>
      </Card>
    );
  }
  return (
    <Card className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-bold">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted">
        For {reset.user.name} ({reset.user.email}). You&apos;ll be signed out on any other devices.
      </p>
      <ActionForm action={resetPasswordAction.bind(null, token)} className="mt-5 space-y-4">
        <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
          <Input name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
        </Field>
        <Field label="New password again">
          <Input name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
        </Field>
        <SubmitButton className="w-full" pendingText="Saving…">
          Save and log in
        </SubmitButton>
      </ActionForm>
    </Card>
  );
}
