# Kiểm chứng dự báo số lượng

Phiên bản phát hành: **m5-quantity-v2**. Thuật toán được chọn: **RollingMean28 — trung bình lượng bán 28 ngày gần nhất**. LightGBM đã huấn luyện nhưng không thắng tiêu chí validation đã định trước. Không thay mô hình chỉ để giữ nhãn AI.

## Nguồn và phạm vi

Nguồn chính thức: [M5 của ban tổ chức](https://github.com/Mcompetitions/M5-methods), revision `904bfacd2f6022259b015ac417a4978afdfcaf2e`. Tệp tải từ Git LFS chính thức; kích thước và SHA-256 khớp con trỏ đã công bố. Tệp provenance trong metadata lưu URL, revision, checksum từng file và checksum snapshot.

Tập nhỏ xác định trước gồm 60 chuỗi: CA_1/TX_1/WI_1 × 20 mã FOODS đầu tiên theo thứ tự tên. Có 116.460 quan sát từ **29/01/2011 đến 22/05/2016**. Không thay đổi ngày, không đổi tên thành cửa hàng website, không nhân/chia hệ số để biến số lượng chuẩn hóa thành đơn vị thật. M5 cung cấp số lượng mặt hàng (`UNIT`), không cung cấp kiểm chứng kg/lon cho cửa hàng của người dùng.

Đây là thí nghiệm trên một tập con M5; không phải điểm thi chính thức WRMSSE của M5 và không đại diện toàn bộ dữ liệu. Không đưa bộ dữ liệu raw vào Git. Điều khoản dữ liệu của cuộc thi gốc áp dụng.

## Quy trình đã thực hiện

Mốc validation: **17/09/2015**, dự báo 18/09/2015–19/01/2016. Mốc test độc lập: **19/01/2016**, dự báo 20/01/2016–22/05/2016. Mỗi cửa sổ dài 124 ngày. Đánh giá các tiền tố 7, 30, 31, 90 và 124 ngày trong mỗi cửa sổ; các tiền tố chồng lấn, không coi là các thí nghiệm độc lập.

LightGBM dùng 200 cây, 31 lá, learning rate 0,05, tối thiểu 80 dòng/lá, mục tiêu bình phương sai số, seed cố định và bốn luồng CPU. Chín đặc trưng là lag 1/7/14/30, trung bình lịch sử 7/14/30, thứ và tháng. Mã cửa hàng/sản phẩm dùng nhóm chuỗi, không dùng làm đầu vào. Fit đầu gồm 99.780 dòng mục tiêu tới 17/09/2015. Fit lại cùng tham số tới 19/01/2016 gồm 107.220 dòng. Không dùng test để huấn luyện hoặc chọn mô hình.

Hai đối chứng: lặp mẫu bảy ngày gần nhất (SeasonalNaive), và trung bình 28 ngày gần nhất (RollingMean28). Điểm chọn là trung bình qua các kỳ và đơn vị của `0,5 × WAPE hằng ngày + 0,5 × WAPE tổng kỳ`. Điểm nhỏ hơn tốt hơn; hòa thì ưu tiên đối chứng đơn giản theo thứ tự công bố. Giao thức được ghi trước khi fit, lựa chọn được ghi trước khi đánh giá test.

| Phương pháp | Điểm validation |
|---|---:|
| SeasonalNaive | 0,720515 |
| **RollingMean28** | **0,592337** |
| LightGBM | 0,653578 |

Mô hình phát hành vì thế là phương pháp trung bình, không có trọng số LightGBM được học. File LightGBM ứng viên thật vẫn được giữ tại `models/operational/m5-quantity-v2/candidates/lightgbm.joblib`; metadata có tham số, ngày fit và checksum. Phiên bản v2 lặp nguyên dữ liệu, tham số và giao thức của lần chạy v1 để bổ sung việc lưu ứng viên và thông tin đơn vị; không điều chỉnh mô hình theo test.

## Sai số trên test độc lập

WAPE bằng tổng sai số tuyệt đối chia tổng số lượng thực. WAPE không phải tỷ lệ dự báo chính xác. Không cộng MAE/RMSE giữa những đơn vị khác nhau; báo cáo JSON tách theo đơn vị. Bảng dưới là `UNIT` của nguồn M5.

| Phương pháp | Tổng kỳ 30 ngày | Tổng kỳ 31 ngày | Tổng kỳ 90 ngày | Tổng kỳ 124 ngày |
|---|---:|---:|---:|---:|
| SeasonalNaive | 50,84% | 51,11% | 57,70% | 53,71% |
| **RollingMean28** | **34,15%** | **35,20%** | **43,31%** | **39,02%** |
| LightGBM | 37,22% | 37,91% | 51,60% | 47,50% |

Sai số hằng ngày của phương pháp được chọn vẫn lớn: **96,63% WAPE ở 30 ngày**, **98,32% ở 90 ngày**. WAPE theo các nhóm tháng lịch trong cửa sổ là 47,85% và 53,10% tương ứng; các tháng ở biên cửa sổ có thể không đủ tháng. Tổng kỳ có thể che việc sai số giữa các ngày triệt tiêu nhau. Không suy luận rằng dự báo đã đủ tốt để tự động nhập hàng.

Các horizon 90/124 ngày đã có phép kiểm chứng ngoài mẫu trên tập ngoài này; đây không phải bằng chứng độ chính xác ba tháng của cửa hàng thật. Có một mốc validation và một mốc test, chưa có kiểm chứng qua nhiều mùa hoặc cửa hàng Việt Nam. Không có khoảng tin cậy đã hiệu chỉnh.

## Phân biệt thang đo và độ chính xác

`operational_units_supported=true`: mô hình xuất lượng bán theo thang số lượng đầu vào, không còn đưa trực tiếp dữ liệu chuẩn hóa FreshRetailNet vào nghiệp vụ.

`real_world_accuracy_verified=false`: không có tập giữ lại từ cửa hàng thực trong website để xác nhận khả năng chuyển sang dữ liệu đó. `supported_units=["UNIT"]` ghi đúng đơn vị nguồn đã đánh giá. Đưa chuỗi kg/lon vào hàm số không chứng minh độ chính xác cho kg/lon. Dữ liệu bán còn chịu ảnh hưởng hết hàng và chưa khôi phục nhu cầu bị mất. Doanh thu giả định giá bán hiện tại giữ nguyên.

Lịch sử cửa hàng có thể xuất ra CSV rồi chạy cùng pipeline, huấn luyện/kiểm chứng và kích hoạt một phiên bản mới. Website chỉ nhận phiên bản có validation và test độc lập đủ 124 ngày; thí nghiệm kiểm chứng ngắn hơn vẫn tạo báo cáo nhưng không được thay mô hình đang hoạt động. Dữ liệu thiếu, khác đơn vị trong cùng chuỗi, trùng ngày hoặc mô phỏng không được ngầm coi như dữ liệu thực hợp lệ. Hệ thống không tự huấn luyện trong lúc người dùng chạy dự báo.

## Kiểm tra kỹ thuật

API hỗ trợ khoảng dự báo 1–124 ngày và trả từng ngày để backend chia tháng lịch. Kiểm thử HTTP bao gồm 1/28/29/30/31/90/124 ngày, tính quyết định, thiếu lịch sử, model không có, dữ liệu sai định dạng. Kiểm thử pipeline bao gồm tách thời gian, thay giá trị test không đổi lựa chọn/mô hình, nguồn mô phỏng không được kích hoạt, kiểm chứng ngắn hạn không thay con trỏ đang hoạt động, từ chối nạp metadata cũ thiếu kiểm chứng dài hạn, phiên bản không ghi đè và checksum artifact. Bản FreshRetailNet gốc và kiểm thử tương thích vẫn giữ nguyên.

Ngày 07/10/2026, chạy lại toàn bộ `python -m unittest discover -s tests -v`: **36 kiểm thử đạt**. Kiểm thử HTTP chạy với quyền mở cổng localhost; thao tác kích hoạt được kiểm tra trong thư mục tạm. Hai tệp raw M5 khớp cả kích thước và SHA-256 đã ghim; mô hình đang kích hoạt và artifact LightGBM ứng viên khớp checksum lưu trong phiên bản.

Tái lập và cách huấn luyện từ CSV: [QUANTITY_FORECASTING.md](../QUANTITY_FORECASTING.md). Bằng chứng số đầy đủ: `models/operational/m5-quantity-v2/{protocol,selection,evaluation,metadata}.json`.
