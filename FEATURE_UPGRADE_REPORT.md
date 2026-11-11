# Báo cáo nâng cấp Smart Retail MVP — 11/11/2026

## 1. Tổng quan

Đã nâng cấp theo kiến trúc thực tế: NestJS + Prisma/PostgreSQL, Next.js/React và các component/CSS hiện có. Không đổi framework hoặc thêm shadcn. ADMIN quản lý master product, giá/ngưỡng mặc định, chọn cửa hàng và All Stores; STORE_MANAGER chỉ chỉnh ba thông số của cửa hàng mình; STAFF là vai trò duy nhất tạo hóa đơn POS.

Phần ảnh áp dụng **yêu cầu bổ sung mới nhất**: tái sử dụng `frontend/public/assets/`, giữ nguyên toàn bộ ảnh cũ; không có thư mục `public/image`, `image_products`, `image_store`. Không cần chuẩn bị thêm ảnh. Upload, preview, chọn ảnh có sẵn và Cloud Upload placeholder đã được triển khai và kiểm thử.

## 2. Database và dữ liệu cũ

Migration additive `20261111010000_product_defaults_assignment_images` thêm vào `products`:

| Field PostgreSQL | Kiểu / mặc định | Ý nghĩa |
| --- | --- | --- |
| `image_path` | VARCHAR(500), nullable | Ảnh chung của sản phẩm |
| `default_selling_price` | DECIMAL(14,2), nullable cho dữ liệu cũ | Giá mặc định phải > 0 khi tạo/gán mới |
| `default_min_stock_level` | DECIMAL(14,4), 0 | Mức tồn tối thiểu, >= 0 |
| `default_safety_stock` | DECIMAL(14,4), 0 | Tồn an toàn, >= 0 |
| `is_global_all_stores` | BOOLEAN, false | Ghi nhớ All Stores; bắt buộc giá mặc định hợp lệ |

Không suy đoán giá master từ giá riêng của một cửa hàng. Các sản phẩm cũ giữ giá cửa hàng; ADMIN bổ sung giá master trước khi gán sang cửa hàng mới hoặc bật All Stores.

Đã backup và áp dụng migration cho cả `retailsense_test` và database ứng dụng `retailsense`. Backup ứng dụng đã kiểm tra được danh mục bằng `pg_restore --list`:

`.local/backups/retailsense-before-product-upgrade-1794364289698.dump` (280.759 bytes).

Đối chiếu trước/sau migration: 12 sản phẩm, 4 địa điểm, 36 cấu hình cửa hàng, 3 lô tồn, 267 hóa đơn, 2.655 dòng bán, 3 đơn mua và 36 coverage giữ nguyên. Checksum toàn bộ hàng của `sales`, `sale_items`, `inventory_lots`, `store_products` giống trước migration. Cả 12 `image_key` cũ còn nguyên. Không reset hoặc xóa dữ liệu.

## 3. Backend và phân quyền

| API | Hành vi |
| --- | --- |
| `POST /products`, `PATCH /products/:id` | ADMIN; lưu master, defaults và phân bổ trong cùng transaction; nhận JSON hoặc multipart với `data` JSON và `image` |
| `POST /store-products/batch` | ADMIN; đồng bộ danh sách cửa hàng cho một sản phẩm, bật/tắt All Stores |
| `POST /store-products` | ADMIN; gán một cửa hàng, dùng defaults nếu bỏ qua giá/ngưỡng; gán lại không trùng hoặc ghi đè giá/ngưỡng cũ |
| `PATCH /store-products/:id` | ADMIN hoặc manager đúng cửa hàng; manager chỉ được gửi `sellingPrice`, `minStockLevel`, `safetyStock` |
| `POST /products/:id/image` | ADMIN; upload ảnh thay cho ảnh master hiện tại |
| `GET /products/images/:filename` | Có đăng nhập, kiểm tra sản phẩm/phạm vi cửa hàng; STAFF chỉ đọc ảnh sản phẩm đang bán |
| `POST /sales` | Chỉ STAFF; ADMIN/STORE_MANAGER nhận 403 |

Batch nhận `productId`, `storeIds`, `isGlobalAllStores` (mặc định false), `confirmDiscontinue`, `applyDefaultsToExisting`. Chuyển All Stores sang chọn riêng phải có danh sách cửa hàng. Gán mới sao chép defaults, không tạo `inventory_lots`. Giá/ngưỡng đã tùy chỉnh được giữ khi gán lại hoặc kích hoạt lại; chỉ ghi đè khi ADMIN chủ động chọn áp dụng defaults.

