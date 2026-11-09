import { ForecastsPage } from '@/components/forecasts-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { forecastCopy } = await getServerMessages();
  return { title: forecastCopy.title };
}
export default function Page() {
  return <ForecastsPage />;
}
