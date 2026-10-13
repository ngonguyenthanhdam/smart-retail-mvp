import { ProductsPage } from "@/components/products-page";
import { vi } from "@/i18n/vi";
export const metadata = { title: vi.catalog.products };
export default function Page() { return <ProductsPage />; }
