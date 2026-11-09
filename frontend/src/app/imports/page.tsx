import { ImportsPage } from '@/components/imports-page';
import { getServerMessages } from '@/i18n/server';
export async function generateMetadata() {
  const { importCopy } = await getServerMessages();
  return { title: importCopy.title };
}
export default function Page() {
  return <ImportsPage />;
}
