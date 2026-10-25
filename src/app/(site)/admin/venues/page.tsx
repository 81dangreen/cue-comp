import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createVenue } from "@/actions/venues";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, EmptyState, Field, Input, PageHeader, PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Venues" };

export default function VenuesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Venues />
    </Suspense>
  );
}

async function Venues() {
  const user = await requireUser();
  const venues = await db.venue.findMany({
    where: { organizationId: user.organizationId },
    include: { _count: { select: { tables: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Venues & tables" subtitle="Tables are assigned to matches and power the live table view and stream overlays." />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          {venues.length === 0 ? (
            <EmptyState title="No venues yet" />
          ) : (
            <ul className="divide-y divide-border">
              {venues.map((v) => (
                <li key={v.id}>
                  <Link href={`/admin/venues/${v.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                    <div className="flex-1">
                      <div className="font-medium">{v.name}</div>
                      {v.address && <div className="text-sm text-muted">{v.address}</div>}
                    </div>
                    <span className="text-sm text-muted">{v._count.tables} tables</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Add venue" />
          <ActionForm action={createVenue} className="space-y-3 p-5">
            <Field label="Name">
              <Input name="name" required />
            </Field>
            <Field label="Address">
              <Input name="address" />
            </Field>
            <Field label="Number of tables">
              <Input name="tables" type="number" min={0} max={64} defaultValue={8} />
            </Field>
            <SubmitButton>Add venue</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
