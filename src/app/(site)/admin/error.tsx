"use client";

import { Button, Card } from "@/components/ui";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mx-auto max-w-lg p-6">
      <h2 className="font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">{error.message}</p>
      <Button className="mt-4" variant="secondary" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
