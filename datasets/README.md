# CSV mẫu để thử AI Center và chatbot

Toàn bộ file trong thư mục này là **dữ liệu mô phỏng (SYNTHETIC)**, không phải lịch sử bán hàng thực. File dùng UTF-8 có BOM, dấu phẩy phân cách, ngày `YYYY-MM-DD`, dấu chấm thập phân. Có thể chọn file trực tiếp từ máy, không cần mở rồi lưu lại bằng Excel.

Có hai bộ khác nhau. **Upload vào AI Center chỉ tạo dataset huấn luyện; chatbot đọc dữ liệu nghiệp vụ trong PostgreSQL, không đọc trực tiếp những CSV đã upload.** Chọn phần A để thử import/training; chọn thêm phần B nếu muốn chatbot trả lời bằng bộ số liệu mô phỏng này. Việc tạo các file dưới đây chưa nhập dữ liệu, chạy training hay thay model trên website.

## A. Thử import nhiều file và huấn luyện trong AI Center

Chọn cùng lúc **cả 3 CSV trong `ai-center/`**:

| File | Nội dung | Số dòng dữ liệu |
| --- | --- | ---: |
| `01-sales-history.csv` | Lượng bán mỗi ngày theo cửa hàng × sản phẩm, đơn vị cơ sở | 5.040 |
| `02-product-catalog.csv` | Danh mục sản phẩm và đơn vị | 12 |
| `03-opening-inventory.csv` | Tồn đầu kỳ mô phỏng ngày 01/06/2026, có mã lô | 36 |

Bộ dữ liệu gồm 3 cửa hàng `SYN_STORE_01`–`SYN_STORE_03`, 12 sản phẩm `SYN_P01`–`SYN_P12`, 36 chuỗi đầy đủ **140 ngày từ 01/06/2026 đến 18/10/2026**. Có 4 sản phẩm CAN, 4 KG và 4 PCS; CAN/PCS là số nguyên, KG có phần thập phân. Có **266 dòng lượng bán bằng 0**, không có ngày bị bỏ trống. Cột `source` của mọi dòng là `SYNTHETIC`.

