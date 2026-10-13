import type { SourceFile, SourceRow } from './import-file';

export function documentGroups(source: SourceFile, referenceField: string): SourceRow[][] {
  const groups = new Map<string, SourceRow[]>();
  for (const row of source.rows) {
    const key = row.values[referenceField] || `\0missing-${row.row}`;
    const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
  }
  return [...groups.values()];
}
