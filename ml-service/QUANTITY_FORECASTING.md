# Dự báo số lượng cửa hàng

Luồng mới dùng số lượng trong đơn vị gốc của từng sản phẩm. Thí nghiệm FreshRetailNet chuẩn hóa, mô hình cũ và endpoint tương thích `SYNTHETIC_DEMO` được giữ nguyên để đối chiếu nghiên cứu. Website dùng `STORE_HISTORY` và mô hình đang được chọn trong `models/active-model.json`.

## Kết quả đang sử dụng

Phiên bản `m5-quantity-v2` dùng **trung bình lượng bán 28 ngày gần nhất**. LightGBM đã được huấn luyện thật, nhưng có sai số validation cao hơn phương pháp đơn giản theo quy tắc chốt trước, nên không được chọn để chạy dự báo. Mô hình LightGBM đã huấn luyện, tham số, các phép so sánh và checksum vẫn được lưu cùng phiên bản. Không gọi kết quả hiện tại là dự báo từ LightGBM.

Dữ liệu kiểm chứng là số lượng mặt hàng của M5, giữ nguyên ngày 2011–2016. Đây không phải lịch sử các cửa hàng trong website. `operational_units_supported=true` có nghĩa đầu ra dùng thang số lượng; `real_world_accuracy_verified=false` có nghĩa chưa chứng minh độ chính xác tại cửa hàng của người dùng. `supported_units` liệt kê đơn vị nguồn thực sự đã được kiểm chứng, hiện là `UNIT`; không chứng minh độ chính xác riêng cho kg hoặc lon.

Xem [báo cáo kiểm chứng](reports/quantity_forecasting_report.md). Sai số còn lớn; dự báo và đề xuất nhập cần người dùng xem xét.

## Tạo lại tập M5 và mô hình

Chạy từ thư mục `ml-service` sau khi cài `requirements-training.txt`:

```powershell
.\.venv\Scripts\python -m src.quantity_dataset --download
.\.venv\Scripts\python -m src.train_quantity --snapshot data/processed/m5/quantity_snapshot.csv --version m5-reproduction-v1
```

Nguồn được tải từ kho chính thức của ban tổ chức tại revision cố định, xác minh kích thước và SHA-256 theo con trỏ Git LFS của chính kho đó. Chỉ chọn CA_1, TX_1, WI_1 và 20 mã FOODS đầu tiên theo thứ tự tên; không chọn theo kết quả bán hay sai số. Tệp raw và snapshot lớn không cần đưa vào Git. Điều khoản dữ liệu M5 gốc vẫn áp dụng.

## Huấn luyện từ dữ liệu website

Quản trị viên xuất CSV dữ liệu lịch sử đã xác nhận đầy đủ qua `GET /forecasts/data/export`. CSV UTF-8 gồm:

```text
date,store_id,product_id,quantity,unit_code,source
```

`date` là ngày Việt Nam dạng `YYYY-MM-DD`; `quantity` là tổng số lượng của hóa đơn hợp lệ theo đơn vị gốc; `source=STORE_HISTORY`. Từng cửa hàng/sản phẩm/ngày xuất hiện tối đa một lần. Chỉ ngày đã có xác nhận bao phủ lịch sử mới được ghi bằng 0 khi không có giao dịch. Ngày không biết phải để thiếu trong dòng thời gian, không tạo số 0. Mỗi chuỗi phải giữ nguyên một đơn vị gốc.

```powershell
.\.venv\Scripts\python -m src.train_quantity --snapshot D:\exports\sales-daily.csv --version store-quantity-v1 --source-kind STORE_HISTORY
```

Mặc định mỗi chuỗi đủ điều kiện cần ít nhất 60 ngày trước mốc validation, 124 ngày validation và 124 ngày test, tổng tối thiểu 308 ngày. Có thể dùng `--evaluation-days 30` khi chỉ đủ dữ liệu kiểm chứng ngắn hơn; phiên bản này chỉ dùng để nghiên cứu và tạo báo cáo, không được kích hoạt cho website. Website cần dự báo tới 124 ngày để bao phủ ba tháng lịch nên bắt buộc có cả validation và test độc lập đủ 124 ngày. Yêu cầu `--activate` với kỳ kiểm chứng ngắn hơn trả lỗi rõ ràng, giữ báo cáo đã tạo và không thay đổi phiên bản đang hoạt động. Các chuỗi thiếu bao phủ liên tục trong phần đầu vào/kiểm chứng được liệt kê là bỏ qua. Không có chuỗi hợp lệ thì lệnh dừng, không kích hoạt mô hình.

Mỗi lần chạy tạo phiên bản mới và từ chối ghi đè. Quy trình:

1. Kiểm tra CSV và lưu checksum, nguồn, giao thức chia thời gian trước khi huấn luyện.
2. Huấn luyện LightGBM và so sánh với hai phương pháp đơn giản.
3. Chọn theo validation, ghi lựa chọn trước khi đọc sai số test.
4. Huấn luyện lại cùng cấu hình đến hết validation; đánh giá trên test độc lập. Các bước dự báo xa chỉ dùng dự báo trước đó, không lấy số bán thực của kỳ cần dự báo.
5. Lưu model, mô hình LightGBM ứng viên, metadata, dữ liệu đánh giá và danh sách chuỗi bị bỏ qua. Người quản trị kiểm tra rồi kích hoạt phiên bản đã chọn.

```powershell
.\.venv\Scripts\python -m src.quantity_model --activate store-quantity-v1
```

`--activate` trên lệnh huấn luyện gộp bước cuối khi người quản trị chủ động yêu cầu. Không tự chạy sau import hay mỗi lần dự báo. Kích hoạt xác minh checksum, hợp đồng mô hình và bằng chứng kiểm chứng đủ 124 ngày rồi thay con trỏ bằng thao tác atomic; dịch vụ nhận phiên bản mới ở lần gọi tiếp theo. Khi tải phiên bản, dịch vụ cũng kiểm tra điều kiện này để không phục vụ một bản cũ chỉ kiểm chứng ngắn hạn. Quay lại bản trước bằng cùng lệnh `--activate <version>`. Dữ liệu mô phỏng chỉ được dùng với `--allow-synthetic`; phiên bản có dữ liệu này không được phép kích hoạt. Không nhận artifact pickle/joblib tải lên từ người dùng.

## Hợp đồng HTTP

- `GET /model-info`: phiên bản, thuật toán thực dùng, loại thang đo, đơn vị nguồn, lựa chọn/kiểm chứng, dữ liệu huấn luyện và giới hạn. Thiếu hoặc hỏng bản kích hoạt trả `MODEL_UNAVAILABLE`.
- `POST /predict`: `usage_mode=STORE_HISTORY`, `origin`, `horizon_days` từ 1 đến 124, danh sách chuỗi gồm UUID cửa hàng/sản phẩm và lịch sử `{date, quantity}`. Cần 30 ngày gần nhất liên tục. Trả từng ngày; backend chịu trách nhiệm chia theo tháng lịch, tính giá bán và quản lý quyền truy cập.
- Ngày sau mốc dự báo, trùng ngày, thiếu lịch sử, số âm/không hữu hạn và kỳ vượt giới hạn đều bị từ chối. Không tự chuyển sang mô hình chuẩn hóa khi mô hình số lượng gặp lỗi.
- `SYNTHETIC_DEMO` tiếp tục hợp đồng cũ 7/30/90 ngày để giữ phép kiểm chứng ban đầu.

Kiểm thử: `.\.venv\Scripts\python -m unittest discover -s tests -v`. Các bài HTTP cần môi trường cho phép mở cổng localhost.
