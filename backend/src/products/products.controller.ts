import { BadRequestException, Body, Controller, Get, Header, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { productBody, productUploadOptions } from './product-images';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProductsService } from './products.service';
@Controller('products')
@Roles('ADMIN')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}
  @Get('images/:filename')
  @Roles('ADMIN', 'STORE_MANAGER', 'STAFF')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  image(@Param('filename') filename: string, @CurrentUser() user: AuthenticatedUser) {
    return this.products.image(filename, user);
  }
  @Get()
  @Roles('ADMIN', 'STORE_MANAGER', 'STAFF')
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.products.list(query, user);
  }
  @Get(':id')
  @Roles('ADMIN', 'STORE_MANAGER', 'STAFF')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.products.detail(id, user);
  }
  @Post()
  @UseInterceptors(FileInterceptor('image', productUploadOptions))
  @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown, @UploadedFile() file?: Express.Multer.File) {
    return this.products.create(productBody(body), file);
  }
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', productUploadOptions))
  @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() body: unknown, @UploadedFile() file?: Express.Multer.File) {
    return this.products.update(id, productBody(body), file);
  }
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('image', productUploadOptions))
  uploadImage(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Select an image.');
    return this.products.update(id, { imagePath: null }, file);
  }
}
