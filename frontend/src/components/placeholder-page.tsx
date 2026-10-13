"use client";

import { ArrowUpRight, Info } from "lucide-react";
import Link from "next/link";

import { vi } from "@/i18n/vi";
import { canAccessSection, findSection, type SectionId } from "@/lib/navigation";
import { useAuth } from "@/components/auth-provider";

const exploreSections = ["stores", "products", "inventory"] as const;

export function PlaceholderPage({ sectionId }: { sectionId: SectionId }) {
  const { user } = useAuth();
  const section = findSection(sectionId)!;
  const copy = vi.sections[sectionId];
  const Icon = section.icon;

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{vi.shell.groups[section.group]}</p>
          <h1>{copy.label}</h1>
          <p className="page-description">{copy.description}</p>
        </div>
        <span className="status-badge">
          <span aria-hidden="true" />
          {vi.placeholder.status}
        </span>
      </div>

      <div className="content-grid">
        <section className="placeholder-card" aria-labelledby="placeholder-title">
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">
              <Icon size={34} strokeWidth={1.5} />
            </div>
            <h2 id="placeholder-title">{copy.label}</h2>
            <p>{vi.placeholder.note}</p>
          </div>

        </section>

        <aside className="explore-card" aria-labelledby="explore-title">
          <h2 id="explore-title">{vi.placeholder.exploreTitle}</h2>
          <p className="explore-description">{vi.placeholder.exploreDescription}</p>
          <div className="explore-links">
            {exploreSections.filter((id) => user && canAccessSection(user.role, id)).map((id) => {
              const ExploreIcon = findSection(id)!.icon;

              return (
                <Link className="explore-link" href={`/${id}`} key={id}>
                  <span className="explore-icon" aria-hidden="true">
                    <ExploreIcon size={19} strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="explore-label">{vi.sections[id].label}</span>
                    <span className="explore-caption">{vi.placeholder.links[id]}</span>
                  </span>
                  <ArrowUpRight size={16} className="ml-auto shrink-0" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </aside>
      </div>

      <p className="page-note">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{vi.placeholder.note}</span>
      </p>
    </div>
  );
}
