import type { Metadata } from "next";

import { LocationsPage } from "@/components/locations-page";
import { vi } from "@/i18n/vi";

export const metadata: Metadata = { title: vi.sections.stores.label };

export default function StoresPage() {
  return <LocationsPage />;
}
