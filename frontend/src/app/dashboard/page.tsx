import { DashboardPage } from '@/components/dashboard-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { reportCopy } = await getServerMessages();
  return { title: reportCopy.title };
}
export default function Page() {
  return <DashboardPage />;
}
