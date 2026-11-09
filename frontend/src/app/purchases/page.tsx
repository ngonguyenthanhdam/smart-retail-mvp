import { PurchasesPage } from '@/components/purchases-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.operations.purchases };
}
export default function Page() {
  return <PurchasesPage />;
}
