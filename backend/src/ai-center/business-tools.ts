import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { ReportsService } from '../reports/reports.service';
import { AlertsService } from '../alerts/alerts.service';
import { TrainingService } from './training.service';
import { bodyObject } from '../common/validation';
import { addDays, businessDate } from '../inventory/expiry';
import { demandWindow, savedSeries } from '../forecasts/forecast-period';
import { aiError, checkScope } from './ai-core';

const dateProperties = { from: { type: 'string', description: 'Inclusive Vietnam date YYYY-MM-DD' }, to: { type: 'string', description: 'Inclusive Vietnam date YYYY-MM-DD' } };
export const BUSINESS_TOOLS = [
  ['getSalesSummary', 'Đọc doanh thu bán hàng, giá vốn và lợi nhuận gộp. Hỗ trợ một ngày: đặt from và to cùng ngày. Hỗ trợ tuần/tháng: đặt ngày đầu và cuối kỳ.'],
  ['getTopSellingProducts', 'Tối đa năm sản phẩm bán chạy; giữ đơn vị từng sản phẩm.'],
  ['getRevenueComparison', 'So sánh doanh thu khoảng ngày với khoảng trước đó cùng độ dài.'],
  ['getExpenseSummary', 'Tổng chi phí trong khoảng ngày.'],
  ['getInventoryAlerts', 'Cảnh báo tồn kho đã lưu; không tự tạo hoặc cập nhật cảnh báo.'],
  ['getForecastResults', 'Đọc dự báo đã lưu cho 7 hoặc 30 ngày từ hôm nay; không chạy dự báo mới.'],
  ['getReplenishmentSuggestions', 'Đọc đề xuất nhập đã lưu; không tạo phiếu nhập.'],
  ['getModelStatus', 'Thuật toán ACTIVE và bằng chứng chất lượng được phép xem.'],
].map(([name, description]) => ({ type: 'function', function: { name, description, parameters: { type: 'object', additionalProperties: false,
  properties: name === 'getForecastResults' ? { days: { type: 'integer', enum: [7, 30] } } : ['getInventoryAlerts','getReplenishmentSuggestions','getModelStatus'].includes(name!) ? {} : dateProperties,
  required: name === 'getForecastResults' ? ['days'] : ['getInventoryAlerts','getReplenishmentSuggestions','getModelStatus'].includes(name!) ? [] : ['from', 'to'] } } }));
export type BusinessSource = { tool: string; scope: string; from: string | null; to: string | null; asOf: string; kind: 'ACTUAL' | 'FORECAST' | 'MODEL';
  label: string; rows: Record<string, string | number | null>[]; note?: string };

