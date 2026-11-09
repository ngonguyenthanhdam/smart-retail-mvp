import type { DictionaryShape } from '../types';
export const vi = {
  title: 'Không tìm thấy trang',
  description: 'Trang này không tồn tại. Hãy quay lại không gian làm việc.',
  back: 'Về trang chính',
} as const;
export const en = {
  title: 'Page not found',
  description: 'This page does not exist. Return to your dashboard to continue.',
  back: 'Back to dashboard',
} satisfies DictionaryShape<typeof vi>;
