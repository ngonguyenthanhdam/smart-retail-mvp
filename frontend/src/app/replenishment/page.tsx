import { ReplenishmentPage } from '@/components/replenishment-page';
import { getServerMessages } from '@/i18n/server';
import { Suspense } from 'react';
export async function generateMetadata() {
  const { decisionCopy } = await getServerMessages();
  return { title: decisionCopy.title };
}
export default async function Page() {
  const { decisionCopy } = await getServerMessages();
  return (
    <Suspense
      fallback={
        <p className="admin-loading" role="status">
          {decisionCopy.loading}
        </p>
      }
    >
      <ReplenishmentPage />
    </Suspense>
  );
}
