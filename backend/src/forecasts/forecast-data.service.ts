import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { bodyObject, requiredText, uuidValue } from '../common/validation';
import { activeLocation, dateValue, writeActor } from '../common/operations';
import { addDays, businessDate } from '../inventory/expiry';
import { coveredDate, ForecastHistory, seriesAt } from './forecast-history';
import { DEMO_SOURCE } from './demo-source';

@Injectable()
export class ForecastDataService {
  constructor(private readonly prisma: PrismaService, private readonly history: ForecastHistory) {}
  async status(input: unknown, user: AuthenticatedUser) {
    const body = bodyObject(input, ['locationId']);
    const scope = resolveLocationScope(user, body.locationId === undefined ? undefined : uuidValue(body.locationId));
    const snapshot = await this.history.snapshot(scope); const selected = seriesAt(snapshot);
    return { origin: snapshot.origin, minimumHistoryDays: 30,
      eligibleCount: selected.eligible.length, skipped: selected.skipped,
      pairs: snapshot.pairs.map(p => ({ locationId: p.locationId, productId: p.productId, store: p.location?.name,
        product: p.product?.name, unit: p.product?.baseUnit?.symbol ?? p.product?.baseUnit?.code,
        coverage: snapshot.coverage.filter(c => c.locationId === p.locationId && c.productId === p.productId) })) };
  }
  async confirmCoverage(input: unknown, user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const body = bodyObject(input, ['locationId', 'productIds', 'periodStart', 'periodEnd', 'note']);
    const locationId = uuidValue(body.locationId);
    if (!Array.isArray(body.productIds) || !body.productIds.length || body.productIds.length > 100) throw new BadRequestException('Chọn 1–100 sản phẩm cần xác nhận lịch sử.');
    const productIds = [...new Set(body.productIds.map(value => uuidValue(value)))];
    const periodStart = dateValue(body.periodStart, 'Ngày bắt đầu'); const periodEnd = dateValue(body.periodEnd, 'Ngày kết thúc');
    if (periodEnd < periodStart || periodEnd >= new Date(businessDate()) || periodEnd.getTime() - periodStart.getTime() > 3660 * 86400000) {
      throw new BadRequestException('Khoảng dữ liệu phải nằm trong quá khứ, tối đa 10 năm.');
    }
    const note = requiredText(body.note, 'Ghi chú xác nhận dữ liệu đầy đủ, gồm cả ngày không bán', 500);
    return this.prisma.$transaction(async tx => {
      const actor = await writeActor(tx, user);
      if (actor.role !== 'ADMIN') throw new ForbiddenException();
      await activeLocation(tx, actor, locationId, true);
      const pairs = await tx.storeProduct.findMany({ where: { locationId, productId: { in: productIds }, isActive: true,
        product: { isActive: true, deletedAt: null, baseUnitId: { not: null } } }, include: { product: true, location: true } });
      if (pairs.length !== productIds.length) throw new BadRequestException('Sản phẩm phải đang được bán tại cửa hàng và có đơn vị cơ sở.');
      for (const p of pairs) {
        const source = p.product?.externalSource === DEMO_SOURCE || p.location?.externalSource === DEMO_SOURCE ? 'SYNTHETIC' : 'STORE_HISTORY';
        await tx.salesHistoryCoverage.upsert({ where: { locationId_productId_periodStart_periodEnd: { locationId, productId: p.productId!, periodStart, periodEnd } },
          create: { locationId, productId: p.productId!, periodStart, periodEnd, source, note, confirmedBy: user.id }, update: {} });
      }
      return { confirmedPairs: pairs.length, periodStart, periodEnd };
    }, { isolationLevel: 'Serializable' });
  }
  async exportCsv(input: unknown, user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const body = bodyObject(input, ['locationId', 'includeSynthetic']);
    if (body.includeSynthetic !== undefined && body.includeSynthetic !== 'true' && body.includeSynthetic !== 'false') throw new BadRequestException('includeSynthetic must be true or false.');
    const snapshot = await this.history.snapshot(body.locationId === undefined ? undefined : uuidValue(body.locationId));
    const lines = ['date,store_id,product_id,quantity,unit_code,source'];
    const cell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    for (const pair of snapshot.pairs) {
      const coverage = snapshot.coverage.filter(c => c.locationId === pair.locationId && c.productId === pair.productId);
      const first = coverage.map(c => c.periodStart.toISOString().slice(0, 10)).sort()[0];
      if (!first) continue;
      const values = new Map(snapshot.daily.filter(d => d.locationId === pair.locationId && d.productId === pair.productId).map(d => [d.date, d.quantity]));
      for (let date = first; date <= snapshot.origin; date = addDays(date, 1)) {
        if (!coveredDate(coverage, date)) continue;
        const source = pair.product?.externalSource === DEMO_SOURCE || pair.location?.externalSource === DEMO_SOURCE
          || coverage.some(c => c.source === 'SYNTHETIC' && coveredDate([c], date)) ? 'SYNTHETIC' : 'STORE_HISTORY';
        if (source === 'SYNTHETIC' && body.includeSynthetic !== 'true') continue;
        lines.push([date, pair.locationId, pair.productId, values.get(date) ?? '0', pair.product?.baseUnit?.code, source].map(cell).join(','));
        if (lines.length > 400000) throw new BadRequestException('Chọn một cửa hàng để xuất tối đa 400.000 dòng mỗi lần.');
      }
    }
    if (lines.length === 1) throw new BadRequestException('Chưa có lịch sử đã xác nhận phù hợp. Dữ liệu mô phỏng bị loại khỏi tập huấn luyện mặc định.');
    const csv = lines.join('\r\n') + '\r\n';
    return { csv, sha256: createHash('sha256').update(csv).digest('hex'), rows: lines.length - 1, origin: snapshot.origin };
  }
}
