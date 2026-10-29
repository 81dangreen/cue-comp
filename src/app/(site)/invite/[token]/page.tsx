import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { acceptInviteAction } from "@/actions/team";
import { ROLES, type Role } from "@/lib/constants";
import { findInvite, MIN_PASSWORD } from "@/lib/team";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Join the team", robots: { index: false } };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: { params: PageProps<"/invite/[token]">["params"] }) {
  const { token } = await params;
  const invite = await findInvite(token);
  if (!invite) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-bold">This invite link doesn&apos;t work any more</h1>
        <p className="mt-2 text-muted">It may have been used already, cancelled, or expired. Ask whoever sent it for a new one.</p>
        <Link href="/login" className="mt-4 inline-block text-accent hover:underline">
          Already have an account? Log in
        </Link>
      </Card>
    );
  }
  return (
    <Card className="mx-auto max-w-md p-6">
      <p className="text-sm font-semibold tracking-wide text-accent uppercase">{invite.organization.name}</p>
      <h1 className="mt-1 text-xl font-bold">You&apos;re invited to join as {ROLES[invite.role as Role].toLowerCase()}</h1>
      <p className="mt-1 text-sm text-muted">Create your login. You&apos;ll use your email and this password from now on.</p>
      <ActionForm action={acceptInviteAction.bind(null, token)} className="mt-5 space-y-4">
        <Field label="Your name">
          <Input name="name" required autoComplete="name" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password" hint={`At least ${MIN_PASSWORD} characters`}>
          <Input name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
        </Field>
        <Field label="Password again">
          <Input name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
        </Field>
        <SubmitButton className="w-full" pendingText="Creating your login…">
          Join {invite.organization.name}
        </SubmitButton>
      </ActionForm>
    </Card>
  );
}
