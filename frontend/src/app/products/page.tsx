import { ProductsPage } from '@/components/products-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.catalog.products };
}
export default function Page() {
  return <ProductsPage />;
}