Tạo/kích hoạt lại cửa hàng tự gán các master global đang active. Các thao tác dùng transaction Serializable và retry xung đột đã rollback; unique `(location_id, product_id)` tiếp tục bảo vệ bản ghi. Đã kiểm tra yêu cầu gán đồng thời và tạo đồng thời cửa hàng/master global.

Ngừng master hoặc bỏ cửa hàng còn tồn trả 409 `STOCK_REMAINS_CONFIRMATION_REQUIRED`, kèm số lượng theo địa điểm. Xác nhận dùng `confirmDiscontinue: true`; giữ nguyên lô tồn, hóa đơn và COGS. Nhận hàng của đơn mua đã có vẫn hoạt động sau khi master ngừng bán. Không đổi FEFO/FIFO hoặc phép tính snapshot.

Upload kiểm tra phần mở rộng, MIME và giải mã đầy đủ PNG/JPEG/WebP bằng `sharp`, giới hạn 5 MB, 16 megapixels, ảnh tĩnh. Lưu nguyên bytes với tên UUID, không ghi đè ảnh cũ; JSON không được tự trỏ đến upload của sản phẩm khác. Nếu transaction thất bại, chỉ dọn upload mới chưa có tham chiếu. File thiếu trả 404 và frontend hiện placeholder.

## 4. Frontend và hình ảnh

Product Form bổ sung defaults, chọn nhiều cửa hàng, All Stores, lựa chọn chủ động áp dụng lại defaults, upload/preview/xóa liên kết ảnh/chọn thư viện ảnh có sẵn. Form gán một cửa hàng tự điền defaults khi chọn sản phẩm. Các trường và thông báo mới có VI/EN; đổi ngôn ngữ giữ dữ liệu đang nhập.

`ProductImage` là resolver chung: ưu tiên `imagePath`, tương thích `imageKey` cũ, không suy đoán ảnh theo tên. Danh mục, cấu hình cửa hàng, POS, tồn kho, dự báo, cảnh báo và đề xuất nhập dùng chung resolver. Ảnh thiếu hoặc lỗi hiện Cloud Upload. Đổi tên sản phẩm không thay ảnh; cửa hàng dùng chung ảnh master. Icon trong Product Form của ADMIN mở chọn file; placeholder tại màn hình xem chỉ mang tính hiển thị.

Ảnh thư viện giữ tại `frontend/public/assets/products/`; ảnh cửa hàng/hero hiện có không thay đổi. Upload mới lưu ở `backend/.local/product-images` với cấu hình mặc định khi backend chạy từ thư mục của nó. Có thể đặt `PRODUCT_UPLOAD_DIR` đến thư mục lưu trữ bền vững. Ảnh upload được phục vụ qua API có quyền truy cập, không đưa vào thư mục source công khai.

ADMIN/manager thấy **Lịch sử bán hàng**, route `/sales/history`; truy cập trực tiếp `/sales` được chuyển sang lịch sử. STAFF vẫn có POS và lịch sử. Màn hình tồn kho cho quản lý thể hiện sản phẩm ngừng bán còn tồn. Đã xem ảnh chụp form ở 375px/1440px; form cuộn được, không tràn ngang.

## 5. Demo Data

Seed forecasting v2 hỗ trợ 20 sản phẩm. Tám sản phẩm thêm:

| SKU | Sản phẩm | Đơn vị | Giá demo (VND) | Ảnh hiện có / fallback |
| --- | --- | --- | ---: | --- |
| FC-13 | Cá phi lê | KG | 120.000 | `seafood.webp` |
| FC-14 | Thịt gà | KG | 85.000 | Cloud Upload |
| FC-15 | Sữa chua hộp | PCS | 7.000 | Cloud Upload |
| FC-16 | Dầu ăn 1 lít | PCS | 45.000 | Cloud Upload |
| FC-17 | Nước rửa chén 750 ml | PCS | 32.000 | `household.webp` |
| FC-18 | Táo | KG | 55.000 | `fruit.webp` |
| FC-19 | Cà phê gói 250 g | PCS | 65.000 | Cloud Upload |
| FC-20 | Khăn giấy hộp | PCS | 18.000 | Cloud Upload |

Các ảnh được chọn là minh họa nhóm hàng có sẵn; không tạo ảnh ngoài hoặc thay thế ảnh người dùng. Các ảnh không phù hợp với hàng mới được để placeholder.

