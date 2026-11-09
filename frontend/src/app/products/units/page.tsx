import { UnitsPage } from '@/components/units-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.catalog.units };
}
export default function Page() {
  return <UnitsPage />;
}
