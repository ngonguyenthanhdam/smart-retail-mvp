import type { DictionaryShape } from '../types';
export const vi = {
  workspace: 'Không gian làm việc',
  subtitle: 'Cửa hàng trong tầm tay',
  preview: 'Xem trước',
  previewNote: 'Theo dõi hoạt động cửa hàng tại đây.',
  navigation: 'Điều hướng chính',
  toggleNavigation: 'Mở hoặc đóng menu',
  skipToContent: 'Đến nội dung chính',
  language: 'Tiếng Việt',
  languageLabel: 'Ngôn ngữ giao diện: Tiếng Việt',
  groups: {
    overview: 'Tổng quan',
    operations: 'Vận hành',
    planning: 'Kế hoạch',
  },
} as const;
export const en = {
  workspace: 'Retail workspace',
  subtitle: 'Operations & planning',
  preview: 'Preview',
  previewNote: 'Monitor store operations here.',
  navigation: 'Main navigation',
  toggleNavigation: 'Toggle navigation',
  skipToContent: 'Skip to main content',
  language: 'English',
  languageLabel: 'Interface language: English',
  groups: {
    overview: 'Overview',
    operations: 'Operations',
    planning: 'Planning',
  },
} satisfies DictionaryShape<typeof vi>;
