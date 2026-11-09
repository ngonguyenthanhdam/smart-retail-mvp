import { LocationsPage } from '@/components/locations-page';
import { getServerMessages } from '@/i18n/server';

export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.sections.stores.label };
}

export default function StoresPage() {
  return <LocationsPage />;
}
