export const DEMO_SOURCE = 'RETAILSENSE_SYNTHETIC_V1';
export const DEMO_MODE = 'SYNTHETIC_DEMO';
export const demoForecastId = (n: number) => `d5202600-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const DEMO_JOB_ID = demoForecastId(900);
export const MODEL_VERSION = 'freshretail-demand-v1-lightgbm';
export const MODEL_ALGORITHM = 'LightGBM';
export const DEMO_NOTICE = 'Synthetic/demo backtest — not evidence of real-world forecasting accuracy.';
