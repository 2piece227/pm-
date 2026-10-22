/**
 * 한글 검색창 — 입력할 때마다 화면 전체를 다시 그리면 입력창이 새로 만들어져
 * 조합 중이던 글자가 "ㄹ ㅣ ㅈ ㅏ"처럼 풀린다. 그래서 결과 목록 하나만 바꿔 끼운다.
 *
 * @param {HTMLInputElement} input   검색창 (그대로 둔다)
 * @param {() => string} renderHtml  지금 상태로 그린 전체 HTML
 * @param {string} selector          바꿔 끼울 결과 목록 선택자
 * @param {(el: Element) => void} wire  새 목록에 이벤트를 다시 단다
 * @param {(value: string) => void} setQuery
 */
export function bindLiveSearch(input, { setQuery, renderHtml, selector, wire, scope = document }) {
  const apply = () => {
    setQuery(input.value);
    const tmp = document.createElement('div');
    tmp.innerHTML = renderHtml();
    const fresh = tmp.querySelector(selector), cur = scope.querySelector(selector);
    if (fresh && cur) { cur.replaceWith(fresh); wire(fresh); }
  };
  input.oninput = apply;
  input.addEventListener('compositionend', apply);
}
