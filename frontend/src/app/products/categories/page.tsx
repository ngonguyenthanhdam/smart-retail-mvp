import { CategoriesPage } from '@/components/categories-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.catalog.categories };
}
export default function Page() {
  return <CategoriesPage />;
}
