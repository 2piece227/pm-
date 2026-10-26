// 계정(src/net/account.js): 설정 없으면 꺼짐, 입력 검사, 가입·로그인·로그아웃 흐름, 오류 한국어 안내 (가짜 Supabase로).
import assert from 'node:assert/strict';
import {
  accountEnabled, setAccountClientForTest, signUp, signIn, signOut, currentAccount, nicknameAvailable,
  sendPasswordReset, validateSignUp, accountErrorKo,
} from '../src/net/account.js';

/* 1. 설정이 없으면 꺼져 있고, 무엇을 불러도 안전하게 실패한다 */
assert.equal(accountEnabled(), false);
assert.equal(await currentAccount(), null);
assert.equal((await signIn({ email: 'a@b.c', password: 'x' })).ok, false);

/* 2. 입력 검사 (서버에 보내기 전) */
assert.match(validateSignUp({ email: 'nope', password: '12345678', nickname: '레드' }), /이메일/);
assert.match(validateSignUp({ email: 'a@b.co', password: '1234', nickname: '레드' }), /8자/);
assert.match(validateSignUp({ email: 'a@b.co', password: '12345678', nickname: '레' }), /2~12자/);
assert.match(validateSignUp({ email: 'a@b.co', password: '12345678', nickname: '레드 팀!' }), /한글·영문·숫자/);
assert.equal(validateSignUp({ email: 'a@b.co', password: '12345678', nickname: '레드_01' }), null);

/* 3. 가짜 Supabase — 가입하면 트리거처럼 프로필을 만든다 */
function fakeSupabase({ confirm = false } = {}) {
  const users = new Map(), profiles = new Map();
  let session = null; const subs = new Set();
  const emit = () => subs.forEach((f) => f('CHANGE', session));
  return {
    users, profiles,
    auth: {
      async getSession() { return { data: { session } }; },
      async signUp({ email, password, options }) {
        if ([...users.values()].some((u) => u.email === email)) return { data: {}, error: { message: 'User already registered' } };
        const user = { id: `u${users.size + 1}`, email, password, user_metadata: options?.data || {} };
        users.set(user.id, user); profiles.set(user.id, { nickname: user.user_metadata.nickname });
        if (confirm) return { data: { user, session: null }, error: null };
        session = { user }; emit();
        return { data: { user, session }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = [...users.values()].find((x) => x.email === email && x.password === password);
        if (!u) return { data: {}, error: { message: 'Invalid login credentials' } };
        session = { user: u }; emit();
        return { data: { session }, error: null };
      },
      async signOut() { session = null; emit(); return { error: null }; },
      async resetPasswordForEmail() { return { error: null }; },
      onAuthStateChange(f) { subs.add(f); return { data: { subscription: { unsubscribe: () => subs.delete(f) } } }; },
    },
    from(table) {
      assert.equal(table, 'profiles');
      return { select: () => ({ eq: (_, id) => ({ maybeSingle: async () => ({ data: profiles.get(id) || null, error: null }) }) }) };
    },
    async rpc(name, { nick }) {
      assert.equal(name, 'nickname_available');
      return { data: ![...profiles.values()].some((p) => p.nickname.toLowerCase() === nick.toLowerCase()), error: null };
    },
  };
}

const fake = fakeSupabase();
setAccountClientForTest(fake);
assert.equal(accountEnabled(), true);
let r = await signUp({ email: 'red@pallet.town', password: 'pikachu123', nickname: 'Red' });
assert(r.ok, r.msg);
assert.deepEqual(await currentAccount(), { id: 'u1', email: 'red@pallet.town', nickname: 'Red' });
assert.equal(fake.users.get('u1').user_metadata.nickname, 'Red', '닉네임은 가입 정보에 실려 트리거가 프로필을 만든다');
assert.equal((await nicknameAvailable('red')).available, false, '닉네임은 대소문자 구분 없이 하나');
r = await signUp({ email: 'blue@pallet.town', password: 'eevee12345', nickname: 'RED' });
assert(!r.ok && /닉네임/.test(r.msg), '중복 닉네임은 가입 전에 막는다');
r = await signUp({ email: 'red@pallet.town', password: 'eevee12345', nickname: 'Blue' });
assert(!r.ok && /이미 가입된 이메일/.test(r.msg));
assert((await signOut()).ok);
assert.equal(await currentAccount(), null);
r = await signIn({ email: 'red@pallet.town', password: 'wrong-pass' });
assert(!r.ok && /이메일 또는 비밀번호/.test(r.msg));
r = await signIn({ email: 'red@pallet.town', password: 'pikachu123' });
assert(r.ok && /Red님/.test(r.msg));
assert((await sendPasswordReset('red@pallet.town')).ok);

/* 4. 이메일 인증을 켠 프로젝트: 세션 없이 돌아오면 메일 확인 안내 */
setAccountClientForTest(fakeSupabase({ confirm: true }));
r = await signUp({ email: 'gold@new.bark', password: 'cyndaquil1', nickname: 'Gold' });
assert(r.ok && r.needsConfirm && /메일/.test(r.msg));
setAccountClientForTest(null);

/* 5. 오류 한국어 안내 */
assert.match(accountErrorKo({ message: 'Email not confirmed' }), /이메일 인증/);
assert.match(accountErrorKo({ message: 'Database error saving new user' }), /다른 닉네임/);
assert.match(accountErrorKo({ message: 'Failed to fetch' }), /인터넷/);

console.log('PASS: disabled without config, input validation, sign up/in/out, nickname uniqueness, duplicate email, email confirmation flow, Korean errors');