@Injectable()
export class BusinessTools {
  constructor(private readonly db: PrismaService, private readonly auth: AuthService, private readonly reports: ReportsService,
    private readonly alerts: AlertsService, private readonly training: TrainingService) {}
  async execute(name: string, input: unknown, sessionScope: string | null, user: AuthenticatedUser): Promise<BusinessSource> {
    const actor = await this.auth.currentUser(user.id); checkScope(actor, sessionScope);
    if (!BUSINESS_TOOLS.some(t => t.function.name === name)) aiError('ACCESS_DENIED', 'Công cụ không được cho phép.', 403);
    const args = bodyObject(input ?? {}, name === 'getForecastResults' ? ['days'] : ['getInventoryAlerts','getReplenishmentSuggestions','getModelStatus'].includes(name) ? [] : ['from', 'to']);
    const scope = sessionScope ? await this.db.location.findUnique({ where: { id: sessionScope }, select: { name: true, isActive: true, deletedAt: true } }) : null;
    if (sessionScope && (!scope || scope.deletedAt || !scope.isActive)) aiError('ACCESS_DENIED', 'Cửa hàng không khả dụng.', 403);
    const result: BusinessSource = { tool: name, scope: scope?.name ?? 'Toàn hệ thống', from: null, to: null, asOf: new Date().toISOString(), kind: 'ACTUAL', label: name, rows: [] };
    const scopeQuery = sessionScope ? { locationId: sessionScope } : {};
    if (['getSalesSummary','getTopSellingProducts','getRevenueComparison','getExpenseSummary'].includes(name)) {
      const report = await this.reports.dashboard({ ...args, ...scopeQuery }, actor);
      result.from = report.from; result.to = report.to;
      if (name === 'getSalesSummary') { result.label = 'Báo cáo bán hàng'; result.rows = [{ 'Doanh thu (VND)': report.metrics.revenue, 'Giá vốn (VND)': report.metrics.cogs, 'Lợi nhuận gộp (VND)': report.metrics.grossProfit, 'Hóa đơn': report.metrics.invoices }]; }
      if (name === 'getExpenseSummary') { result.label = 'Báo cáo chi phí'; result.rows = [{ 'Chi phí (VND)': report.metrics.expenses }]; }
      if (name === 'getTopSellingProducts') {
        result.label = 'Sản phẩm bán chạy'; result.rows = report.topProducts.slice(0, 5).map(p => ({ 'Mã': p.sku, 'Sản phẩm': p.name, 'Số lượng': p.quantity, 'Đơn vị': p.unit }));
        result.note = 'Xếp theo trị số lượng bán; không cộng hoặc diễn giải kg và cái như cùng một đơn vị.';
      }
      if (name === 'getRevenueComparison') {
        const days = Math.round((Date.parse(report.to) - Date.parse(report.from)) / 86400000) + 1;
        const previous = await this.reports.dashboard({ from: addDays(report.from, -days), to: addDays(report.from, -1), ...scopeQuery }, actor);
        const change = new Prisma.Decimal(report.metrics.revenue).sub(previous.metrics.revenue);
        result.label = 'So sánh doanh thu'; result.rows = [{ 'Kỳ này (VND)': report.metrics.revenue, 'Kỳ trước (VND)': previous.metrics.revenue,
          'Chênh lệch (VND)': change.toFixed(2), 'Thay đổi (%)': new Prisma.Decimal(previous.metrics.revenue).isZero() ? null : change.div(previous.metrics.revenue).mul(100).toFixed(2),
          'Từ ngày kỳ trước': previous.from, 'Đến ngày kỳ trước': previous.to }];
      }
      result.note = [result.note, 'Nguồn là bản ghi hiện có, có thể bao gồm dữ liệu import hoặc demo. Báo cáo này không chứng minh đây là giao dịch thực ngoài đời.'].filter(Boolean).join(' ');
      return result;
    }
    if (name === 'getInventoryAlerts') {
      const alerts = await this.alerts.list({ ...scopeQuery, status: 'OPEN', pageSize: '10' }, actor);
      result.label = 'Cảnh báo tồn kho đã lưu'; result.rows = alerts.items.map(a => ({ 'Sản phẩm': a.product?.name ?? '', 'Cửa hàng': a.location?.name ?? '', 'Loại': a.alertType, 'Mức độ': a.severity, 'Nội dung': a.message, 'Phát hiện': a.detectedAt.toISOString() }));
      result.note = 'Đây là cảnh báo ở lần kiểm tra đã lưu; không khẳng định tồn kho đã được đánh giá lại lúc trò chuyện.'; return result;
    }
    if (name === 'getReplenishmentSuggestions') {
      const recommendations = await this.db.replenishmentRecommendation.findMany({ where: { ...scopeQuery, decisionStatus: 'PENDING' }, include: { product: { include: { baseUnit: true } }, location: true, forecast: true }, orderBy: { forecast: { createdAt: 'desc' } }, take: 10 });
      result.kind = 'FORECAST'; result.label = 'Đề xuất nhập đang chờ xem xét'; result.rows = recommendations.map(r => ({ 'Sản phẩm': r.product.name, 'Cửa hàng': r.location.name, 'Đề xuất': r.recommendedQuantity.toString(), 'Đơn vị': r.product.baseUnit?.code ?? '', 'Tạo lúc': r.forecast.createdAt.toISOString() }));
      result.note = 'Snapshot đề xuất đã lưu; cần người quản lý kiểm tra và duyệt tại trang Đề xuất nhập hàng.'; return result;
    }
    if (name === 'getForecastResults') {
      const days = args.days ?? 7;
      if (days !== 7 && days !== 30) aiError('INVALID_FORMAT', 'Chỉ đọc cửa sổ dự báo 7 hoặc 30 ngày.');
      const from = businessDate(), to = addDays(from, days - 1);
      result.kind = 'FORECAST'; result.from = from; result.to = to; result.label = 'Dự báo đã lưu';
      const runs = await this.db.forecastRun.findMany({ where: { status: 'COMPLETED', ...(sessionScope ? { forecasts: { some: { locationId: sessionScope } } } : {}) },
        orderBy: { startedAt: 'desc' }, take: 5, include: { forecasts: { where: scopeQuery, include: { product: { include: { baseUnit: true } }, location: true } } } });
      const seen = new Set<string>();
      for (const run of runs) for (const series of savedSeries(run.dailyPredictions)) {
        if (sessionScope && series.locationId !== sessionScope) continue;
        const key = `${series.locationId}/${series.productId}`;
        if (seen.has(key)) continue;
        const window = demandWindow(run.dailyPredictions, series.locationId, series.productId, from, days);
        if (!window) continue;
        const item = run.forecasts.find(f => f.locationId === series.locationId && f.productId === series.productId);
        if (!item) continue;
        seen.add(key); const quantity = window.quantity;
        result.rows.push({ 'Sản phẩm': item.product.name, 'Cửa hàng': item.location.name, 'Lượng dự kiến': quantity.toFixed(4), 'Đơn vị': item.product.baseUnit?.code ?? '',
          'Doanh thu dự kiến (VND)': quantity.mul(item.estimatedUnitPrice).toFixed(2), 'Nguồn dữ liệu': series.dataSource, 'Model': run.modelVersion, 'Chạy lúc': run.startedAt.toISOString() });
        if (result.rows.length >= 10) break;
      }
      result.rows = result.rows.slice(0, 10);
      result.note = 'Chỉ hiển thị chuỗi đã lưu đủ các ngày được hỏi. Nếu trống, cần cập nhật dự báo ở trang Dự báo bán hàng. Đây là ước tính, chưa chứng minh độ chính xác tại cửa hàng.'; return result;
    }
    const info = await this.training.active(); result.kind = 'MODEL'; result.label = 'Model ACTIVE';
    result.rows = [{ 'Phiên bản': info.model_version, 'Thuật toán': info.algorithm, 'Độ chính xác cửa hàng thực tế': 'Chưa được chứng minh' }];
    // A manager must never receive model report rows from other stores through tool context.
    if (actor.role === 'ADMIN') {
      const validation = info.validation as { test?: Record<string, { by_unit?: Record<string, { daily: { wape: number | null; mae: number; rmse: number; bias: number | null } }> }> } | undefined;
      for (const horizon of ['7','30']) for (const [unit, metrics] of Object.entries(validation?.test?.[horizon]?.by_unit ?? {})) {
        result.rows.push({ 'Phiên bản': info.model_version, 'Cửa sổ (ngày)': Number(horizon), 'Đơn vị nguồn': unit,
          'WAPE (%)': metrics.daily.wape === null ? null : Number((metrics.daily.wape * 100).toFixed(4)),
          'MAE': metrics.daily.mae, 'RMSE': metrics.daily.rmse,
          'Bias (%)': metrics.daily.bias === null ? null : Number((metrics.daily.bias * 100).toFixed(4)) });
      }
      result.note = `Đánh giá test độc lập trên ${String(info.validation_source)}; không phải bằng chứng độ chính xác tại cửa hàng RetailSense.`;
    }
    return result;
  }
}
