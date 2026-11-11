import { BadRequestException, Injectable, Logger, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../database/prisma.service';
import { bodyObject } from '../common/validation';

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const productUploadOptions = { limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES, files: 1, fields: 1, parts: 2, fieldSize: 256 * 1024 } };

export function productBody(body: unknown) {
  if (body && typeof body === 'object' && 'data' in body) {
    const fields = bodyObject(body, ['data']);
    if (typeof fields.data !== 'string') throw new BadRequestException('Product data must be JSON.');
    try { return JSON.parse(fields.data) as unknown; }
    catch { throw new BadRequestException('Product data must be valid JSON.'); }
  }
  return body;
}

@Injectable()
export class ProductImages {
  private readonly directory: string;
  private readonly logger = new Logger(ProductImages.name);
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    this.directory = resolve(config.get<string>('PRODUCT_UPLOAD_DIR') || '.local/product-images');
  }

  async save(file: Express.Multer.File) {
    if (!file.buffer?.length || file.buffer.length > MAX_PRODUCT_IMAGE_BYTES)
      throw new BadRequestException('Select an image of at most 5 MB.');
    let extension: string;
    try {
      const decoder = sharp(file.buffer, { failOn: 'warning', limitInputPixels: 16_000_000 });
      const metadata = await decoder.metadata();
      const formats: Record<string, { mime: string; extension: string; suffix: RegExp }> = {
        png: { mime: 'image/png', extension: 'png', suffix: /\.png$/i },
        jpeg: { mime: 'image/jpeg', extension: 'jpg', suffix: /\.jpe?g$/i },
        webp: { mime: 'image/webp', extension: 'webp', suffix: /\.webp$/i },
      };
      const format = formats[metadata.format];
      if (!format || format.mime !== file.mimetype || !format.suffix.test(file.originalname) || (metadata.pages ?? 1) !== 1)
        throw new Error('Unsupported image');
      // Decode the full image to reject corrupt/truncated payloads, then store the original bytes.
      await decoder.raw().toBuffer();
      extension = format.extension;
    } catch {
      throw new BadRequestException('Select a valid, non-animated PNG, JPG or WebP image (maximum 16 megapixels).');
    }
    const filename = `${randomUUID()}.${extension}`;
    await mkdir(this.directory, { recursive: true });
    const target = resolve(this.directory, filename);
    const handle = await open(target, 'wx');
    try { await handle.writeFile(file.buffer); }
    catch (error) {
      await handle.close();
      await unlink(target).catch(() => undefined);
      throw error;
    }
    await handle.close();
    return { path: `/products/images/${filename}` };
  }

  private filename(path: string) {
    const filename = path.replace('/products/images/', '');
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(png|jpg|webp)$/.test(filename))
      throw new NotFoundException('Image not found.');
    return filename;
  }

  async read(path: string) {
    const filename = this.filename(path);
    let bytes: Buffer;
    try { bytes = await readFile(resolve(this.directory, filename)); }
    catch { throw new NotFoundException('Image not found.'); }
    return new StreamableFile(bytes, { type: filename.endsWith('.jpg') ? 'image/jpeg' : filename.endsWith('.png') ? 'image/png' : 'image/webp' });
  }

  async removeUncommitted(path: string) {
    try {
      // A lost commit acknowledgement must never cause deletion of a referenced image.
      if (!(await this.prisma.product.count({ where: { imagePath: path } })))
        await unlink(resolve(this.directory, this.filename(path)));
    } catch { this.logger.warn('An unreferenced upload may require later cleanup.'); }
  }
}
