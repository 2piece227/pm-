/**
 * 계정 창 — 타이틀 메뉴의 "계정" 버튼과 로그인·회원가입·비밀번호 재설정·로그아웃 창.
 * 계정 처리는 src/net/account.js. 설정이 없으면 버튼은 "계정 (준비 중)"으로 꺼져 있다.
 */
import {
  accountEnabled, currentAccount, onAccountChange, signIn, signUp, signOut, sendPasswordReset, ACCOUNT_RULES,
} from '../net/account.js';
import { escapeHtml as esc } from './management-widgets.js';
import './account.css';

let me = null;
const listeners = new Set();
/** 다른 화면이 로그인 상태를 알고 싶을 때 */
export const accountState = () => me;
export function watchAccount(cb) { listeners.add(cb); cb(me); return () => listeners.delete(cb); }
const announce = () => { for (const cb of listeners) cb(me); };

/** 타이틀 화면 오른쪽 위에 "계정" 버튼을 붙인다 (저장이 없으면 타이틀 메뉴가 안 나와서 메뉴 밖에 둔다) */
export function mountAccountEntry(page) {
  if (!page || page.querySelector('#btn-account')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-account';
  btn.className = 'ghost account-entry';
  page.append(btn);
  const paint = () => {
    if (!accountEnabled()) { btn.textContent = '계정 (준비 중)'; btn.disabled = true; btn.title = '온라인 계정 기능은 곧 열립니다'; return; }
    btn.disabled = false;
    btn.textContent = me ? `계정 · ${me.nickname || me.email}` : '로그인 · 회원가입';
  };
  btn.onclick = () => openAccountDialog();
  watchAccount(paint);
  if (accountEnabled()) {
    currentAccount().then((a) => { me = a; announce(); }, () => {});
    onAccountChange((a) => { me = a; announce(); });
  }
  paint();
}

/** 계정 창 — 로그인 상태면 내 정보·로그아웃, 아니면 로그인/회원가입/재설정 탭 */
export function openAccountDialog(startTab = 'signin') {
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.setAttribute('aria-label', '계정');
  let tab = startTab, notice = '', busy = false, ok = false;
  const close = () => { dialog.close(); dialog.remove(); };

  const field = (id, label, type, extra = '') => `<label class="acc-field"><span>${label}</span><input id="${id}" type="${type}" ${extra}></label>`;
  const draw = () => {
    const head = `<header class="acc-head"><div><small>TRAINER ACCOUNT</small><h2>${me ? '내 계정' : tab === 'signup' ? '회원가입' : tab === 'reset' ? '비밀번호 재설정' : '로그인'}</h2></div><button class="ghost acc-close" aria-label="닫기">✕</button></header>`;
    let body;
    if (me) {
      body = `<section class="acc-me"><p><span>닉네임</span><b>${esc(me.nickname || '—')}</b></p><p><span>이메일</span><b>${esc(me.email || '—')}</b></p>
        <p class="muted">게임 저장은 지금처럼 이 기기에 됩니다. 랭킹·대전·클라우드 저장 같은 온라인 기능이 열리면 이 계정으로 이용합니다.</p>
        <div class="acc-actions"><button class="ghost" id="acc-signout" ${busy ? 'disabled' : ''}>로그아웃</button></div></section>`;
    } else {
      const tabs = `<nav class="acc-tabs">${[['signin', '로그인'], ['signup', '회원가입']].map(([k, v]) => `<button class="${tab === k ? 'selected' : 'ghost'}" data-tab="${k}">${v}</button>`).join('')}</nav>`;
      if (tab === 'signup') {
        body = `${tabs}<form class="acc-form" id="acc-form">
          ${field('acc-email', '이메일', 'email', 'autocomplete="email" required')}
          ${field('acc-password', `비밀번호 <small>${ACCOUNT_RULES.passwordMin}자 이상</small>`, 'password', `autocomplete="new-password" minlength="${ACCOUNT_RULES.passwordMin}" required`)}
          ${field('acc-nickname', `닉네임 <small>${ACCOUNT_RULES.nicknameMin}~${ACCOUNT_RULES.nicknameMax}자 · 한글·영문·숫자·_</small>`, 'text', `autocomplete="nickname" maxlength="${ACCOUNT_RULES.nicknameMax}" required`)}
          <button type="submit" ${busy ? 'disabled' : ''}>${busy ? '처리 중…' : '가입하기'}</button></form>`;
      } else if (tab === 'reset') {
        body = `<form class="acc-form" id="acc-form">${field('acc-email', '가입한 이메일', 'email', 'autocomplete="email" required')}
          <button type="submit" ${busy ? 'disabled' : ''}>${busy ? '보내는 중…' : '재설정 메일 받기'}</button>
          <button type="button" class="ghost" data-tab="signin">로그인으로</button></form>`;
      } else {
        body = `${tabs}<form class="acc-form" id="acc-form">
          ${field('acc-email', '이메일', 'email', 'autocomplete="email" required')}
          ${field('acc-password', '비밀번호', 'password', 'autocomplete="current-password" required')}
          <button type="submit" ${busy ? 'disabled' : ''}>${busy ? '로그인 중…' : '로그인'}</button>
          <button type="button" class="ghost acc-link" data-tab="reset">비밀번호를 잊었어요</button></form>`;
      }
    }
    /* 다시 그려도 입력한 값은 남긴다 */
    const keep = Object.fromEntries([...dialog.querySelectorAll('input')].map((i) => [i.id, i.value]));
    dialog.innerHTML = `${head}${body}<p class="acc-notice ${ok ? 'ok' : ''}" role="status">${esc(notice)}</p>`;
    for (const [id, v] of Object.entries(keep)) { const i = dialog.querySelector(`#${id}`); if (i && id !== 'acc-password') i.value = v; }

    dialog.querySelector('.acc-close').onclick = close;
    dialog.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; notice = ''; draw(); }));
    const val = (id) => dialog.querySelector(`#${id}`)?.value || '';
    const run = async (fn) => {
      busy = true; notice = ''; draw();
      const r = await fn().catch((e) => ({ ok: false, msg: String(e?.message || e) }));
      busy = false; ok = !!r.ok; notice = r.msg || '';
      if (r.ok && !r.needsConfirm) { me = await currentAccount().catch(() => null); announce(); }
      draw();
    };
    const form = dialog.querySelector('#acc-form');
    if (form) form.onsubmit = (e) => {
      e.preventDefault();
      /* 값은 지금 읽는다 — run이 "처리 중"으로 다시 그리면 비밀번호 칸은 비워진다 */
      const input = { email: val('acc-email'), password: val('acc-password'), nickname: val('acc-nickname') };
      if (tab === 'signup') run(() => signUp(input));
      else if (tab === 'reset') run(() => sendPasswordReset(input.email));
      else run(() => signIn(input));
    };
    const out = dialog.querySelector('#acc-signout');
    if (out) out.onclick = () => run(async () => { const r = await signOut(); if (r.ok) { me = null; announce(); } return r; });
    dialog.querySelector('input')?.focus();
  };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dialog);
  dialog.showModal();
  draw();
}
