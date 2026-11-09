import type { DictionaryShape } from '../types';
export const vi = {
  status: 'Đang chuẩn bị',
  plannedTitle: 'Chức năng dự kiến',
  exploreTitle: 'Khám phá cửa hàng',
  exploreDescription: 'Mở chức năng bạn cần cho công việc hằng ngày.',
  links: {
    stores: 'Cửa hàng và kho trung tâm',
    products: 'Danh mục hàng hóa',
    inventory: 'Tồn kho theo địa điểm',
  },
  note: 'Chức năng này chưa sẵn sàng.',
} as const;
export const en = {
  status: 'Coming soon',
  plannedTitle: 'Planned for this space',
  exploreTitle: 'Explore the workspace',
  exploreDescription: 'Find the areas that support your day-to-day operations.',
  links: {
    stores: 'Your stores and central warehouse',
    products: 'Your shared product catalog',
    inventory: 'Stock across your locations',
  },
  note: 'This feature is not ready yet.',
} satisfies DictionaryShape<typeof vi>;
