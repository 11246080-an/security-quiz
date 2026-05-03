const DATA_URL = "data/questions.json";
const STORAGE_KEY = "securityQuizProgress.v1";

const state = {
  questions: [],
  byId: new Map(),
  progress: loadProgress(),
  session: null,
};

const els = {
  views: {
    home: document.getElementById("homeView"),
    quiz: document.getElementById("quizView"),
    result: document.getElementById("resultView"),
  },
  totalCount: document.getElementById("totalCount"),
  answeredCount: document.getElementById("answeredCount"),
  accuracy: document.getElementById("accuracy"),
  wrongCount: document.getElementById("wrongCount"),
  lastPractice: document.getElementById("lastPractice"),
  chapterSelect: document.getElementById("chapterSelect"),
  chapterProgress: document.getElementById("chapterProgress"),
  sessionTitle: document.getElementById("sessionTitle"),
  sessionProgress: document.getElementById("sessionProgress"),
  questionId: document.getElementById("questionId"),
  questionChapter: document.getElementById("questionChapter"),
  questionText: document.getElementById("questionText"),
  options: document.getElementById("options"),
  feedback: document.getElementById("feedback"),
  nextQuestion: document.getElementById("nextQuestion"),
  optionTemplate: document.getElementById("optionTemplate"),
  examSize: document.getElementById("examSize"),
  examScore: document.getElementById("examScore"),
  examCorrect: document.getElementById("examCorrect"),
  examWrong: document.getElementById("examWrong"),
  examAccuracy: document.getElementById("examAccuracy"),
  examWrongList: document.getElementById("examWrongList"),
};

document.getElementById("startChapter").addEventListener("click", startChapter);
document.getElementById("startRandom").addEventListener("click", startRandom);
document.getElementById("startExam").addEventListener("click", startExam);
document.getElementById("startWrong").addEventListener("click", startWrong);
document.getElementById("backHome").addEventListener("click", showHome);
document.getElementById("resultHome").addEventListener("click", showHome);
document.getElementById("resetProgress").addEventListener("click", resetProgress);
els.nextQuestion.addEventListener("click", nextQuestion);

init();

async function init() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.questions = await response.json();
    state.byId = new Map(state.questions.map((question) => [question.question_id, question]));
    renderHome();
  } catch (error) {
    document.body.innerHTML = `<main class="panel"><h1>無法載入題庫</h1><p>請先執行轉換程式產生 data/questions.json，並用本機伺服器開啟網站。</p><p>${escapeHtml(error.message)}</p></main>`;
  }
}

