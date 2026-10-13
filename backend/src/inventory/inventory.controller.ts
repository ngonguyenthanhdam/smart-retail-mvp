import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { InventoryService } from './inventory.service';
@Controller('inventory')
@Roles('ADMIN', 'STORE_MANAGER', 'STAFF')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.inventory.list(query, user); }
  @Get(':locationId/:productId/lots')
  @Header('Cache-Control', 'no-store')
  lots(@Param('locationId') locationId: string, @Param('productId') productId: string, @CurrentUser() user: AuthenticatedUser) { return this.inventory.lots(locationId, productId, user); }
}
