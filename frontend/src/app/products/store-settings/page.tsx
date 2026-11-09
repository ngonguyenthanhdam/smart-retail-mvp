import { StoreProductsPage } from '@/components/store-products-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.catalog.storeProducts };
}
export default function Page() {
  return <StoreProductsPage />;
}
