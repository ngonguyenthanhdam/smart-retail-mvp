import * as vietnamese from './vi';
import * as english from './en';
import { dashboardCopy } from './dashboard';
import { statusCopy } from './status';
import { planningCopy } from './planning';
import { planningEn } from './planning-en';
import type { Locale } from './types';
import { withFallback } from './fallback';

export const messages = {
  vi: { ...vietnamese, dashboardCopy: dashboardCopy.vi, statusCopy: statusCopy.vi, planningCopy },
  en: {
    vi: withFallback(vietnamese.vi, english.en),
    importCopy: withFallback(vietnamese.importCopy, english.importCopy),
    reportCopy: withFallback(vietnamese.reportCopy, english.reportCopy),
    forecastCopy: withFallback(vietnamese.forecastCopy, english.forecastCopy),
    decisionCopy: withFallback(vietnamese.decisionCopy, english.decisionCopy),
    dashboardCopy: withFallback(dashboardCopy.vi, dashboardCopy.en),
    statusCopy: withFallback(statusCopy.vi, statusCopy.en),
    planningCopy: withFallback(planningCopy, planningEn),
  },
};
export const getMessages = (locale: Locale) => messages[locale];
