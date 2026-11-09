import { SalesPage } from '@/components/sales-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.operations.sales };
}
export default function Page() {
  return <SalesPage />;
}