| Cửa hàng demo | Sản phẩm active | Số lượng |
| --- | --- | ---: |
| A / FC-ST1 | FC-1–FC-12 | 12 |
| B / FC-ST2 | FC-1–FC-10, FC-13–FC-17 | 15 |
| C / FC-ST3 | FC-1–FC-7, FC-18–FC-20 | 10 |

Giữ cách đặt SKU cũ `FC-1` thay vì đổi mã thành `FC-01`. Demo không bật global để tránh tự gán vào cửa hàng nghiệp vụ khác. All Stores được kiểm tra riêng bằng integration tests.

Seed mới có 37 cặp active. Nâng từ v1 giữ 36 liên kết cũ, ngừng 7 liên kết và thêm 8 liên kết mới: tổng 44 bản ghi, 37 active. Giữ nguyên hóa đơn/lô tồn/giá tùy chỉnh cũ; lịch sử mới có import job synthetic riêng và coverage chỉ dành cho cặp mới. Chạy lại không nhân đôi; xung đột provenance/ngày hoặc tồn cần xác nhận sẽ rollback toàn bộ.

**Chưa chạy seed vào database ứng dụng:** `retailsense` có giao dịch vận hành và vẫn giữ 12 sản phẩm hiện tại. Bộ 20 sản phẩm và nâng cấp v1→v2 đã được chạy kiểm thử trên database test riêng. Đây là việc tách seed khỏi dữ liệu thực theo yêu cầu, không phải migration thiếu dữ liệu.

## 6. AI Forecasting

Không đổi thuật toán, model, checkpoint hoặc service ML. Backend chỉ nhận diện thêm import job synthetic của lượt nâng cấp và trả `imagePath` trong metadata.

Kiểm thử forecasting với v2 xác nhận 36 cặp đủ lịch sử 90 ngày chạy được, một cặp FC-12 tại A chỉ có 14 ngày nhận `INSUFFICIENT_HISTORY`. Coverage không được tự tạo cho cặp không kinh doanh. Dữ liệu synthetic vẫn được đánh dấu và không được dùng như bằng chứng chất lượng mô hình trên dữ liệu thật. Các bài kiểm thử AI Center, import, dashboard và đề xuất nhập hiện có nằm trong hồi quy backend; 43 kiểm thử ML hiện có đạt. Không thực hiện training hoặc kích hoạt model mới.

## 7. Testing

| Nhóm kiểm tra | Kết quả |
| --- | --- |
| Backend, toàn bộ bộ test hiện có và test nâng cấp | 253 đạt, 0 lỗi, 0 bỏ qua |
| Frontend unit | 15 đạt, 0 lỗi |
| Browser hồi quy toàn bộ | 47 đạt, 0 lỗi |
| Browser phần nâng cấp sau khi thêm test tự điền defaults | 11 đạt, 0 lỗi; 10 test trùng lượt hồi quy, 1 test mới |
| Chạy lại 11 browser test nâng cấp trên bản production | 11 đạt, 0 lỗi |
| ML unittest | 43 đạt, 0 lỗi |
| Backend build, lint, TypeScript, Prisma validate | Đạt |
| Frontend lint, TypeScript, build production | Đạt |
| `git diff --check` | Đạt |

Có 48 browser test khác nhau đã đạt qua hai lượt nêu trên. Các tình huống mới gồm upload file thật PNG/JPEG/WebP, loại MIME/bytes giả/file quá lớn, chặn ghi trái quyền, chọn cửa hàng/global, defaults/override, thao tác đồng thời, tồn cần xác nhận, giữ lịch sử, seed v1→v2/idempotency, ảnh thư viện cũ, preview, placeholder, VI/EN và responsive.

Lần build frontend đầu gặp Turbopack worker không kết nối được. Đã giữ cache cũ tại `.test-artifacts/next-build-before-clean-retry`, build sạch bằng chính `npm run build` thành công, không đổi framework/build script. Không còn lỗi kiểm thử hoặc build chưa giải quyết trong các kiểm tra đã chạy.

Browser tests dùng API fixture để kiểm tra hành vi giao diện; backend integration tests dùng PostgreSQL test thực, file upload thực và HTTP thật. Chúng không ghi vào database ứng dụng. Các kiểm thử ML chạy service/model test hiện có; không khẳng định accuracy mới hoặc một phiên thao tác tay hoàn chỉnh trên dữ liệu vận hành.

Log và bằng chứng cục bộ (được Git ignore): `.test-artifacts/backend-upgrade-tests.log`, `frontend-browser-tests.log`, `product-browser-tests.log`, `product-production-browser-tests.log`, `ml-upgrade-tests.log`, `frontend-production-build.log`, `database-before.json`, `database-after.json` và ảnh chụp trong `.test-artifacts/product-upgrade/`.

