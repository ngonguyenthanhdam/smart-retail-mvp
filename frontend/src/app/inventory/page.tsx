import { InventoryPage } from '@/components/inventory-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.inventory.title };
}
export default function Page() {
  return <InventoryPage />;
}