1. Đăng nhập **ADMIN**, mở [AI Center](http://localhost:3000/ai-center).
2. Trong **Dữ liệu huấn luyện**, bấm **Nhập CSV**, đặt tên, ví dụ `Demo 3 cửa hàng - 140 ngày`; nguồn **Upload nhiều CSV**.
3. Chọn **Dữ liệu ngoài hệ thống / CSV mẫu**, tích **Dữ liệu demo / mô phỏng — chỉ kiểm tra kỹ thuật**, rồi bấm **Tạo dataset**. Không cần tạo các cửa hàng/sản phẩm nghiệp vụ để làm phần A.
4. Bấm **Chọn một hoặc nhiều file CSV**, giữ Ctrl để chọn cả 3 file trong `ai-center/`. Các cột đã dùng đúng tên chuẩn, không cần sửa mapping.
5. Sau upload, trang báo **Đã tải lên 3 file** và tự kiểm tra batch. Có thể bấm **Kiểm tra toàn bộ batch** để kiểm tra lại. Kết quả mong đợi: 5.040 dòng bán/ngày, 3 cửa hàng, 12 sản phẩm, 266 ngày bán bằng 0, 0 ngày chưa biết. Các bảng chi tiết được thu gọn; kiểm tra tóm tắt rồi bấm **Xác nhận sử dụng dữ liệu**. Trang chốt dataset và mở khu vực huấn luyện; chưa chạy training.
6. Trong khu vực **Huấn luyện & kết quả**, mở **Cấu hình lần huấn luyện** nếu đang thu gọn. Giữ **Thử nghiệm · 30 ngày** và **LightGBM + hai phương pháp cơ sở**. Tham số học nằm trong **Tùy chọn nâng cao**, có giải thích và không cần chỉnh khi thử lần đầu.
7. Bấm **Bắt đầu huấn luyện**, không cần tích thêm ô xác nhận. Khi hoàn tất, xem so sánh và MAE/RMSE/WAPE theo từng đơn vị; mở **Phân tích chuyên sâu**, chọn từng biểu đồ để xem heatmap tương quan, tỷ lệ thiếu đặc trưng và lịch bán hàng. Mật độ test dùng histogram hai chiều, không phải phân cụm sản phẩm. Nếu chọn nhầm 124 ngày, thông báo giải thích yêu cầu 308 ngày và có nút **Dùng chế độ 30 ngày**.

Nếu đã upload đủ 3 file nhưng thấy **0 dòng hợp lệ và 5.089 lỗi**, kiểm tra nguồn dataset. Chọn nhầm **Dữ liệu trong hệ thống** sẽ khiến mã SYN_* không khớp danh mục. ADMIN mở **Quản lý file & kiểm tra dữ liệu**, bấm **Chuyển sang dữ liệu ngoài hệ thống và kiểm tra lại** trên dataset hiện tại; không cần upload lại. Khi kết quả còn 0 lỗi, bấm **Xác nhận sử dụng dữ liệu**.

140 ngày đủ cho hai cửa sổ đánh giá 30 ngày và phần train tối thiểu 60 ngày; chưa đủ chế độ 124 ngày. Dataset mô phỏng không được dùng kích hoạt model vận hành. Huấn luyện ở đây là mô hình dự báo lượng bán; không huấn luyện lại Qwen của chatbot. Kết quả chỉ kiểm tra pipeline: **Synthetic/demo backtest — not evidence of real-world forecasting accuracy.**

Tồn đầu kỳ trong phần A là dữ liệu phụ để đối chiếu, không ghi tồn kho nghiệp vụ và không phải feature tồn kho tương lai. Không upload lẫn CSV ở phần B vào batch này.

## B. Tạo số liệu nghiệp vụ để thử chatbot (tùy chọn)

Phần này dùng [Nhập dữ liệu](http://localhost:3000/imports). **Sau khi bạn xác nhận import, các giao dịch mô phỏng sẽ được ghi vào PostgreSQL và xuất hiện trong báo cáo.** Dùng các cửa hàng demo riêng bên dưới và chọn đúng phạm vi khi xem số liệu; báo cáo toàn hệ thống sẽ cộng cả dữ liệu demo này.

### Chuẩn bị một lần bằng tài khoản ADMIN

| Trang | Cấu hình cần có |
| --- | --- |
| [Cửa hàng](http://localhost:3000/stores) | Tạo 3 cửa hàng đang hoạt động, loại STORE, mã `SYN_STORE_01`, `SYN_STORE_02`, `SYN_STORE_03`; tên lần lượt `Cửa hàng mô phỏng 01`, `Cửa hàng mô phỏng 02`, `Cửa hàng mô phỏng 03` |
| [Đơn vị](http://localhost:3000/products/units) | Kiểm tra các mã `CAN` (Lon), `KG` (Kilogram), `PCS` (Cái); chỉ tạo mã còn thiếu |
| [Danh mục](http://localhost:3000/products/categories) | Tạo danh mục đang hoạt động mã `SYN_DEMO`, tên `Sản phẩm mô phỏng` |

Không cần gán nhân viên cho các cửa hàng để ADMIN import và hỏi chatbot. Các mã phải khớp chính xác với CSV. Nếu chúng đã có từ lần thử trước, kiểm tra nội dung cũ trước khi tiếp tục.

### Nhập lần lượt từng file trong `chatbot-business/`

Trang `/imports` cho chọn nhiều file cùng lúc, tối đa 20 file, mỗi file 2 MB/1.000 dòng. Giữ **Tự nhận diện theo cột**, chọn 4 file trong `chatbot-business/` rồi bấm **Kiểm tra và xem trước**. Mỗi file có kết quả riêng; bấm **Xem kết quả / nhập** và xác nhận lần lượt theo thứ tự dưới đây. Việc chọn hoặc kiểm tra file chưa ghi dữ liệu nghiệp vụ.

Nếu nút **Nhập các dòng hợp lệ** bị khóa, thông báo sẽ nêu nguyên nhân: không có dòng hợp lệ, xem trước hết hạn hoặc kết quả chưa rõ. Với lỗi thiếu danh mục/đơn vị/cửa hàng, mở đường dẫn gợi ý, bổ sung cấu hình rồi bấm **Kiểm tra lại**. Sau khi nhập sản phẩm, mở lại kết quả bán hàng/tồn kho để hệ thống kiểm tra lại tham chiếu; không cần chọn lại toàn bộ batch. File sai định dạng có thể bỏ riêng. Sau khi **Hủy nhập**, dùng **Xóa khỏi danh sách** để dọn lịch sử; metadata vẫn được lưu, các lần nhập thành công không bị xóa.

| Thứ tự | File | Loại import | Kết quả khi nhập đủ |
| --- | --- | --- | --- |
| 1 | `01-products.csv` | Sản phẩm / PRODUCT | 12 sản phẩm mới, tên có tiền tố `Mô phỏng`, giá vốn theo đơn vị cơ sở |
| 2 | `02-sales.csv` | Bán hàng / SALE | 477 dòng chi tiết, **42 hóa đơn**, từ 05/10/2026 đến 18/10/2026 |
| 3 | `03-expenses.csv` | Chi phí / EXPENSE | 6 khoản chi phí có mô tả `SYNTHETIC` |
| 4, tùy chọn | `04-opening-inventory.csv` | Tồn đầu kỳ / INVENTORY | 36 lô tồn mô phỏng tại ngày 19/10/2026 |

Lưu ý về dữ liệu:

- Lịch sử bán ở phần B lấy các ngày cuối từ bộ A; chỉ tạo dòng hóa đơn có lượng bán dương. Ngày lượng bán bằng 0 vẫn nằm đầy đủ trong bộ A, nhưng không tạo giao dịch bán 0 ở bộ B.
- `cost_of_goods_sold` là **tổng giá vốn của dòng**. Giảm giá là số tiền cho cả hóa đơn, lặp cùng một giá trị trên các dòng và chỉ tính một lần cho hóa đơn đó.
- Import bán hàng lịch sử không trừ tồn. File tồn ở bước 4 là lượng tồn mô phỏng độc lập tại 19/10/2026, không phải lấy tồn ngày 01/06 rồi trừ toàn bộ lịch sử bán. Sản phẩm demo không theo dõi hạn dùng.
- Mỗi file dưới 1.000 dòng và 2 MB. SKU/hóa đơn đã tồn tại sẽ bị từ chối; tồn đầu kỳ bị từ chối nếu cặp cửa hàng × sản phẩm đã có lô. **Không nhập lại chi phí đã thành công**, vì chi phí không có mã duy nhất để chặn việc cộng lần nữa. Nếu import chỉ thành công một phần, xem danh sách lỗi và chuẩn bị file chỉ chứa phần chưa được nhập.
- Import không tạo forecast, cảnh báo hay đề xuất nhập hàng. Chatbot chỉ đọc các kết quả đó khi chúng đã được tạo qua chức năng tương ứng. Bộ B chủ yếu dùng kiểm tra câu hỏi doanh thu, giá vốn, sản phẩm bán chạy và chi phí.
- CSV nghiệp vụ không có trường `source`; dấu hiệu mô phỏng nằm ở mã/tên cửa hàng, SKU, hóa đơn và mô tả chi phí. Nếu sau này tạo snapshot database để training, **phải tích mô phỏng**; không xác nhận đây là lịch sử thực. Nhãn số liệu đã ghi nhận trên chat không biến các giao dịch này thành dữ liệu thực tế.

### Câu hỏi thử và số liệu đối chiếu

Mở AI Center, chọn khu vực **Trợ lý kinh doanh**, bấm nút **Hội thoại mới**, mở **Công cụ → Phạm vi cửa hàng**, chọn **Cửa hàng mô phỏng 01** trước khi gửi câu hỏi. Cần Ollama/Qwen đã sẵn sàng theo hướng dẫn `Setup-AI.bat` ở README gốc. Gõ tự do vào ô **Bạn muốn biết gì về cửa hàng?**; câu hỏi mẫu chỉ điền gợi ý, không tự gửi. Câu hỏi ngoài phạm vi được trả lời rõ là chưa biết hoặc ngoài phạm vi hỗ trợ.

- “Doanh thu từ ngày 2026-10-05 đến ngày 2026-10-18 là bao nhiêu?”
- “Giá vốn và lợi nhuận gộp từ ngày 2026-10-05 đến ngày 2026-10-18 là bao nhiêu?”
- “Tổng chi phí từ ngày 2026-10-05 đến ngày 2026-10-18 là bao nhiêu?”
- “5 sản phẩm bán chạy nhất từ ngày 2026-10-05 đến ngày 2026-10-18 là gì?”

Mở **Xem nguồn và số liệu đối chiếu** dưới câu trả lời. Nếu không có giao dịch trong ngày được hỏi, trợ lý nêu rõ chưa có bản ghi và ngày gần nhất nếu có; không mặc định đây là doanh thu thực tế bằng 0. Dùng ngày cố định ở trên thay vì “hôm nay” vì dữ liệu demo không tự dịch chuyển theo ngày bạn chạy.

Các giá trị dưới đây áp dụng cho kỳ **05/10/2026–18/10/2026**, khi mỗi file được nhập đúng một lần và cửa hàng demo không có giao dịch khác; tiền tệ VND:

| Cửa hàng | Hóa đơn | Doanh thu sau giảm giá | Giá vốn | Lợi nhuận gộp | Chi phí |
| --- | ---: | ---: | ---: | ---: | ---: |
| SYN_STORE_01 | 14 | 32.233.980 | 20.584.960 | 11.649.020 | 200.000 |
| SYN_STORE_02 | 14 | 40.141.330 | 25.613.320 | 14.528.010 | 400.000 |
| SYN_STORE_03 | 14 | 47.154.290 | 30.117.140 | 17.037.150 | 600.000 |

## Nguồn và kiểm tra

Dữ liệu được tạo theo seed cố định `20261019`, mức bán cơ sở từng sản phẩm, chênh lệch giữa cửa hàng, chu kỳ tuần, xu hướng nhẹ và biến thiên có giới hạn. Không lấy dữ liệu khách hàng hay giao dịch thực. Giá bán, giá vốn, tồn và chi phí đều là giả định minh họa; không dùng chúng làm bằng chứng về độ chính xác dự báo thực tế.

Đã kiểm tra cả 7 file bằng bộ đọc CSV và kiểm tra chéo toàn batch; đồng thời chạy qua trình duyệt với quyền ADMIN trên database kiểm thử riêng: nhập đủ sản phẩm/hóa đơn/chi phí/tồn kho, huấn luyện và so sánh ba thuật toán, hỏi chatbot lấy doanh thu theo cửa hàng. Batch có 36 chuỗi đầy đủ 140 ngày, không trùng khóa hoặc sai đơn vị. Doanh thu cửa hàng 01 được đối chiếu đúng 32.233.980 VND. Dữ liệu kiểm thử được dọn sau khi kiểm tra; không nhập bộ demo này vào database ứng dụng và không thay model đang hoạt động.
