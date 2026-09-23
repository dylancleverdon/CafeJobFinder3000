import { PageHeader } from "@/components/ui";
import ImportTools from "./ImportTools";

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import" subtitle="Bring in cafes from a file or a list — no APIs." />
      <ImportTools />
    </>
  );
}
