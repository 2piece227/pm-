# 계정(로그인·회원가입) 연결하기 — Supabase

게임은 GitHub Pages 정적 사이트라 계정은 Supabase가 맡는다. 연결 전에는 타이틀 오른쪽 위 버튼이 **계정 (준비 중)** 으로 꺼져 있고, 게임은 지금처럼 오프라인으로 돈다.

## 1. Supabase 프로젝트 만들기
1. https://supabase.com 에 가입 → **New project** (무료 요금제로 충분). 지역은 서울(Northeast Asia)을 고른다.
2. 프로젝트가 만들어지면 **Project Settings → API**에서 두 값을 복사한다.
   - **Project URL** (예: `https://abcd1234.supabase.co`)
   - **anon public** 키 — 브라우저에 공개되는 키다. 데이터 보호는 DB의 RLS 정책이 한다. **service_role 키는 절대 넣지 않는다.**

## 2. DB 설정 (한 번)
**SQL Editor → New query**에 `supabase/migrations/0001_accounts.sql` 내용을 붙여 넣고 **Run**.
- `profiles` 테이블(닉네임 2~12자, 한글·영문·숫자·_, 대소문자 무시 중복 불가)
- 행 단위 보안: 닉네임은 누구나 읽기(랭킹·대전 표시용), 수정은 본인만
- 가입하면 프로필을 자동으로 만드는 트리거, 가입 전 닉네임 중복 확인 함수 `nickname_available`

## 3. 로그인 설정
**Authentication → URL Configuration**
- **Site URL**: `https://2piece227.github.io/pm-/`
- **Redirect URLs**에 같은 주소 추가 (가입 확인·비밀번호 재설정 메일의 링크가 여기로 돌아온다)

**Authentication → Providers → Email**: 켜져 있으면 된다. "Confirm email"을 켜 두면 가입 후 메일 인증을 거쳐야 로그인된다(게임이 그 안내를 띄운다). 무료 요금제 기본 메일은 시간당 발송 수 제한이 있다.

## 4. 게임에 값 넣기
- **배포(GitHub Pages)**: 저장소 **Settings → Secrets and variables → Actions → Variables** 탭에서
  - `SUPABASE_URL` = Project URL
  - `SUPABASE_ANON_KEY` = anon public 키
  를 만들고, main에 아무 커밋이나 올리거나 Actions에서 배포를 다시 돌린다.
- **내 컴퓨터에서 개발할 때**: 프로젝트 루트에 `.env.local` 파일을 만들고
  ```
  VITE_SUPABASE_URL=https://abcd1234.supabase.co
  VITE_SUPABASE_ANON_KEY=…
  ```
  (`.env.local`은 git에 올라가지 않는다.)

## 지금 되는 것 / 다음 단계
- 회원가입(이메일·비밀번호·닉네임), 로그인, 로그아웃, 비밀번호 재설정 메일, 로그인 유지.
- 게임 저장은 아직 기기(브라우저)에만 된다. 랭킹·대전·클라우드 저장은 `profiles.id`를 기준으로 테이블을 추가해 얹는다 (`supabase/migrations/0002_…`).
