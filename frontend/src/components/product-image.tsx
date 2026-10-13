'use client';

import Image from 'next/image';
import { Package } from 'lucide-react';
import { useState } from 'react';

export const imageCategories = ['vegetables', 'fruit', 'meat', 'seafood', 'milk', 'drinks', 'rice', 'noodles', 'canned', 'eggs', 'bakery', 'household'] as const;
export type ImageCategory = typeof imageCategories[number];
export function productImageKey(name: string, category?: string | null, key?: string | null): ImageCategory {
  if (imageCategories.includes(key as ImageCategory)) return key as ImageCategory;
  const text = `${name} ${category ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  const match: [ImageCategory, RegExp][] = [
    ['eggs', /\beggs?\b|\btrung\b/], ['canned', /canned|dong hop|ca hop|dau hop/], ['milk', /milk|sua|yogurt|cheese/], ['rice', /rice|gao/], ['noodles', /noodle|mi goi|mi an lien|bun|pho/], ['bakery', /bread|bakery|banh|pastry/], ['seafood', /fish|seafood|tom|ca tuoi|hai san/], ['meat', /meat|thit|chicken|pork|beef/], ['fruit', /fruit|banana|apple|orange|chuoi|tao|cam|trai cay/], ['drinks', /water|soda|drink|nuoc|do uong|coffee|tea/], ['vegetables', /vegetable|tomato|carrot|potato|rau|cu qua|ca chua|khoai|hanh/],
  ];
  return match.find(([, pattern]) => pattern.test(text))?.[0] ?? 'household';
}

export function ProductImage({ name, category, imageKey, className = '' }: { name: string; category?: string | null; imageKey?: string | null; className?: string }) {
  const key = productImageKey(name, category, imageKey);
  const [failed, setFailed] = useState<string | null>(null);
  return <div className={`product-image product-image-${key} ${className}`}>
    {failed === key ? <Package size={36} aria-hidden="true" /> : <Image unoptimized src={`/assets/products/${key}.webp`} width={320} height={240} alt={`Hình minh họa ${name}`} onError={() => setFailed(key)} />}
  </div>;
}
