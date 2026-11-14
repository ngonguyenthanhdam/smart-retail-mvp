# Snapshot demo công khai

`snapshot.json` là bản dữ liệu nghiệp vụ đã ẩn danh, được xuất ngày 14/11/2026. Chủ dự án xác nhận toàn bộ số liệu là giả lập. `manifest.json` lưu checksum SHA-256, số dòng, danh sách 18 migrations và 33 tài nguyên trong `frontend/public/assets/`.

| Dữ liệu | Số lượng |
| --- | ---: |
| Cửa hàng | 4 |
| Sản phẩm | 20 |
| Cấu hình sản phẩm/cửa hàng | 44 |
| Phiếu nhập / dòng nhập / lô tồn kho | 3 / 3 / 3 |
| Hóa đơn / dòng bán hàng | 441 / 3.287 |
| Lần dự báo / kết quả dự báo | 5 / 143 |
| Đề xuất / cảnh báo | 66 / 36 |
| Phạm vi lịch sử bán hàng | 44 |
| Import jobs | 6 |
| Chi phí | 0 |
| Tài khoản demo ngoài ADMIN | 3 |

Giữ nguyên UUID của dữ liệu nghiệp vụ, số lượng/giá trị decimal, ngày và khóa ngoại. Mã hóa đơn, mã lô, tên import và nội dung tự do được thay bằng nhãn demo. Tên sản phẩm và ba cửa hàng FC dùng danh mục giả lập đã xác định; cửa hàng bổ sung được đổi tên, địa chỉ bị loại. Quan hệ người tạo/duyệt được chuyển sang ADMIN tại máy đích hoặc tài khoản demo ẩn danh.

Không chứa tài khoản gốc, mật khẩu/password hash, reset token, email thật, địa chỉ, file CSV tải lên, nội dung chat, workspace/training/audit AI riêng hoặc đường dẫn máy cá nhân. Bảy bảng AI được tạo đúng schema nhưng để trống; model công khai và CSV mẫu của repository vẫn dùng được. Không có file ảnh cửa hàng riêng trong bộ assets hiện tại; ảnh hero và toàn bộ 32 ảnh sản phẩm đều được đóng gói.

## Khôi phục

Làm theo [README chính](../../README.md#clone-và-khôi-phục-đầy-đủ-bản-demo-trên-máy-khác). Sau setup mới trên Windows, chạy `Restore-Demo.bat`. Cài thủ công: cấu hình `backend/.env`, tạo database trống, chạy `npm ci` rồi `npm run demo:restore` trong `backend/`.

Script chỉ thêm dữ liệu vào database trống hoặc chỉ có một ADMIN khởi tạo. Nó khóa các bảng, kiểm tra lại điều kiện, nhập trong một transaction và so sánh từng dòng trước commit. Không có `DELETE`, `TRUNCATE`, `DROP`, reset hoặc upsert dữ liệu nghiệp vụ. Chạy lại trên database đã khôi phục sẽ bị từ chối. ADMIN có sẵn giữ nguyên mật khẩu; các tài khoản demo nhận mật khẩu ngẫu nhiên mới, lưu riêng trong `.local/demo-accounts-*.json`.

`npm run demo:check` xác minh checksum mà không kết nối database. Hash schema/migrations chuẩn hóa CRLF thành LF để clone giữa Windows và Linux vẫn kiểm tra được. Số liệu lịch sử không được dịch ngày: chọn bộ lọc từ 29/06/2026 đến 16/10/2026 để xem bán hàng.

## Tạo phiên bản snapshot mới

Trong `backend/`, chạy `npm run db:backup` trước; backup gốc và file riêng nằm trong `.local/backups/` được Git bỏ qua. Sau khi xác nhận nguồn hoàn toàn là dữ liệu giả lập, chạy `npm run demo:export -- --confirmed-synthetic`. Bộ lọc từ chối sản phẩm/đơn vị/model chưa được review. Review JSON, chạy kiểm tra bảo mật và thử khôi phục trên database `_test` mới trước khi commit. Không thay snapshot bằng dump gốc.
