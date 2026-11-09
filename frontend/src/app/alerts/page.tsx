import { AlertsPage } from '@/components/alerts-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { decisionCopy } = await getServerMessages();
  return { title: decisionCopy.alertsTitle };
}
export default function Page() {
  return <AlertsPage />;
}
