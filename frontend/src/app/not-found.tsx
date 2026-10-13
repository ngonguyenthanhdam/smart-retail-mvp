import Link from "next/link";

import { vi } from "@/i18n/vi";

export default function NotFound() {
  return (
    <div className="not-found">
      <p className="eyebrow">404</p>
      <h1>{vi.notFound.title}</h1>
      <p className="page-description">{vi.notFound.description}</p>
      <Link className="primary-link" href="/dashboard">
        {vi.notFound.back}
      </Link>
    </div>
  );
}
