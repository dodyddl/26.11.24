/* Browser-only Gemini tutor. The API key lives only in this page's memory. */
function createGeminiTutor(settings) {
  const model = 'gemini-3.8-flash';
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
  const styles = document.createElement('style');
  styles.textContent = `
    #anatomy-study-redesign .ai-panel { border:1px solid #d9e4f0; border-radius:12px; padding:10px; background:#fff; min-width:0 }
    #anatomy-study-redesign .ai-panel summary { color:#254e78; font-weight:700; cursor:pointer }
    #anatomy-study-redesign .ai-panel form { display:grid; gap:8px; margin-top:8px }
    #anatomy-study-redesign .ai-panel label { font-weight:650 }
    #anatomy-study-redesign .ai-panel input,
    #anatomy-study-redesign .ai-panel textarea { width:100%; min-width:0; padding:8px; border:1px solid #bbcbe2; border-radius:8px; font:inherit; color:#223a59; background:#fff }
    #anatomy-study-redesign .ai-panel small { color:#53657d }
    #anatomy-study-redesign .ai-response { white-space:pre-wrap; overflow-wrap:anywhere; margin-top:8px }
  `;
  document.head.append(styles);
  settings.innerHTML = `<details class="ai-panel"><summary>Gemini API 키 설정</summary>
    <form>
      <label for="gemini-user-key">내 API 키</label>
      <input id="gemini-user-key" type="password" autocomplete="off" spellcheck="false" required>
      <small>키는 새로고침하면 지워져요. 질문을 보내면 Google Gemini API가 처리해요.</small>
      <button class="study-primary" type="submit">키 적용</button>
      <button class="study-back" type="button" data-clear-key>키 지우기</button>
      <p role="status" data-key-status></p>
    </form>
  </details>`;

  const keyField = settings.querySelector('input');
  const keyStatus = settings.querySelector('[data-key-status]');
  let apiKey = '';
  let activeRequest;

  function cancel() {
    activeRequest?.abort();
    activeRequest = undefined;
  }

  settings.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = keyField.value.trim();
    if (!value) return;
    cancel();
    apiKey = value;
    keyField.value = '';
    keyStatus.textContent = '이 탭에서 사용할 키를 적용했어요.';
  });

  settings.querySelector('[data-clear-key]').addEventListener('click', () => {
    cancel();
    apiKey = '';
    keyField.value = '';
    keyStatus.textContent = 'API 키를 지웠어요.';
  });

  function questionPanel(question, picked) {
    const panel = document.createElement('details');
    panel.className = 'ai-panel';
    panel.innerHTML = `<summary>Gemini에게 질문하기</summary>
      <form>
        <label for="gemini-followup">헷갈리는 부분이 있나요?</label>
        <textarea id="gemini-followup" rows="2" maxlength="500" placeholder="예: 내 답과 정답의 차이를 쉽게 설명해줘"></textarea>
        <small>질문과 현재 문항의 내용이 Google에 전달돼요. 개인 정보는 입력하지 마세요.</small>
        <button class="study-primary" type="submit">질문 보내기</button>
      </form>
      <p class="ai-response" role="status" aria-live="polite"></p>`;

    const form = panel.querySelector('form');
    const submit = form.querySelector('button');
    const response = panel.querySelector('.ai-response');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      if (!apiKey) {
        response.textContent = '먼저 Gemini API 키를 설정해 주세요.';
        settings.querySelector('details').open = true;
        keyField.focus();
        return;
      }

      cancel();
      const request = new AbortController();
      activeRequest = request;
      submit.disabled = true;
      response.textContent = 'Gemini가 설명을 작성하고 있어요…';
      const timer = setTimeout(() => request.abort(), 35000);
      const learnerQuestion = form.querySelector('textarea').value.trim() ||
        '이 문제의 핵심 개념과 정답인 이유를 쉽게 설명해줘.';
      try {
        const result = await fetch(endpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
          signal: request.signal,
          body: JSON.stringify({
            systemInstruction: {parts: [{text: '당신은 한국어 해부생리 학습 튜터입니다. 현재 문항의 맥락을 바탕으로 핵심 개념을 쉽게 설명하세요. 확실하지 않은 것은 명시하고, 짧은 일반 텍스트로 답하세요.'}]},
            contents: [{role: 'user', parts: [{text: [
              '단원: ' + question.unit,
              '개념: ' + question.concept,
              '현재 문제: ' + question.prompt,
              '보기: ' + question.options.join(' / '),
              '내 답: ' + question.options[picked],
              '정답: ' + question.options[question.answer],
              '기본 해설: ' + question.detail,
              '추가 질문: ' + learnerQuestion,
            ].join('\n')}]}],
            generationConfig: {maxOutputTokens: 2048},
          }),
        });
        if (!result.ok) {
          if (result.status === 400 || result.status === 401 || result.status === 403) {
            throw new Error('API 키와 Gemini 모델 사용 권한을 확인해 주세요.');
          }
          if (result.status === 404) throw new Error('이 키로 Gemini 3.8 Flash 모델을 사용할 수 있는지 확인해 주세요.');
          if (result.status === 429) throw new Error('호출 한도에 도달했어요. 잠시 후 다시 시도해 주세요.');
          throw new Error('Gemini 요청에 실패했어요. 잠시 후 다시 시도해 주세요.');
        }
        const data = await result.json();
        const answer = data.candidates?.[0]?.content?.parts
          ?.filter((part) => !part.thought && typeof part.text === 'string')
          .map((part) => part.text).join('\n').trim();
        if (request.signal.aborted) return;
        response.textContent = answer || '표시할 응답이 없어요. 질문을 조금 바꿔 다시 시도해 주세요.';
      } catch (error) {
        response.textContent = request.signal.aborted
          ? '요청이 취소됐거나 시간이 초과됐어요.'
          : error instanceof TypeError
            ? 'Google API에 연결할 수 없어요. 연결 상태를 확인하고 다시 시도해 주세요.'
            : error.message;
      } finally {
        clearTimeout(timer);
        submit.disabled = false;
        if (activeRequest === request) activeRequest = undefined;
      }
    });
    return panel;
  }

  return {cancel, questionPanel};
}
