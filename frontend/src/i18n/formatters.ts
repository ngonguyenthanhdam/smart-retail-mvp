'use client';
import { useMemo } from 'react';
import { useLocale } from './provider';
import * as format from '@/lib/format';
import { displayDate as date } from '@/lib/operations';

export function useFormatters() {
  const { locale } = useLocale();
  return useMemo(
    () => ({
      unitLabel: (unit: Parameters<typeof format.unitLabel>[0]) => format.unitLabel(unit, locale),
      formatUnit: (unit: Parameters<typeof format.formatUnit>[0]) =>
        format.formatUnit(unit, locale),
      formatQuantityWithUnit: (
        value: format.NumericValue,
        unit?: Parameters<typeof format.formatUnit>[0],
      ) => format.formatQuantityWithUnit(value, unit, locale),
      formatTimestamp: (value: string) => format.formatTimestamp(value, locale),
      formatMonth: (value: string) => format.formatMonth(value, locale),
      displayDate: (value: string | null) => date(value, locale),
      dateText: (value: string) => format.formatTimestamp(value, locale),
    }),
    [locale],
  );
}
