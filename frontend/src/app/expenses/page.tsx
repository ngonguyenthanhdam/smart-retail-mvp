import { ExpensesPage } from '@/components/expenses-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.operations.expenses };
}
export default function Page() {
  return <ExpensesPage />;
}
