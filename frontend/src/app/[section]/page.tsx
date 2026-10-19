import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlaceholderPage } from "@/components/placeholder-page";
import { vi } from "@/i18n/vi";
import { findSection, navigation } from "@/lib/navigation";

type PageProps = { params: Promise<{ section: string }> };

export function generateStaticParams() {
  return navigation.filter(({ id }) => !["stores", "users", "products", "inventory", "purchases", "sales", "expenses", "imports", "dashboard", "forecasts", "replenishment", "alerts", "ai-center"].includes(id)).map(({ id }) => ({ section: id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const section = findSection((await params).section);

  return { title: section ? vi.sections[section.id].label : vi.notFound.title };
}

export default async function SectionPage({ params }: PageProps) {
  const section = findSection((await params).section);

  if (!section) notFound();

  return <PlaceholderPage sectionId={section.id} />;
}
