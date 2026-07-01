# Ghi điểm cầu lông (2v2)

Web ghi điểm cầu lông cho team, mỗi set là 2 đấu 2, dữ liệu lưu trên Supabase, deploy bằng Vercel.

## 1. Tạo bảng trên Supabase

Vào Supabase project → SQL Editor → chạy:

```sql
create table badminton_matches (
  id uuid primary key default gen_random_uuid(),
  match_date date not null,
  team_a_player1 text not null,
  team_a_player2 text not null,
  team_b_player1 text not null,
  team_b_player2 text not null,
  score_a int not null,
  score_b int not null,
  note text,
  created_at timestamptz default now()
);

alter table badminton_matches enable row level security;

create policy "public read" on badminton_matches
  for select using (true);

create policy "public insert" on badminton_matches
  for insert with check (true);

create policy "public delete" on badminton_matches
  for delete using (true);
```

> Policy trên cho phép đọc, ghi và xoá công khai. Cách này chỉ phù hợp khi app dùng nội bộ và bạn chấp nhận rủi ro ai có đường dẫn cũng có thể sửa dữ liệu. Nếu cần an toàn hơn, hãy thêm Supabase Auth và giới hạn policy theo người dùng đã đăng nhập.

Lấy `Project URL` và `anon public key` trong Supabase → Project Settings → API.

## 2. Chạy local

```bash
npm install
cp .env.local.example .env.local
# rồi điền NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY vào .env.local
npm run dev
```

Mở http://localhost:3000

## 3. Deploy lên Vercel

1. Đẩy code này lên một GitHub repo.
2. Vào https://vercel.com → New Project → Import repo vừa tạo.
3. Ở bước cấu hình, vào **Environment Variables** thêm:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Bấm Deploy.

Hoặc dùng Vercel CLI:

```bash
npm i -g vercel
vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

## Cấu trúc dự án

```txt
app/
  layout.tsx        # Root layout
  page.tsx          # Trang chính: chọn ngày, ghi điểm, lịch sử
  globals.css       # Style toàn cục
lib/
  supabaseClient.ts # Khởi tạo Supabase client từ env var
```