## 8. Việc cần thực hiện thủ công

Không cần bổ sung ảnh hoặc chạy lại migration trên database hiện tại. Sau khi nhận thay đổi, khởi động lại các service đang mở để dùng bản code mới. Nếu triển khai sang máy khác: cài dependency theo lockfile, backup và chạy `npm run prisma:migrate` trong backend, build lại hai ứng dụng; giữ thư mục upload bền vững và backup cùng PostgreSQL. `.env.example` đã mô tả cấu hình tùy chọn.

Chỉ khi muốn bổ sung **dữ liệu demo** vào một database demo đã chọn, chạy từ `backend/`:

```powershell
npm run seed:forecast-demo -- --confirm-demo --upgrade-existing --end-date 2026-09-26
```

Ngày trên trùng seed v1 đang có. Database mới có thể bỏ `--upgrade-existing` và chọn ngày kết thúc phù hợp; script không cho chuyển ngày của seed đã tồn tại. Nếu script báo còn tồn ở liên kết cần ngừng bán, xem số lượng trước khi chủ động thêm `--confirm-discontinue-stock`. Không chạy lệnh này như một bước bắt buộc khởi động ứng dụng.

Không tạo commit hoặc push. Thay đổi có sẵn của người dùng trong `start-dev.ps1` được giữ nguyên.

## Danh sách file

Danh sách bên dưới chỉ gồm file của lượt nâng cấp, không gồm thay đổi `start-dev.ps1` đã tồn tại từ trước.

- `.env.example`
- `backend/package-lock.json`
- `backend/package.json`
- `backend/prisma/forecast-demo.ts`
- `backend/prisma/migrations/20261111010000_product_defaults_assignment_images/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/src/alerts/alerts.service.ts`
- `backend/src/common/database-errors.ts`
- `backend/src/common/operations.ts`
- `backend/src/forecasts/demo-source.ts`
- `backend/src/forecasts/forecast-history.ts`
- `backend/src/forecasts/forecasts.service.ts`
- `backend/src/inventory/inventory.service.ts`
- `backend/src/locations/locations.service.ts`
- `backend/src/products/product-images.ts`
- `backend/src/products/product.dto.ts`
- `backend/src/products/products.controller.ts`
- `backend/src/products/products.module.ts`
- `backend/src/products/products.service.ts`
- `backend/src/purchases/purchases.service.ts`
- `backend/src/replenishment/replenishment.service.ts`
- `backend/src/sales/sales.controller.ts`
- `backend/src/sales/sales.service.ts`
- `backend/src/store-products/assignment.ts`
- `backend/src/store-products/store-products.controller.ts`
- `backend/src/store-products/store-products.service.ts`
- `backend/test/catalog-fixture.cjs`
- `backend/test/forecast-demo-upgrade.integration.test.cjs`
- `backend/test/forecast-fixture.cjs`
- `backend/test/forecasts.integration.test.cjs`
- `backend/test/product-upgrade.integration.test.cjs`
- `backend/test/products.integration.test.cjs`
- `backend/test/receiving.integration.test.cjs`
- `backend/test/sales.integration.test.cjs`
- `backend/test/store-products.integration.test.cjs`
- `FEATURE_UPGRADE_REPORT.md`
- `frontend/src/app/retail-system.css`
- `frontend/src/app/sales/history/page.tsx`
- `frontend/src/components/alerts-page.tsx`
- `frontend/src/components/app-shell.tsx`
- `frontend/src/components/auth-boundary.tsx`
- `frontend/src/components/catalog-cards.tsx`
- `frontend/src/components/forecasts-page.tsx`
- `frontend/src/components/inventory-page.tsx`
- `frontend/src/components/product-form.tsx`
- `frontend/src/components/product-image.tsx`
- `frontend/src/components/products-page.tsx`
- `frontend/src/components/recommendation-overview.tsx`
- `frontend/src/components/sale-form.tsx`
- `frontend/src/components/sales-page.tsx`
- `frontend/src/components/store-product-form.tsx`
- `frontend/src/components/store-products-page.tsx`
- `frontend/src/i18n/messages/catalog.ts`
- `frontend/src/i18n/messages/errors.ts`
- `frontend/src/i18n/messages/shell.ts`
- `frontend/src/i18n/provider.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/catalog.ts`
- `frontend/src/lib/decision.ts`
- `frontend/src/lib/forecasts.ts`
- `frontend/tests/browser/i18n.spec.ts`
- `frontend/tests/browser/product-upgrade.spec.ts`
- `README.md`
