/**
 * 계정 — 회원가입·로그인·로그아웃·프로필(닉네임). Supabase Auth 위에 얹는다.
 *
 * 왜 이 구조인가:
 *   - 게임은 정적 사이트(GitHub Pages)라 계정은 외부 서비스(Supabase)가 맡는다.
 *   - 로그인 없이도 지금처럼 오프라인으로 플레이한다. 계정은 앞으로 붙일 온라인 기능(랭킹·대전·클라우드 저장)의 자리.
 *   - 설정(주소·공개 키)이 없으면 accountEnabled()가 false — 화면은 "준비 중"으로 두고 나머지는 그대로 돈다.
 *   - 공개 키(anon key)는 브라우저에 그대로 노출되는 값이다. 데이터 보호는 DB의 행 단위 보안(RLS)이 맡는다
 *     (supabase/migrations/0001_accounts.sql).
 *
 * 설정: Vite 환경 변수 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (docs/accounts.md).
 */
const URL_ = import.meta.env?.VITE_SUPABASE_URL || '';
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

/** 닉네임·비밀번호 규칙 — DB 제약(0001_accounts.sql)과 같게 맞춘다 */
export const ACCOUNT_RULES = { nicknameMin: 2, nicknameMax: 12, passwordMin: 8 };

let client = null;
let testClient = null;
/** 테스트용: 가짜 Supabase 클라이언트를 끼운다 (null이면 원래대로) */
export function setAccountClientForTest(c) { testClient = c; }

export const accountEnabled = () => !!(testClient || (URL_ && KEY));
/* 라이브러리는 계정 기능을 실제로 쓸 때만 불러온다 (설정이 없으면 게임 용량에 안 들어간다) */
async function sb() {
  if (testClient) return testClient;
  if (!accountEnabled()) return null;
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }));
  return client;
}

const fail = (msg) => ({ ok: false, msg });
const DISABLED = '계정 기능이 아직 연결되지 않았습니다.';