function loadProgress() {
  const blank = {
    answered: {},
    correct: {},
    wrong: {},
    correctCounts: {},
    wrongStreaks: {},
    lastPracticeAt: null,
  };
  try {
    return { ...blank, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return blank;
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function showView(name) {
  Object.values(els.views).forEach((view) => view.classList.remove("active"));
  els.views[name].classList.add("active");
}

function showHome() {
  state.session = null;
  renderHome();
  showView("home");
}

function renderHome() {
  const total = state.questions.length;
  const answeredIds = Object.keys(state.progress.answered);
  const correctIds = Object.keys(state.progress.correct);
  const wrongIds = activeWrongIds();
  els.totalCount.textContent = total;
  els.answeredCount.textContent = answeredIds.length;
  els.accuracy.textContent = percent(correctIds.length, answeredIds.length);
  els.wrongCount.textContent = wrongIds.length;
  els.lastPractice.textContent = `最近練習時間：${formatTime(state.progress.lastPracticeAt)}`;

  const chapters = chapterGroups();
  els.chapterSelect.innerHTML = chapters
    .map(([chapter]) => `<option value="${escapeHtml(chapter)}">${escapeHtml(chapter)}</option>`)
    .join("");
  els.chapterProgress.innerHTML = chapters.map(renderChapterProgress).join("");
}

function renderChapterProgress([chapter, questions]) {
  const done = questions.filter((question) => state.progress.answered[question.question_id]).length;
  const value = percentNumber(done, questions.length);
  return `
    <article class="chapter-item">
      <strong>${escapeHtml(chapter)}</strong>
      <small>${done} / ${questions.length} 題，${value}%</small>
      <div class="bar"><span style="width:${value}%"></span></div>
    </article>
  `;
}

function chapterGroups() {
  const groups = new Map();
  state.questions.forEach((question) => {
    if (!groups.has(question.chapter)) groups.set(question.chapter, []);
    groups.get(question.chapter).push(question);
  });
  return [...groups.entries()];
}

function startChapter() {
  const chapter = els.chapterSelect.value;
  const questions = state.questions.filter((question) => question.chapter === chapter);
  startSession(`${chapter}`, questions);
}

function startRandom() {
  startSession("全部隨機練習", shuffle(state.questions));
}

function startExam() {
  const requested = Number(els.examSize.value);
  const questions = shuffle(state.questions).slice(0, Math.min(requested, state.questions.length));
  startSession(`模擬考 ${questions.length} 題`, questions, true);
}

function startWrong() {
  const questions = activeWrongIds()
    .map((id) => state.byId.get(id))
    .filter(Boolean);
  if (!questions.length) {
    alert("目前沒有錯題。");
    return;
  }
  startSession("錯題本練習", shuffle(questions));
}

function startSession(title, questions, isExam = false) {
  if (!questions.length) {
    alert("這個模式目前沒有可練習的題目。");
    return;
  }
  state.session = {
    title,
    questions,
    index: 0,
    answeredCurrent: false,
    isExam,
    examCorrect: 0,
    examWrong: [],
  };
  showView("quiz");
  renderQuestion();
}

function renderQuestion() {
  const session = state.session;
  const question = session.questions[session.index];
  session.answeredCurrent = false;
  els.sessionTitle.textContent = session.title;
  els.sessionProgress.textContent = `${session.index + 1} / ${session.questions.length}`;
  els.questionId.textContent = question.question_id;
  els.questionChapter.textContent = question.chapter;
  els.questionText.textContent = question.question;
  els.feedback.textContent = "";
  els.feedback.className = "feedback";
  els.nextQuestion.classList.add("hidden");
  els.options.innerHTML = "";

  [
    ["A", question.option_a],
    ["B", question.option_b],
    ["C", question.option_c],
    ["D", question.option_d],
  ].forEach(([letter, text]) => {
    const button = els.optionTemplate.content.firstElementChild.cloneNode(true);
    button.dataset.answer = letter;
    button.querySelector("strong").textContent = letter;
    button.querySelector("span").textContent = text;
    button.addEventListener("click", () => answerQuestion(letter));
    els.options.appendChild(button);
  });
}

function answerQuestion(selected) {
  const session = state.session;
  if (!session || session.answeredCurrent) return;

  const question = session.questions[session.index];
  const correct = selected === question.answer;
  session.answeredCurrent = true;
  state.progress.lastPracticeAt = new Date().toISOString();
  state.progress.answered[question.question_id] = true;

  if (correct) {
    state.progress.correct[question.question_id] = true;
    state.progress.correctCounts[question.question_id] =
      (state.progress.correctCounts[question.question_id] || 0) + 1;
    state.progress.wrongStreaks[question.question_id] =
      (state.progress.wrongStreaks[question.question_id] || 0) + 1;
    if (state.progress.wrong[question.question_id] && state.progress.wrongStreaks[question.question_id] >= 2) {
      delete state.progress.wrong[question.question_id];
      delete state.progress.wrongStreaks[question.question_id];
    }
    els.feedback.textContent = "答對";
    els.feedback.classList.add("ok");
    if (session.isExam) session.examCorrect += 1;
  } else {
    delete state.progress.correct[question.question_id];
    state.progress.wrong[question.question_id] = true;
    state.progress.wrongStreaks[question.question_id] = 0;
    els.feedback.textContent = `答錯，正確答案是 ${question.answer}`;
    els.feedback.classList.add("bad");
    if (session.isExam) session.examWrong.push({ question, selected });
  }

  [...els.options.children].forEach((button) => {
    const letter = button.dataset.answer;
    button.disabled = true;
    if (letter === question.answer) button.classList.add("correct");
    if (letter === selected && !correct) button.classList.add("wrong");
  });

  saveProgress();
  if (correct) {
    window.setTimeout(nextQuestion, 500);
    return;
  }
  els.nextQuestion.classList.remove("hidden");
  els.nextQuestion.textContent = session.index === session.questions.length - 1 ? "查看結果" : "下一題";
}

function nextQuestion() {
  const session = state.session;
  if (!session) return;
  if (session.index < session.questions.length - 1) {
    session.index += 1;
    renderQuestion();
    return;
  }
  if (session.isExam) {
    renderExamResult();
    showView("result");
  } else {
    showHome();
  }
}

function renderExamResult() {
  const session = state.session;
  const total = session.questions.length;
  const correct = session.examCorrect;
  const wrong = session.examWrong.length;
  els.examScore.textContent = `${Math.round((correct / total) * 100)} 分`;
  els.examCorrect.textContent = correct;
  els.examWrong.textContent = wrong;
  els.examAccuracy.textContent = percent(correct, total);
  els.examWrongList.innerHTML = session.examWrong.length
    ? session.examWrong
        .map(
          ({ question, selected }) => `
          <article>
            <strong>${escapeHtml(question.question_id)} ${escapeHtml(question.question)}</strong>
            <p>你的答案：${escapeHtml(selected)}，正確答案：${escapeHtml(question.answer)}</p>
          </article>
        `,
        )
        .join("")
    : "<p>本次沒有錯題。</p>";
}

function resetProgress() {
  if (!confirm("確定要重置所有練習進度嗎？")) return;
  if (!confirm("重置後無法復原，真的要清除嗎？")) return;
  localStorage.removeItem(STORAGE_KEY);
  state.progress = loadProgress();
  renderHome();
}

function activeWrongIds() {
  return Object.keys(state.progress.wrong).filter((id) => state.byId.has(id));
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function percent(done, total) {
  return `${percentNumber(done, total)}%`;
}

function percentNumber(done, total) {
  return total ? Math.round((done / total) * 100) : 0;
}

function formatTime(value) {
  if (!value) return "尚未練習";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
