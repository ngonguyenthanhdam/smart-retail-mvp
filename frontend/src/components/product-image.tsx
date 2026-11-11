'use client';
import Image from 'next/image';
import { CloudUpload } from 'lucide-react';
import { useState } from 'react';
import { apiUrl } from '@/lib/api';

// Explicitly verified bundled files. The mapping never depends on a product's display name.
export const productIllustrations = {
  vegetables: '/assets/products/vegetables.webp',
  fruit: '/assets/products/fruit.webp',
  meat: '/assets/products/meat.webp',
  seafood: '/assets/products/seafood.webp',
  milk: '/assets/products/milk.webp',
  drinks: '/assets/products/drinks.webp',
  rice: '/assets/products/rice.webp',
  noodles: '/assets/products/noodles.webp',
  canned: '/assets/products/canned.webp',
  eggs: '/assets/products/eggs.webp',
  bakery: '/assets/products/bakery.webp',
  household: '/assets/products/household.webp',
} as const;

export function ProductImage({ name, imagePath, imageKey, previewUrl, className = '' }: {
  name: string;
  imagePath?: string | null;
  previewUrl?: string;
  category?: string | null;
  imageKey?: string | null;
  className?: string;
}) {
  const bundled = imageKey && Object.hasOwn(productIllustrations, imageKey)
    ? productIllustrations[imageKey as keyof typeof productIllustrations] : null;
  const src = previewUrl ?? (imagePath?.startsWith('/assets/products/')
    ? imagePath
    : imagePath?.startsWith('/products/images/') ? `${apiUrl}${imagePath}` : imagePath ? null : bundled);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className={`product-image ${bundled ? `product-image-${imageKey}` : ''} ${className}`}>
      {!src || failed === src ? (
        <span role="img" aria-label={name}><CloudUpload size={36} aria-hidden="true" /></span>
      ) : (
        <Image unoptimized src={src} width={320} height={240} alt={name} onError={() => setFailed(src)} />
      )}
    </div>
  );
}
