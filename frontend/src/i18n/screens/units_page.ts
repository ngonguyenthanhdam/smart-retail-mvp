import type { DictionaryShape } from '../types';
export const vi = {
  allowFractionalQuantitiesForExample05: 'Cho phép số lượng lẻ (ví dụ 0,5 kg)',
  clearForCountUnitsSuchAsPieces: 'Bỏ chọn cho đơn vị đếm như cái, lon, bó hoặc bịch.',
} as const;
export const en = {
  allowFractionalQuantitiesForExample05: 'Allow fractional quantities (for example, 0.5 kg)',
  clearForCountUnitsSuchAsPieces: 'Clear for count units such as pieces, cans, bunches or bags.',
} satisfies DictionaryShape<typeof vi>;
