"use client";

import { Button } from "./ui";

/** Opens the browser's print dialog (which also offers "Save as PDF"). */
export function PrintButton({ children = "Print or save as PDF" }: { children?: React.ReactNode }) {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      {children}
    </Button>
  );
}
