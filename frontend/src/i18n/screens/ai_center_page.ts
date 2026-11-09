import type { DictionaryShape } from '../types';
export const vi = {
  dataForecastsAndAnswersForYourStore: 'Dữ liệu, dự báo và câu trả lời cho cửa hàng.',
  onlyChangesVisibilityTasksAndConversationsAre:
    'Chỉ ẩn/hiện giao diện. Tác vụ và hội thoại vẫn được giữ nguyên.',
  showTheTrainingWorkflow: 'Hiển thị quy trình huấn luyện',
  aiCenterSections: 'Khu vực AI Center',
  trainingData: 'Dữ liệu huấn luyện',
  trainingResults: 'Huấn luyện & kết quả',
  businessAssistant: 'Trợ lý kinh doanh',
  loadingAiCenter: 'Đang tải AI Center…',
} as const;
export const en = {
  dataForecastsAndAnswersForYourStore: 'Data, forecasts and answers for your store.',
  onlyChangesVisibilityTasksAndConversationsAre:
    'Only changes visibility. Tasks and conversations are preserved.',
  showTheTrainingWorkflow: 'Show the training workflow',
  aiCenterSections: 'AI Center sections',
  trainingData: 'Training data',
  trainingResults: 'Training & results',
  businessAssistant: 'Business assistant',
  loadingAiCenter: 'Loading AI Center…',
} satisfies DictionaryShape<typeof vi>;
