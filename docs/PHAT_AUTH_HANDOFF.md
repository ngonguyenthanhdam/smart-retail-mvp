# BÀN GIAO MODULE XÁC THỰC CHO PHÁT

Ngày kiểm tra: 01/11/2026. Tài liệu do Codex chuẩn bị trên máy nhóm trưởng; không phải bằng chứng Phát đã viết phần code nền. Phát tiếp tục học, kiểm thử và tạo commit cho các thay đổi thực sự do mình thực hiện.

## 1. Thông tin nhánh và phạm vi

| Nội dung | Kết quả đối chiếu GitHub |
| --- | --- |
| Repository | [ngonguyenthanhdam/smart-retail-mvp](https://github.com/ngonguyenthanhdam/smart-retail-mvp) |
| Nhánh chính thực tế | `smart-retail-mvp`; repository không có `main` tại thời điểm kiểm tra |
| Commit gốc | `121ca30884e30d99c917208d7a61d1122eb3ff5a` |
| Nhánh bàn giao | `feature/phat-auth` |
| Mục đích | Giữ toàn bộ ứng dụng, tạo nơi riêng cho Phát học và cải tiến Login |
| Nhánh giao diện khác | `feature/ui-ux-application-rollout` tại `bbee748`; không được gộp vào nhánh này |

Theo lựa chọn của nhóm trưởng, nhánh được tạo từ nhánh mặc định trên GitHub, không lấy commit chưa push trên máy. Lúc bắt đầu, nhánh local `smart-retail-mvp` đi trước remote một commit (`6f6b7cf`); workspace đang checkout nhánh giao diện tại `bbee748`, không có thay đổi tracked chưa commit. Các trạng thái này được giữ nguyên.

**Login đã tồn tại; không có Register công khai.** Không có trang `/register` hoặc handler `POST /auth/register`. Tài khoản được ADMIN tạo qua màn hình Người dùng và `POST /users`. Không tự thêm đăng ký công khai vì sẽ thay đổi mô hình phân quyền của ứng dụng.

Phát phụ trách luồng Login, kiểm thử và cải tiến nhỏ phía giao diện. Quản lý người dùng, phân quyền, cửa hàng, khôi phục mật khẩu là phần cần hiểu để tránh gây lỗi, không tự động trở thành nhiệm vụ phát triển của Phát. Không sửa schema, migration, API contract, nghiệp vụ hoặc AI trong đợt này.

## 2. Bản đồ mã nguồn

Mở thư mục clone bằng Visual Studio Code. Dùng **Ctrl+P** với đường dẫn bên dưới, **Ctrl+F** tìm tên hàm, **Ctrl+Shift+F** tìm toàn dự án. Đường dẫn trong tài liệu tính từ thư mục gốc repository để dùng được trên máy Phát.

### Frontend

| File | Nội dung cần hiểu |
| --- | --- |
| [frontend/src/app/login/page.tsx](../frontend/src/app/login/page.tsx) | Trang `/login`, hiển thị `LoginForm` |
| [frontend/src/components/login-form.tsx](../frontend/src/components/login-form.tsx) | **Bắt đầu học ở đây**: `handleSubmit`, kiểm tra trường trống, `submitting`, lỗi và nút đăng nhập |
| [frontend/src/lib/auth.ts](../frontend/src/lib/auth.ts) | `login`, `logout`, `fetchCurrentUser`, `authRequest`; gửi cookie bằng `credentials: "include"`, timeout 10 giây |
| [frontend/src/components/auth-provider.tsx](../frontend/src/components/auth-provider.tsx) | `useAuth`, `signIn`, `signOut`, `loadCurrentUser`; lưu trạng thái trong React, gọi `/auth/me` lúc mở trang và khi cửa sổ nhận focus |
| [frontend/src/components/auth-boundary.tsx](../frontend/src/components/auth-boundary.tsx) | Chặn trang khi chưa đăng nhập; trạng thái tải/lỗi và `router.replace` |
| [frontend/src/lib/navigation.ts](../frontend/src/lib/navigation.ts) | `defaultRoute`, `canAccessSection`: ADMIN/quản lý đến `/dashboard`, STAFF đến `/sales` |
| [frontend/src/app/layout.tsx](../frontend/src/app/layout.tsx) | Gắn `AuthProvider` và `AuthBoundary` cho ứng dụng |
| [frontend/src/components/app-shell.tsx](../frontend/src/components/app-shell.tsx) | Khung ứng dụng, menu và đăng xuất |
| [frontend/src/i18n/vi.ts](../frontend/src/i18n/vi.ts), [globals.css](../frontend/src/app/globals.css) | Câu chữ tiếng Việt và định dạng giao diện |
| [forgot-password-form.tsx](../frontend/src/components/forgot-password-form.tsx), [reset-password-form.tsx](../frontend/src/components/reset-password-form.tsx) | Biểu mẫu quên/đặt lại mật khẩu; trang tương ứng nằm trong `frontend/src/app/forgot-password/page.tsx` và `frontend/src/app/reset-password/page.tsx` |
| [frontend/src/components/users-page.tsx](../frontend/src/components/users-page.tsx), [frontend/src/lib/users.ts](../frontend/src/lib/users.ts) | ADMIN tạo tài khoản; được mở từ `frontend/src/app/users/page.tsx`, không phải Register |

Form Login đã có nhãn, `autoComplete`, lỗi theo trường, `aria-invalid`, `aria-describedby`, trạng thái đang gửi và khóa nút để tránh bấm lặp. Hiện ô mật khẩu luôn là `type="password"`, chưa có nút hiện/ẩn. Không viết lại các trạng thái đã có chỉ để tạo thêm commit.

### Backend và dữ liệu

| File/nhóm file | Vai trò |
| --- | --- |
| [backend/src/auth/auth.controller.ts](../backend/src/auth/auth.controller.ts) | Các endpoint xác thực, đặt/xóa cookie |
| [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts) | `login`, `currentUser`, `normalize`; tìm tài khoản, kiểm tra bcrypt và tạo JWT |
| [auth.guard.ts](../backend/src/auth/auth.guard.ts), [roles.guard.ts](../backend/src/auth/roles.guard.ts) | Kiểm tra Origin, cookie, JWT và quyền; đăng ký toàn cục trong [auth.module.ts](../backend/src/auth/auth.module.ts) |
| [auth-cookie.ts](../backend/src/auth/auth-cookie.ts), [auth.decorators.ts](../backend/src/auth/auth.decorators.ts), [auth.types.ts](../backend/src/auth/auth.types.ts) | Cookie, `Public`, `Roles`, `CurrentUser` và kiểu tài khoản |
| [backend/src/auth/location-scope.ts](../backend/src/auth/location-scope.ts) | `resolveLocationScope`: giới hạn dữ liệu theo cửa hàng được gán |
| [password-reset.service.ts](../backend/src/auth/password-reset.service.ts), [password-reset.dto.ts](../backend/src/auth/password-reset.dto.ts), [reset-mailer.service.ts](../backend/src/auth/reset-mailer.service.ts) | Token đặt lại mật khẩu, kiểm tra đầu vào và gửi thư |
| [users.controller.ts](../backend/src/users/users.controller.ts), [users.service.ts](../backend/src/users/users.service.ts), [user.dto.ts](../backend/src/users/user.dto.ts) | ADMIN tạo/cập nhật người dùng; chặn trùng định danh và kiểm tra vai trò/cửa hàng |
| [environment.ts](../backend/src/config/environment.ts), [configure-app.ts](../backend/src/config/configure-app.ts) | Kiểm tra cấu hình JWT, URL, SMTP; CORS cho frontend |
| [validation.ts](../backend/src/common/validation.ts), [database-errors.ts](../backend/src/common/database-errors.ts) | Kiểm tra dữ liệu và chuyển lỗi trùng/xung đột cơ sở dữ liệu |
| [prisma.service.ts](../backend/src/database/prisma.service.ts), [app.module.ts](../backend/src/app.module.ts) | Kết nối PostgreSQL và ghép các module |
| [backend/prisma/schema.prisma](../backend/prisma/schema.prisma), [seed.ts](../backend/prisma/seed.ts) | Model dữ liệu; khởi tạo ba vai trò và ADMIN đầu tiên |

Quan hệ chính: `User.roleId → Role.id`, `User.locationId → Location.id`. `Location` biểu diễn cửa hàng/kho; tài khoản quản lý và nhân viên cần được gán một `STORE`. `User` chứa `passwordHash`, `isActive`, `deletedAt`, `passwordResetTokenHash`, `passwordResetExpiresAt`. Không có bảng session đăng nhập riêng; bảng `ai_chat_sessions` không phải session xác thực. JWT chứa `sub`, thời điểm phát hành và hết hạn; vai trò/cửa hàng được đọc lại từ tài khoản khi kiểm tra request.

### API và luồng xử lý

| Endpoint | Đầu vào/quyền | Kết quả chính |
| --- | --- | --- |
| `POST /auth/login` | `{identifier, password}`; chưa cần đăng nhập | 200 + người dùng và cookie; sai thông tin trả 401 |
| `GET /auth/me` | Cookie hợp lệ | 200 + tài khoản hiện tại; không hợp lệ trả 401 |
| `POST /auth/logout` | Không cần phiên hợp lệ | 204, xóa cookie của trình duyệt |
| `POST /auth/forgot-password` | `{email}` | 200 với thông báo chung; đầu vào sai có thể trả 400 |
| `POST /auth/reset-password` | `{token, newPassword}` | 200 khi hợp lệ; token sai/hết hạn trả 400, xóa cookie hiện tại khi thành công |
| `POST /users` | ADMIN; `username`, `email`, `password`, `fullName`, `role`, `locationId`, `isActive` | 201 khi tạo; lỗi kiểm tra 400, định danh trùng 409 |
| `GET /users`, `GET /users/:id`, `PATCH /users/:id` | ADMIN | Xem/cập nhật tài khoản; không phải API đăng ký công khai |

Các request ghi từ trình duyệt còn được kiểm tra Origin, kể cả endpoint đánh dấu `Public`. Phân quyền không chỉ dựa vào việc ẩn menu frontend.

**Login:** `handleSubmit` → `signIn` → `login` → `AuthController.login` → `AuthService.login` → Prisma tìm username/email → `bcrypt.compare` → JWT → cookie → cập nhật React → `AuthBoundary` chuyển trang. Identifier được trim; mật khẩu không bị trim. Backend chặn identifier trống/quá 255 ký tự, mật khẩu trống/quá 72 byte UTF-8, tài khoản không hợp lệ và định danh khớp hai tài khoản. Sai mật khẩu/tài khoản không tồn tại dùng chung thông báo.

**Tạo tài khoản thay cho Register:** ADMIN mở `/users` → form gọi `saveUser` → `POST /users` → `parseCreateUser` → `UsersService.create`. Backend kiểm tra trùng username/email, quyền người tạo, vai trò và cửa hàng; băm mật khẩu bằng bcrypt với cost 12 rồi ghi `User`. Tài khoản mới có thể đăng nhập. Luồng này đã có sẵn, không được nhận là tính năng mới do Phát xây dựng.

**Phiên và phần phụ thuộc:** cookie `retailsense_access` là HttpOnly, SameSite=Lax, Secure khi chạy production. JWT mặc định 8 giờ, cấu hình cho phép 1 giây đến 24 giờ. Guard kiểm tra chữ ký HS256, hạn dùng và tài khoản hiện tại; tài khoản bị vô hiệu hóa/xóa mềm mất quyền truy cập. Token đặt lại mật khẩu có hạn 30 phút, lưu SHA-256, dùng một lần; gửi thư qua SMTP/Mailpit.

### Giới hạn cần biết

- Chưa có Register công khai, refresh token, bảng thu hồi JWT hoặc giới hạn tần suất đăng nhập trong module đã kiểm tra. Các thay đổi này cần nhóm trưởng quyết định, không giao Phát tự triển khai.
- Logout chỉ xóa cookie; đổi mật khẩu không thu hồi mọi JWT đã phát hành. Không trình bày là đã có chức năng đăng xuất toàn bộ thiết bị.
- `normalize()` kiểm tra trạng thái người dùng và kiểu cửa hàng được gán; không trực tiếp kiểm tra cờ hoạt động của cửa hàng trong hàm này.
- Frontend chưa có script kiểm thử tự động riêng trong `package.json`. Backend dùng `node:test`, không dùng Jest. Phát cần bổ sung test thiếu, không chép lại các test đã có.

## 3. Clone và chạy trên máy Phát

### Cách A – Bộ cài Windows có sẵn

Chọn một thư mục mới trên máy Phát, cài Git nếu chưa có rồi chạy PowerShell:

```powershell
git clone --branch feature/phat-auth --single-branch https://github.com/ngonguyenthanhdam/smart-retail-mvp.git smart-retail-phat-auth
Set-Location smart-retail-phat-auth
git branch --show-current
git log --oneline -3
.\Setup-SmartRetail.bat
```

Bộ cài tải công cụ/thư viện, tạo PostgreSQL cục bộ, file cấu hình riêng, chạy migration và khởi tạo ADMIN. Không chép `.env` hoặc database của nhóm trưởng sang máy Phát. Mật khẩu ban đầu được tạo ngẫu nhiên trong `.local/first-login.txt`; chỉ đọc riêng trên máy, không đưa lên GitHub hay ảnh báo cáo.

Sau khi bộ cài báo hoàn tất:

```powershell
.\Start-SmartRetail.bat
```

Mở [Login](http://localhost:3000/login). Không có trang Register. Tạo quản lý/nhân viên qua ADMIN ở `/users` sau khi có cửa hàng hoạt động trong `/stores`.

**Giới hạn đã gặp:** build mặc định bằng Turbopack lỗi tiến trình CSS trên máy bàn giao. Vì bộ cài cũng gọi build mặc định, không khẳng định bộ cài chắc chắn hoàn tất trên máy Phát. Nếu gặp lỗi tương tự, giữ nguyên cấu hình/dữ liệu và dùng cách B để kiểm tra Login với Webpack; không chạy reset hoặc thay phiên bản thư viện tùy ý.

### Cách B – Chạy riêng phần cần cho Login

Điều kiện: Node.js **22.13 trở lên trong dòng 22.x**, npm và PostgreSQL 17 sẵn sàng. Login cần backend, frontend và PostgreSQL; không gọi Python/Ollama. Bộ khởi động toàn ứng dụng vẫn kiểm tra Python 3.11, ML và các công cụ cục bộ. Mailpit chỉ cần để nhận thư khôi phục mật khẩu.

Nếu chưa có database development, dùng công cụ PostgreSQL đã có trên PATH để tạo role và hai database mới; không chạy lại nếu đã tồn tại:

```powershell
createuser --host localhost --port 5432 --username postgres --pwprompt retailsense_phat
createdb --host localhost --port 5432 --username postgres --owner retailsense_phat retailsense_phat_dev
createdb --host localhost --port 5432 --username postgres --owner retailsense_phat retailsense_phat_test
```

Trên máy dùng bộ cài tự động, giữ database và cổng mà bộ cài đã cấp; có thể là 5432–5442. Không tạo lại theo lệnh trên. Các lệnh dưới chạy từ thư mục gốc clone:

```powershell
if (-not (Test-Path backend/.env)) { Copy-Item .env.example backend/.env }
if (-not (Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
```

Điền trong `backend/.env`: `DATABASE_URL` tới database development của Phát; `TEST_DATABASE_URL` tới database **khác** có tên kết thúc `_test`; `JWT_SECRET` ngẫu nhiên ít nhất 32 byte; `JWT_EXPIRES_IN=8h`; `FRONTEND_ORIGIN=http://localhost:3000`; `PORT=3001`; `NODE_ENV=development`; bốn biến `INITIAL_ADMIN_*` cho tài khoản đầu tiên. `ML_SERVICE_URL` có thể giữ giá trị mẫu. Mật khẩu ADMIN khởi tạo cần 12–72 byte; đây là yêu cầu bootstrap, khác mức tối thiểu 8 ký tự khi ADMIN tạo người dùng. Frontend dùng `NEXT_PUBLIC_API_URL=http://localhost:3001`.

Có thể tạo JWT secret trên máy riêng bằng `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`, sau đó lưu vào `.env`. Không chụp hoặc chia sẻ giá trị này. Dùng cùng hostname `localhost` cho frontend/API khi chạy cục bộ.

Terminal backend, chỉ sau khi xác nhận `DATABASE_URL` là database development riêng:

```powershell
Set-Location backend
npm.cmd ci
npm.cmd run prisma:migrate
npm.cmd run prisma:seed
npm.cmd run dev
```

Terminal thứ hai, từ gốc clone:

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run dev -- --webpack
```

Để kiểm tra bản build: `npm.cmd run build -- --webpack`, rồi `npm.cmd start` trong frontend, sau khi dừng frontend dev bằng Ctrl+C. Không cần thay `package.json`. Backend có thể chạy bản build bằng `npm.cmd run build` rồi `npm.cmd start` trong terminal backend.

Kiểm tra [backend health](http://localhost:3001/health), mở Login và tự nhập tài khoản ADMIN cục bộ. Trong DevTools → Network, xem trạng thái `POST /auth/login` và `GET /auth/me`; không xuất cookie, mật khẩu hoặc token vào báo cáo. Các cổng mặc định khác: ML 8000, Mailpit SMTP 1025 và hộp thư 8025. Ollama là tùy chọn, không cần cài để làm Login.

## 4. Công việc mới giao Phát

### P1 – Hiểu và giải thích code nền

- **Mục tiêu:** trình bày đúng Login và cách ADMIN cấp tài khoản, không nhầm với Register.
- **File:** `login-form.tsx`, `auth-provider.tsx`, `frontend/src/lib/auth.ts`, `auth.controller.ts`, `auth.service.ts`, `auth-boundary.tsx` ở các đường dẫn phần 2.
- **Thực hiện:** lần theo `handleSubmit → signIn → login`, vẽ luồng ngắn; tự ghi kết quả vào phần “Nhật ký công việc của Phát” cuối tài liệu.
- **Hoàn thành/kiểm chứng:** mở được từng hàm trong VS Code, giải thích cookie, bcrypt, lỗi 401 và điều hướng theo vai trò trong khoảng 3 phút. Ghi đúng phần đã có từ commit gốc.

### P2 – Bổ sung nút hiện/ẩn mật khẩu ở Login

- **Mục tiêu:** giúp người dùng kiểm tra mật khẩu đã nhập; hiện chưa có nút này.
- **File:** `frontend/src/components/login-form.tsx`, `frontend/src/i18n/vi.ts`; chỉ sửa CSS nếu thực sự cần.
- **Thực hiện:** thêm trạng thái hiện/ẩn, nút `type="button"`, nhãn tiếng Việt có thể đọc bởi công cụ hỗ trợ; không đổi payload, không lưu mật khẩu vào localStorage.
- **Hoàn thành:** nút không gửi form, không mất nội dung khi chuyển, dùng được bằng bàn phím, mặc định ẩn; đăng nhập vẫn giữ các lỗi và trạng thái tải hiện có.
- **Kiểm chứng:** kiểm tra tại 390px và màn hình desktop; tab đến nút, Enter/Space đổi trạng thái; chạy frontend lint/typecheck/build. Chỉ nhận đóng góp sau khi tự làm và kiểm tra thực tế.

### P3 – Bổ sung kiểm thử đầu vào còn thiếu

- **Mục tiêu:** mở rộng có ích bộ test xác thực hiện có.
- **File:** `backend/test/auth.integration.test.cjs`, `backend/test/auth-policy.test.cjs`; đọc `backend/test/test-database.cjs` trước khi chạy.
- **Thực hiện:** trước tiên đọc test có sẵn. Bổ sung các trường hợp chưa được kiểm tra trực tiếp: identifier chỉ khoảng trắng; identifier 256 ký tự; username/email có khoảng trắng hai đầu vẫn đăng nhập đúng; mật khẩu rỗng và mật khẩu chứa khoảng trắng không bị tự trim. Sử dụng fixture riêng, tự dọn bản ghi do test tạo.
- **Hoàn thành:** xác nhận 401 cho dữ liệu sai, 200 cho identifier được trim hợp lệ; test thất bại nếu hành vi cần bảo vệ bị phá; không gọi database ứng dụng.
- **Kiểm chứng:** chạy nhóm test dưới đây trên database `_test` riêng. Không viết lại các ca đã có: sai mật khẩu, tài khoản không tồn tại, token hết hạn, quyền và tài khoản vô hiệu hóa.

### P4 – Ghi bằng chứng, hoàn thiện demo và mở Pull Request

- **Mục tiêu:** báo cáo đúng thay đổi mới do Phát thực hiện.
- **File:** tài liệu này và các file Phát thực sự sửa ở P2/P3.
- **Thực hiện:** ghi commit hash, mô tả trước/sau, lệnh test và kết quả; tự kiểm tra đăng nhập đúng/sai, bỏ trống, lỗi mạng, reload, đăng xuất và điều hướng ba vai trò. Register ghi “không áp dụng”; kiểm tra tạo tài khoản qua ADMIN nếu được giao thêm.
- **Hoàn thành/kiểm chứng:** có nhật ký test thật, diff chỉ liên quan nhiệm vụ, PR gửi nhóm trưởng review. Không ghi đã đạt đối với trường hợp chưa chạy.

Không giao Phát tự sửa JWT, CORS, quyền, chính sách mật khẩu, schema hoặc xử lý thu hồi phiên. Nếu gặp vấn đề, ghi cách tái hiện và gửi nhóm trưởng quyết định phạm vi.

## 5. Kiểm thử và kết quả bàn giao

Sau khi cấu hình `TEST_DATABASE_URL` đúng, chạy trong backend:

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run prisma:migrate:test
node --test --test-concurrency=1 test/auth-policy.test.cjs test/auth.integration.test.cjs test/password-reset.integration.test.cjs test/users.integration.test.cjs
```

Migration ở đây áp dụng cấu trúc có sẵn lên database test, không sửa migration. Các test tạo/dọn fixture; phải dùng database `_test` riêng, không chứa dữ liệu cần giữ. Bộ test gọi toàn AppModule, nên cần toàn bộ migration chứ không chỉ bảng người dùng. Không dùng `prisma migrate reset`.

| Kiểm tra đã thực hiện từ worktree | Kết quả |
| --- | --- |
| Cây mã nguồn lúc tạo nhánh so với commit gốc | Khớp, tree `9957db2b2d30069ead7e1ffd2398f9e6ff228388` |
| `npm ci --no-audit --no-fund` ở frontend và backend | Đạt; không sửa package-lock, không thực hiện đánh giá lỗ hổng dependency |
| Backend build, typecheck, lint | Đạt |
| Frontend lint, typecheck | Đạt |
| Frontend `npm run build` mặc định | Không đạt trên máy này: Turbopack lỗi tiến trình xử lý CSS; lặp lại ngoài sandbox vẫn lỗi |
| Frontend `npm run build -- --webpack` | Đạt; sinh 23 trang |
| 4 file test xác thực/quyền/khôi phục/người dùng nêu trên | **75 test đạt, 0 lỗi, 0 bỏ qua** |
| UI với backend thật: trường trống, sai mật khẩu | Đạt; mật khẩu sai nhận 401 |
| UI: lỗi mạng giả lập và phục hồi nút gửi; độ rộng 390px | Đạt, không tràn ngang ở kích thước đã kiểm tra |
| UI: điều hướng ADMIN/quản lý/STAFF, reload, logout, chặn trang | Đạt với **phản hồi xác thực giả lập**, không phải một lượt đăng nhập đúng xuyên suốt backend–trình duyệt |

Môi trường xác minh dùng Node 22.17.0 và PostgreSQL 17 có sẵn; tạo cluster riêng trong thư mục ignored của worktree, cổng 55439, database `phat_auth_dev` và `phat_auth_handoff_test`. Chỉ hai database mới này được migrate/seed/test. Web/API kiểm tra dùng 3300/3301 để không chiếm cổng ứng dụng của nhóm trưởng; các cổng này không phải cấu hình mặc định khi Phát clone.

**Chưa kiểm chứng:** cài toàn bộ công cụ từ đầu trên một máy Windows sạch; chạy ML/Ollama và SMTP thật; đăng nhập đúng xuyên suốt bằng trình duyệt với tài khoản thật. Login đúng đã đạt trong kiểm thử API. Chuyển mật khẩu kiểm thử sang công cụ trình duyệt bị xét duyệt tự động từ chối vì rủi ro lộ thông tin; vì vậy kiểm tra điều hướng dùng dữ liệu giả lập. Không đưa mật khẩu/token vào tài liệu hoặc commit.

## 6. Git và cách chứng minh đóng góp

Sau clone, xác nhận đang ở đúng nhánh:

```powershell
git branch --show-current
git status
git config user.name
git config user.email
```

Chỉ trên máy của Phát, nếu chưa đúng danh tính, tự đặt tên/email của Phát bằng `git config user.name` và `git config user.email`. Không sửa author các commit cũ, không dùng `--amend`, reset, rebase hay force push để gán đóng góp.

Ví dụ **sau khi Phát thực sự hoàn thành P2**, xem và stage đúng file đã sửa:

```powershell
git diff -- frontend/src/components/login-form.tsx frontend/src/i18n/vi.ts
git add frontend/src/components/login-form.tsx frontend/src/i18n/vi.ts
git diff --cached --stat
git diff --cached
git commit -m "ui(auth): add accessible password visibility toggle"
git push origin feature/phat-auth
```

P3 có thể dùng `test(auth): cover whitespace and identifier boundaries`; tài liệu dùng `docs(auth): record verified login test results`. Chỉ đặt message phù hợp thay đổi thật; không commit `.env`, tài khoản, cookie, ảnh lộ thông tin hoặc dữ liệu PostgreSQL.

Để so sánh với nhánh chính sau một bản clone `--single-branch`:

```powershell
git fetch origin smart-retail-mvp:refs/remotes/origin/smart-retail-mvp
git diff --stat origin/smart-retail-mvp...HEAD
git log --oneline origin/smart-retail-mvp..HEAD
```

Trên GitHub chọn **Pull requests → New pull request**, base **`smart-retail-mvp`**, compare **`feature/phat-auth`**. Base này thay cho `main` vì là nhánh chính thực tế đã được nhóm trưởng chọn. Mô tả thay đổi mới, các test và giới hạn; gửi Luân review, chưa được duyệt thì không merge. Nếu bị từ chối push vì nhánh remote đã tiến lên, dừng và trao đổi với nhóm trưởng, không force push.

Code Login có sẵn từ commit gốc không xuất hiện như code mới trong PR. Commit chuẩn bị ban đầu chỉ chứa tài liệu này và dùng danh tính Git hiện có trên máy nhóm trưởng; không được tính là commit của Phát. Thư mục `docs/` vốn bị ignore: người chuẩn bị chỉ thêm bắt buộc đúng file bàn giao vào Git, không bỏ qua bảo vệ cho toàn bộ thư mục hay đưa tài liệu riêng khác lên repository.

## 7. Kịch bản demo của Phát và nhật ký

1. **1 phút:** mở VS Code, chỉ `login-form.tsx` và `auth.service.ts`; giải thích frontend → API → kiểm tra tài khoản → cookie → chuyển trang. Nói rõ không có Register công khai.
2. **2 phút:** trên máy mình, tự nhập tài khoản demo, thử trống/sai/đúng, reload và đăng xuất. Không chiếu file mật khẩu hoặc nội dung token.
3. **1 phút:** chỉ thay đổi mới thực hiện, ví dụ nút hiện/ẩn; mở hàm và giải thích vì sao không ảnh hưởng API.
4. **1 phút:** mở kết quả test, GitHub commit và PR; phân biệt code nền với diff mới, nêu phần chưa kiểm chứng.

Nhật ký sau đây để Phát tự điền sau khi làm; không phải xác nhận đã hoàn thành:

| Nhiệm vụ | Commit của Phát | Bằng chứng kiểm thử | Trạng thái |
| --- | --- | --- | --- |
| P1 – Giải thích luồng | Chưa có | Chưa ghi | Được giao |
| P2 – Hiện/ẩn mật khẩu | Chưa có | Chưa ghi | Được giao |
| P3 – Test trường hợp biên | Chưa có | Chưa ghi | Được giao |
| P4 – Báo cáo và PR | Chưa có | Chưa ghi | Được giao |
