-- 계정 1단계: 프로필(닉네임) — Supabase 대시보드 SQL Editor에서 한 번 실행한다 (docs/accounts.md).
-- 앞으로 붙일 온라인 기능(랭킹·대전·클라우드 저장) 테이블은 이 profiles.id(= auth.users.id)를 기준으로 건다.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null
    check (char_length(nickname) between 2 and 12 and nickname ~ '^[0-9A-Za-z가-힣_]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 닉네임은 대소문자 구분 없이 하나만
create unique index if not exists profiles_nickname_key on public.profiles (lower(nickname));

-- 행 단위 보안: 닉네임은 누구나 볼 수 있고(랭킹·대전 상대 표시용), 고치는 건 본인만
alter table public.profiles enable row level security;
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
-- insert는 아래 트리거만 한다 (클라이언트 insert 정책 없음)

-- 가입하면 프로필을 만든다 — 닉네임은 가입 정보(user_metadata.nickname)에서. 이메일 인증을 켜도 동작한다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), 'trainer_' || substr(new.id::text, 1, 6)));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 가입 전에 닉네임을 쓸 수 있는지 (로그인 전이라 anon도 부른다)
create or replace function public.nickname_available(nick text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(nickname) = lower(trim(nick)));
$$;
grant execute on function public.nickname_available(text) to anon, authenticated;

-- 닉네임을 바꾸면 updated_at 갱신
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
