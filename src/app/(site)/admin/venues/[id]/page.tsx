import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addTable, deleteTable, deleteVenue, updateTable, updateVenue } from "@/actions/venues";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TableTablets } from "@/components/admin/table-tablets";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Field, Input, PageHeader, PageSkeleton } from "@/components/ui";

export default function VenuePage({ params }: PageProps<"/admin/venues/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Venue params={params} />
    </Suspense>
  );
}

async function Venue({ params }: { params: PageProps<"/admin/venues/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const venue = await db.venue.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      tables: {
        orderBy: { sortOrder: "asc" },
        include: { devices: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, lastSeenAt: true } } },
      },
    },
  });
  if (!venue) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={venue.name} subtitle={venue.address} />

      <Card>
        <CardHeader
          title="Tables"
          subtitle="Each table has a stream overlay URL you can add as a browser source in OBS."
        />
        <ul className="divide-y divide-border">
          {venue.tables.map((table) => (
            <li key={table.id} className="flex flex-wrap items-end gap-3 px-5 py-3">
              <ActionForm action={updateTable.bind(null, table.id)} className="flex flex-1 flex-wrap items-end gap-2">
                <Input name="name" defaultValue={table.name} className="w-36" aria-label="Table name" />
                <Input
                  name="streamUrl"
                  defaultValue={table.streamUrl ?? ""}
                  placeholder="Stream URL (optional)"
                  className="min-w-40 flex-1"
                  aria-label="Stream URL"
                />
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
              <Link href={`/overlay/${table.id}`} target="_blank" className="pb-2 text-xs text-accent hover:underline">
                Overlay ↗
              </Link>
              <form action={async () => {
                "use server";
                await deleteTable(table.id);
              }}>
                <ConfirmButton variant="ghost" className="text-live" message={`Delete ${table.name}?`}>
                  Delete
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
        <ActionForm action={addTable.bind(null, venue.id)} className="flex gap-2 border-t border-border p-5" resetOnSuccess>
          <Input name="name" placeholder={`Table ${venue.tables.length + 1}`} className="max-w-48" />
          <SubmitButton variant="secondary">Add table</SubmitButton>
        </ActionForm>
      </Card>

      {venue.tables.length > 0 && <TableTablets tables={venue.tables} />}

      <Card>
        <CardHeader title="Venue details" />
        <ActionForm action={updateVenue.bind(null, venue.id)} className="space-y-3 p-5">
          <Field label="Name">
            <Input name="name" defaultValue={venue.name} required />
          </Field>
          <Field label="Address">
            <Input name="address" defaultValue={venue.address ?? ""} />
          </Field>
          <SubmitButton>Save</SubmitButton>
        </ActionForm>
      </Card>

      <form action={deleteVenue.bind(null, venue.id)}>
        <ConfirmButton variant="danger" message={`Delete ${venue.name} and all its tables?`}>
          Delete venue
        </ConfirmButton>
      </form>
    </div>
  );
}
