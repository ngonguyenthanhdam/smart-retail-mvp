import { ReplenishmentPage } from '@/components/replenishment-page';
import { decisionCopy } from '@/i18n/vi';
import { Suspense } from 'react';
export const metadata = { title: decisionCopy.title };
export default function Page() { return <Suspense fallback={<p className="admin-loading" role="status">{decisionCopy.loading}</p>}><ReplenishmentPage /></Suspense>; }