/** Supabase 오류 → 한국어 안내 */
export function accountErrorKo(error) {
  const m = String(error?.message || error || '');
  if (/invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (/email not confirmed/i.test(m)) return '이메일 인증을 아직 마치지 않았습니다. 받은 메일의 링크를 눌러 주세요.';
  if (/already registered|already been registered|user already exists/i.test(m)) return '이미 가입된 이메일입니다.';
  if (/profiles_nickname_key|duplicate key.*nickname|nickname.*taken/i.test(m)) return '이미 쓰고 있는 닉네임입니다.';
  /* 가입 트리거가 실패하면(대개 닉네임이 동시에 선점됨) Supabase는 이 문구만 돌려준다 */
  if (/database error saving new user/i.test(m)) return '가입 처리 중 문제가 생겼습니다. 다른 닉네임으로 다시 시도해 주세요.';
  if (/password should be at least|weak password/i.test(m)) return `비밀번호는 ${ACCOUNT_RULES.passwordMin}자 이상이어야 합니다.`;
  if (/rate limit|too many requests|security purposes/i.test(m)) return '요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요.';
  if (/invalid email|unable to validate email/i.test(m)) return '이메일 형식이 올바르지 않습니다.';
  if (/failed to fetch|network/i.test(m)) return '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.';
  return `계정 처리 중 문제가 생겼습니다. (${m || '알 수 없는 오류'})`;
}

/** 입력 검사 — 서버에 보내기 전에 걸러서 바로 알려 준다 */
export function validateSignUp({ email, password, nickname }) {
  const nick = String(nickname || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(String(email || '').trim())) return '이메일 형식이 올바르지 않습니다.';
  if (String(password || '').length < ACCOUNT_RULES.passwordMin) return `비밀번호는 ${ACCOUNT_RULES.passwordMin}자 이상이어야 합니다.`;
  if (nick.length < ACCOUNT_RULES.nicknameMin || nick.length > ACCOUNT_RULES.nicknameMax) return `닉네임은 ${ACCOUNT_RULES.nicknameMin}~${ACCOUNT_RULES.nicknameMax}자입니다.`;
  if (!/^[0-9A-Za-z가-힣_]+$/.test(nick)) return '닉네임은 한글·영문·숫자·밑줄(_)만 쓸 수 있습니다.';
  return null;
}

/** 지금 로그인한 사용자 { id, email, nickname } (없으면 null) */
export async function currentAccount() {
  const c = await sb();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  const user = data?.session?.user;
  if (!user) return null;
  return { id: user.id, email: user.email, nickname: (await getNickname(user.id)) || user.user_metadata?.nickname || null };
}

async function getNickname(id) {
  const { data, error } = await (await sb()).from('profiles').select('nickname').eq('id', id).maybeSingle();
  return error ? null : data?.nickname || null;
}

/** 닉네임을 쓸 수 있나 (가입 전 확인) — DB 함수 nickname_available */
export async function nicknameAvailable(nickname) {
  const c = await sb();
  if (!c) return fail(DISABLED);
  const { data, error } = await c.rpc('nickname_available', { nick: String(nickname).trim() });
  if (error) return fail(accountErrorKo(error));
  return { ok: true, available: !!data };
}

/**
 * 회원가입 — 닉네임은 가입 정보에 실어 보내고, DB 트리거가 프로필을 만든다(이메일 인증을 켜도 동작).
 * @returns {{ok, msg, needsConfirm?}}
 */
export async function signUp({ email, password, nickname }) {
  const c = await sb();
  if (!c) return fail(DISABLED);
  const bad = validateSignUp({ email, password, nickname });
  if (bad) return fail(bad);
  const nick = String(nickname).trim();
  const free = await nicknameAvailable(nick);
  if (free.ok && !free.available) return fail('이미 쓰고 있는 닉네임입니다.');
  const { data, error } = await c.auth.signUp({ email: String(email).trim(), password, options: { data: { nickname: nick } } });
  if (error) return fail(accountErrorKo(error));
  /* 이메일 인증을 켠 프로젝트는 세션 없이 돌아온다 — 메일 확인 안내 */
  if (!data?.session) return { ok: true, needsConfirm: true, msg: '가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.' };
  return { ok: true, msg: `${nick}님, 가입을 환영합니다!` };
}

export async function signIn({ email, password }) {
  const c = await sb();
  if (!c) return fail(DISABLED);
  if (!email || !password) return fail('이메일과 비밀번호를 입력해 주세요.');
  const { error } = await c.auth.signInWithPassword({ email: String(email).trim(), password });
  if (error) return fail(accountErrorKo(error));
  const me = await currentAccount();
  return { ok: true, msg: `${me?.nickname || '트레이너'}님, 어서 오세요!` };
}

export async function signOut() {
  const c = await sb();
  if (!c) return fail(DISABLED);
  const { error } = await c.auth.signOut();
  if (error) return fail(accountErrorKo(error));
  return { ok: true, msg: '로그아웃했습니다.' };
}

/** 비밀번호 재설정 메일 */
export async function sendPasswordReset(email) {
  const c = await sb();
  if (!c) return fail(DISABLED);
  if (!/^\S+@\S+\.\S+$/.test(String(email || '').trim())) return fail('이메일 형식이 올바르지 않습니다.');
  const redirectTo = typeof location !== 'undefined' ? location.origin + location.pathname : undefined;
  const { error } = await c.auth.resetPasswordForEmail(String(email).trim(), { redirectTo });
  if (error) return fail(accountErrorKo(error));
  return { ok: true, msg: '비밀번호 재설정 메일을 보냈습니다.' };
}

/** 로그인 상태가 바뀔 때마다 cb(account|null). 해제 함수를 돌려준다 */
export function onAccountChange(cb) {
  let sub = null, stopped = false;
  sb().then((c) => {
    if (!c || stopped) return;
    sub = c.auth.onAuthStateChange(() => { currentAccount().then(cb, () => cb(null)); }).data?.subscription;
  });
  return () => { stopped = true; sub?.unsubscribe(); };
}
