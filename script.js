const NOTES = [
  { label: "DO", key: "C4", frequency: 261.63 },
  { label: "RE", key: "D4", frequency: 293.66 },
  { label: "MI", key: "E4", frequency: 329.63 },
  { label: "FA", key: "F4", frequency: 349.23 },
  { label: "SOL", key: "G4", frequency: 392.0 },
  { label: "LA", key: "A4", frequency: 440.0 },
  { label: "SI", key: "B4", frequency: 493.88 }
];

const MAX_PHASE_REFERENCE = 15;
const TIMER_DURATION = 60;
const NOTE_DURATION = 2000;
const NOTE_GAP = 800;
const MAX_ATTEMPTS = 2;
const RANKING_KEY = "ouvido-treinado-ranking";
const AUTH_KEY = "ouvido-treinado-user";
const USERS_KEY = "ouvido-treinado-users";
const MASTER_NICKNAME = "WREIS";
const MASTER_PASSWORD = "@Qaz123*";
const APPS_SCRIPT_URL = window.APP_CONFIG?.appsScriptUrl || "";

let audioContext;
let currentPhase = 1;
let currentScore = 0;
let streak = 0;
let attemptsLeft = MAX_ATTEMPTS;
let timeLeft = TIMER_DURATION;
let timerId = null;
let isPlayingSequence = false;
let isRoundLocked = false;
let currentQuestion = null;
let selectedAnswer = [];
let currentUser = null;
let isRegisterMode = false;
let pendingResumeState = null;

const authScreen = document.getElementById("authScreen");
const authForm = document.getElementById("authForm");
const registerForm = document.getElementById("registerForm");
const nicknameInput = document.getElementById("nicknameInput");
const passwordInput = document.getElementById("passwordInput");
const registerNameInput = document.getElementById("registerNameInput");
const registerNicknameInput = document.getElementById("registerNicknameInput");
const registerPasswordInput = document.getElementById("registerPasswordInput");
const saveRegisterButton = document.getElementById("saveRegisterButton");
const backToLoginWrapper = document.getElementById("backToLoginWrapper");
const authMessage = document.getElementById("authMessage");
const authTitle = document.getElementById("authTitle");
const authDescription = document.getElementById("authDescription");
const openRegisterButton = document.getElementById("openRegisterButton");
const backToLoginButton = document.getElementById("backToLoginButton");
const startScreen = document.getElementById("startScreen");
const masterScreen = document.getElementById("masterScreen");
const gameScreen = document.getElementById("gameScreen");
const masterLogoutButton = document.getElementById("masterLogoutButton");
const startButton = document.getElementById("startButton");
const resetGameButton = document.getElementById("resetGameButton");
const logoutButton = document.getElementById("logoutButton");
const replayButton = document.getElementById("replayButton");
const clearButton = document.getElementById("clearButton");
const welcomeChip = document.getElementById("welcomeChip");
const resumePanel = document.getElementById("resumePanel");
const resumeText = document.getElementById("resumeText");
const resumeYesButton = document.getElementById("resumeYesButton");
const resumeNoButton = document.getElementById("resumeNoButton");
const phaseLabel = document.getElementById("phaseLabel");
const timerDisplay = document.getElementById("timerDisplay");
const attemptsDisplay = document.getElementById("attemptsDisplay");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const scoreDisplay = document.getElementById("scoreDisplay");
const streakDisplay = document.getElementById("streakDisplay");
const notesCountDisplay = document.getElementById("notesCountDisplay");
const instructionText = document.getElementById("instructionText");
const choicesContainer = document.getElementById("choicesContainer");
const answerSlots = document.getElementById("answerSlots");
const feedbackMessage = document.getElementById("feedbackMessage");
const feedbackActions = document.getElementById("feedbackActions");
const feedbackPanel = document.getElementById("feedbackPanel");
const feedbackIcon = document.getElementById("feedbackIcon");
const rankingCard = document.getElementById("rankingCard");
const rankingList = document.getElementById("rankingList");
const masterUsersCount = document.getElementById("masterUsersCount");
const masterTopScore = document.getElementById("masterTopScore");
const masterTableBody = document.getElementById("masterTableBody");
const visualizer = document.getElementById("visualizer");
const gameCard = document.getElementById("gameScreen");
const noteRibbon = document.getElementById("noteRibbon");
const audioStage = document.querySelector(".audio-stage");

authForm.addEventListener("submit", handleLogin);
registerForm.addEventListener("submit", handleRegister);
openRegisterButton.addEventListener("click", () => setAuthMode(true));
backToLoginButton.addEventListener("click", () => setAuthMode(false));
startButton.addEventListener("click", startGame);
resetGameButton.addEventListener("click", resetGame);
logoutButton.addEventListener("click", logout);
masterLogoutButton.addEventListener("click", logout);
resumeYesButton.addEventListener("click", resumeSavedGame);
resumeNoButton.addEventListener("click", discardSavedGame);
replayButton.addEventListener("click", () => playNoteSequence(false));
clearButton.addEventListener("click", () => {
  if (isRoundLocked || isPlayingSequence) return;
  selectedAnswer = [];
  renderAnswerSlots();
  setFeedback("Monte sua resposta com as notas disponíveis.", "");
});

void renderRanking();
restoreUserSession();
setAuthMode(false);
updateDashboard();

function isRemoteBackendEnabled() {
  return Boolean(APPS_SCRIPT_URL);
}

async function apiPost(action, payload = {}) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({ action, ...payload })
  });

  return parseApiResponse(response);
}

async function apiGet(action) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set("action", action);
  const response = await fetch(url.toString());
  return parseApiResponse(response);
}

async function parseApiResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: "O Apps Script retornou um erro inesperado.",
      raw: text
    };
  }
}

async function fetchRemoteUsers() {
  const result = await apiGet("dashboard");
  return result.users || [];
}

async function fetchRemoteRanking() {
  const result = await apiGet("dashboard");
  return result.ranking || [];
}

function createDefaultStats() {
  return {
    bestScore: 0,
    bestPhase: 0,
    lastPhase: 0,
    lastDate: "-",
    errorsByPhase: {}
  };
}

function getUsersLocal() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    return users.map((user) => ({
      ...user,
      stats: {
        ...createDefaultStats(),
        ...(user.stats || {})
      }
    }));
  } catch (error) {
    return [];
  }
}

function saveUsersLocal(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getRankingLocal() {
  try {
    return JSON.parse(localStorage.getItem(RANKING_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function formatDisplayDate(value) {
  if (!value) return "-";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(value))) {
    return String(value);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function setAuthMode(registerMode) {
  isRegisterMode = registerMode;
  authForm.classList.toggle("hidden", registerMode);
  registerForm.classList.toggle("hidden", !registerMode);
  backToLoginWrapper.classList.add("hidden");
  saveRegisterButton.disabled = false;
  authTitle.textContent = registerMode ? "Cadastre um novo usuario" : "Entre com seu apelido";
  authDescription.textContent = registerMode
    ? "Informe nome de usuario, apelido para login e uma senha para criar seu acesso neste dispositivo."
    : "Use seu apelido cadastrado e sua senha para liberar o treino.";
  authMessage.textContent = registerMode
    ? "Preencha os tres campos para criar seu acesso."
    : "Preencha apelido e senha para entrar.";
}

async function handleLogin(event) {
  event.preventDefault();

  const nickname = nicknameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!nickname || !password) {
    authMessage.textContent = "Informe um apelido e uma senha para continuar.";
    return;
  }

  if (nickname === MASTER_NICKNAME && password === MASTER_PASSWORD) {
  currentUser = {
      username: "Master",
      nickname: MASTER_NICKNAME,
      role: "master"
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));
    passwordInput.value = "";
    authMessage.textContent = "Acesso mestre liberado.";
    updateUserInterface();
    await renderMasterDashboard();
    return;
  }

  let foundUser = null;

  if (isRemoteBackendEnabled()) {
    const result = await apiPost("login", { nickname, password });
    if (!result.ok) {
      authMessage.textContent = result.error || "Apelido ou senha incorretos.";
      return;
    }
    foundUser = result.user;
  } else {
    const registeredUsers = getUsersLocal();
    const localUser = registeredUsers.find((user) => user.nickname === nickname);
    if (!localUser || localUser.password !== password) {
      authMessage.textContent = "Apelido ou senha incorretos.";
      return;
    }
    foundUser = {
      username: localUser.username,
      nickname: localUser.nickname,
      role: "player",
      stats: localUser.stats
    };
  }

  currentUser = foundUser;
  localStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));
  passwordInput.value = "";
  authMessage.textContent = "Acesso liberado. Bom treino.";
  prepareResumeState();
  updateUserInterface();
}

async function handleRegister(event) {
  event.preventDefault();

  const username = registerNameInput.value.trim();
  const nickname = registerNicknameInput.value.trim();
  const password = registerPasswordInput.value.trim();

  if (!username || !nickname || !password) {
    authMessage.textContent = "Preencha nome de usuario, apelido e senha.";
    return;
  }

  if (isRemoteBackendEnabled()) {
    const result = await apiPost("register", { username, nickname, password });
    if (!result.ok) {
      authMessage.textContent = result.error || "Nao foi possivel cadastrar.";
      return;
    }
  } else {
    const users = getUsersLocal();
    const nicknameExists = users.some((user) => user.nickname.toLowerCase() === nickname.toLowerCase());
    if (nicknameExists) {
      authMessage.textContent = "Esse apelido ja esta em uso. Escolha outro.";
      return;
    }
    users.push({
      username,
      nickname,
      password,
      stats: createDefaultStats()
    });
    saveUsersLocal(users);
  }

  nicknameInput.value = nickname;
  passwordInput.value = password;
  saveRegisterButton.disabled = true;
  backToLoginWrapper.classList.remove("hidden");
  authMessage.textContent = "Cadastro realizado. Clique em voltar para fazer login.";
}

function restoreUserSession() {
  try {
    currentUser = JSON.parse(localStorage.getItem(AUTH_KEY)) || null;
  } catch (error) {
    currentUser = null;
  }

  updateUserInterface();
  if (currentUser?.role === "master") {
    void renderMasterDashboard();
  }
}

function updateUserInterface() {
  const isAuthenticated = Boolean(currentUser && currentUser.nickname);
  const isMaster = currentUser?.role === "master";

  authScreen.classList.toggle("hidden", isAuthenticated);
  startScreen.classList.toggle("hidden", !isAuthenticated || !gameScreen.classList.contains("hidden") || isMaster);
  masterScreen.classList.toggle("hidden", !isMaster);
  rankingCard.classList.toggle("hidden", isMaster);
  welcomeChip.textContent = isAuthenticated ? `Jogador: ${currentUser.nickname}` : "Modo absoluto";
  resumePanel.classList.toggle("hidden", !(isAuthenticated && !isMaster && pendingResumeState));
}

function logout() {
  stopTimer();
  localStorage.removeItem(AUTH_KEY);
  currentUser = null;
  pendingResumeState = null;
  currentQuestion = null;
  selectedAnswer = [];
  isRoundLocked = false;
  isPlayingSequence = false;
  startScreen.classList.add("hidden");
  masterScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");
  authMessage.textContent = "Sessão encerrada. Entre novamente para continuar.";
  nicknameInput.value = "";
  passwordInput.value = "";
  registerForm.reset();
  setAuthMode(false);
  updateUserInterface();
}

async function startGame() {
  if (!currentUser || currentUser.role === "master") {
    authMessage.textContent = "Faça login com apelido e senha antes de iniciar.";
    updateUserInterface();
    return;
  }

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  await audioContext.resume();
  startScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  currentPhase = 1;
  currentScore = 0;
  streak = 0;
  void updateCurrentUserProgress();
  startPhase();
}

function resetGame() {
  void saveRanking(currentScore);
  void clearSavedProgress();
  stopTimer();
  currentPhase = 1;
  currentScore = 0;
  streak = 0;
  attemptsLeft = MAX_ATTEMPTS;
  timeLeft = TIMER_DURATION;
  currentQuestion = null;
  selectedAnswer = [];
  isRoundLocked = false;
  isPlayingSequence = false;

  startScreen.classList.remove("hidden");
  gameScreen.classList.add("hidden");
  clearFeedbackActions();
  setFeedback("Escute a sequência para começar.", "");
  updateUserInterface();
  updateDashboard();
}

function nextPhase() {
  currentPhase += 1;
  startPhase();
}

function startPhase() {
  stopTimer();
  attemptsLeft = MAX_ATTEMPTS;
  timeLeft = TIMER_DURATION;
  selectedAnswer = [];
  isRoundLocked = true;
  clearFeedbackActions();
  void updateCurrentUserProgress();
  updateDashboard();
  generateQuestion();
  renderAnswerSlots();
  startTimer();
  playNoteSequence(true);
}

function generateQuestion() {
  const notesInSequence = getNotesPerPhase(currentPhase);
  const answer = Array.from({ length: notesInSequence }, () => {
    const randomNote = NOTES[Math.floor(Math.random() * NOTES.length)];
    return randomNote.label;
  });

  const optionSet = new Set(answer);
  const distractors = shuffleArray(
    NOTES.map((note) => note.label).filter((label) => !optionSet.has(label))
  );

  while (optionSet.size < 5 && distractors.length > 0) {
    optionSet.add(distractors.pop());
  }

  const options = shuffleArray(Array.from(optionSet)).slice(0, 5);
  currentQuestion = { answer, options, notesInSequence };
  renderChoices();
}

function shuffleArray(items) {
  const array = [...items];

  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }

  return array;
}

function playNote(frequency) {
  return new Promise((resolve) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.28, audioContext.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1.95);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + NOTE_DURATION / 1000);

    setVisualizer(true);

    setTimeout(() => {
      setVisualizer(false);
      resolve();
    }, NOTE_DURATION);
  });
}

function playNoteSequence(updateInstruction = false) {
  if (!currentQuestion || isPlayingSequence) return;

  isPlayingSequence = true;
  isRoundLocked = true;
  setControlsEnabled(false);

  if (updateInstruction) {
    instructionText.textContent = "Ouvindo a sequência...";
    setFeedback("Preste atenção nas notas antes de responder.", "");
  } else {
    setFeedback("Reproduzindo a sequência novamente.", "");
  }

  const runSequence = async () => {
    for (let index = 0; index < currentQuestion.answer.length; index += 1) {
      const currentLabel = currentQuestion.answer[index];
      const currentNote = NOTES.find((note) => note.label === currentLabel);
      noteRibbon.textContent = "Ouvindo...";
      await playNote(currentNote.frequency);

      if (index < currentQuestion.answer.length - 1) {
        noteRibbon.textContent = "Aguarde...";
        await wait(NOTE_GAP);
      }
    }

    isPlayingSequence = false;
    isRoundLocked = false;
    setControlsEnabled(true);
    instructionText.textContent = "Selecione a sequência correta.";
    noteRibbon.textContent = "Monte sua resposta";
    setFeedback("Responda antes do cronômetro zerar.", "");
  };

  void runSequence();
}

function checkAnswer() {
  if (!currentQuestion || isRoundLocked) return;

  const expected = currentQuestion.answer.join("-");
  const received = selectedAnswer.join("-");

  if (received === expected) {
    handleCorrectAnswer();
    return;
  }

  attemptsLeft -= 1;
  void registerPhaseError(currentPhase);
  updateDashboard();

  if (attemptsLeft <= 0) {
    handleFailedPhase("Resposta incorreta");
    return;
  }

  selectedAnswer = [];
  renderAnswerSlots();
  setFeedback(`Resposta incorreta. Você ainda tem ${attemptsLeft} tentativa(s).`, "error");
}

function startTimer() {
  timerDisplay.textContent = `${timeLeft}s`;

  timerId = window.setInterval(() => {
    timeLeft -= 1;
    timerDisplay.textContent = `${timeLeft}s`;

    if (timeLeft <= 0) {
      stopTimer();
      void registerPhaseError(currentPhase);
      handleFailedPhase("Tempo esgotado");
    }
  }, 1000);
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function renderChoices() {
  choicesContainer.innerHTML = "";

  currentQuestion.options.forEach((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-button";
    button.textContent = label;
    button.disabled = true;
    button.addEventListener("click", () => handleChoiceSelection(label));
    choicesContainer.appendChild(button);
  });
}

function renderAnswerSlots() {
  answerSlots.innerHTML = "";
  const totalSlots = currentQuestion ? currentQuestion.notesInSequence : 3;

  for (let index = 0; index < totalSlots; index += 1) {
    const slot = document.createElement("div");
    slot.className = "answer-slot";

    if (selectedAnswer[index]) {
      slot.classList.add("filled");
      slot.textContent = selectedAnswer[index];
    } else {
      slot.textContent = "...";
    }

    answerSlots.appendChild(slot);
  }
}

function handleChoiceSelection(label) {
  if (isRoundLocked || isPlayingSequence || !currentQuestion) return;
  if (selectedAnswer.length >= currentQuestion.notesInSequence) return;

  selectedAnswer.push(label);
  renderAnswerSlots();
  pulseChoiceButton(label);

  if (selectedAnswer.length === currentQuestion.notesInSequence) {
    checkAnswer();
  }
}

function handleCorrectAnswer() {
  stopTimer();
  isRoundLocked = true;
  setControlsEnabled(false);
  currentScore += 100;
  streak += 1;
  void updateCurrentUserProgress();
  updateDashboard();
  noteRibbon.textContent = "Sequência correta";
  setFeedback("Correto!", "success");
  highlightAnswerButtons("correct-glow");
  flashGameCard("success-flash");
  clearFeedbackActions();
  appendActionButton("Próxima fase", nextPhase, "action-button");
}

function handleFailedPhase(reason) {
  stopTimer();
  isRoundLocked = true;
  setControlsEnabled(false);
  streak = 0;
  void saveRanking(currentScore);
  void updateCurrentUserProgress();
  updateDashboard();
  const answerText = currentQuestion.answer.join(" - ");
  noteRibbon.textContent = `Resposta: ${answerText}`;
  setFeedback(`${reason}. Resposta correta: ${answerText}.`, reason === "Tempo esgotado" ? "warning" : "error");
  highlightAnswerButtons("wrong-glow");
  clearFeedbackActions();
  appendActionButton("Tentar novamente", retryPhase, "ghost-button");
  flashGameCard("error-flash");
}

function retryPhase() {
  updateDashboard();
  startPhase();
}

function updateDashboard() {
  phaseLabel.textContent = `Fase ${currentPhase}`;
  attemptsDisplay.textContent = `${attemptsLeft} tentativa${attemptsLeft === 1 ? "" : "s"}`;
  scoreDisplay.textContent = currentScore;
  streakDisplay.textContent = streak;

  const notesCount = getNotesPerPhase(currentPhase);
  notesCountDisplay.textContent = notesCount;
  progressText.textContent = `Fase ${currentPhase} de ${MAX_PHASE_REFERENCE}`;
  progressFill.style.width = `${Math.min((currentPhase / MAX_PHASE_REFERENCE) * 100, 100)}%`;
}

function setControlsEnabled(enabled) {
  const noteButtons = choicesContainer.querySelectorAll(".note-button");
  noteButtons.forEach((button) => {
    button.disabled = !enabled;
  });

  replayButton.disabled = !enabled;
  clearButton.disabled = !enabled;
}

function setFeedback(message, tone) {
  feedbackMessage.textContent = message;
  feedbackMessage.className = "feedback-message";
  feedbackPanel.className = "feedback-panel";
  feedbackIcon.textContent = "♪";

  if (tone) {
    feedbackMessage.classList.add(tone);
    feedbackPanel.classList.add(tone);
  }

  if (tone === "success") {
    feedbackIcon.textContent = "✓";
  } else if (tone === "error") {
    feedbackIcon.textContent = "!";
  } else if (tone === "warning") {
    feedbackIcon.textContent = "⏱";
  }
}

function clearFeedbackActions() {
  feedbackActions.innerHTML = "";
}

function appendActionButton(label, handler, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", handler);
  feedbackActions.appendChild(button);
}

function setVisualizer(active) {
  visualizer.classList.toggle("active", active);
  audioStage.classList.toggle("playing", active);
}

function getNotesPerPhase(phase) {
  if (phase <= 5) return 1;
  if (phase <= 10) return 2;
  return 3;
}

function wait(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}

function flashGameCard(effectClass = "result-flash") {
  gameCard.classList.remove("result-flash", "success-flash", "error-flash");
  void gameCard.offsetWidth;
  gameCard.classList.add(effectClass);
}

function pulseChoiceButton(label) {
  const button = Array.from(choicesContainer.querySelectorAll(".note-button"))
    .find((element) => element.textContent.trim() === label);

  if (!button) return;

  button.classList.remove("just-played");
  void button.offsetWidth;
  button.classList.add("just-played");
}

function highlightAnswerButtons(className) {
  const noteButtons = choicesContainer.querySelectorAll(".note-button");
  noteButtons.forEach((button) => {
    button.classList.remove("correct-glow", "wrong-glow");
  });

  currentQuestion.answer.forEach((label) => {
    const button = Array.from(noteButtons)
      .find((element) => element.textContent.trim() === label);

    if (button) {
      button.classList.add(className);
    }
  });
}

async function saveRanking(score) {
  if (isRemoteBackendEnabled()) {
    await saveRankingRemote(score);
    return;
  }

  if (!score || !currentUser?.nickname) {
    await renderRanking();
    return;
  }

  const ranking = getRankingLocal();
  const normalizedNickname = currentUser.nickname.trim();
  const existingEntry = ranking.find((entry) => entry.nickname === normalizedNickname);

  if (existingEntry && existingEntry.score >= score) {
    await renderRanking();
    return;
  }

  const nextEntry = {
    nickname: normalizedNickname,
    score,
    phase: currentPhase,
    date: new Date().toLocaleDateString("pt-BR")
  };

  const nextRanking = ranking.filter((entry) => entry.nickname !== normalizedNickname);
  nextRanking.push(nextEntry);
  nextRanking.sort((left, right) => right.score - left.score);
  localStorage.setItem(RANKING_KEY, JSON.stringify(nextRanking.slice(0, 15)));

  await updateCurrentUserProgress(score, currentPhase, true);
  await renderRanking();
  await renderMasterDashboard();
}

async function saveRankingRemote(score) {
  if (!score || !currentUser?.nickname || currentUser.role === "master") {
    await renderRanking();
    return;
  }

  await apiPost("save_score", {
    nickname: currentUser.nickname,
    score,
    phase: currentPhase
  });

  await updateCurrentUserProgress(score, currentPhase, true);
  await renderRanking();
  await renderMasterDashboard();
}

async function renderRanking() {
  const ranking = isRemoteBackendEnabled()
    ? await fetchRemoteRanking()
    : getRankingLocal();

  rankingList.innerHTML = "";
  const visibleRanking = ranking.slice(0, 15);

  visibleRanking.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "ranking-item";

    const position = document.createElement("strong");
    position.className = "ranking-position";
    position.textContent = `${index + 1}º lugar`;

    const player = document.createElement("span");
    player.className = "ranking-player";
    player.textContent = `${entry.nickname} • ${entry.score} pts`;

    const meta = document.createElement("span");
    meta.className = "ranking-meta";
    meta.textContent = `Fase ${entry.phase} • ${formatDisplayDate(entry.date)}`;

    item.append(position, player, meta);
    rankingList.appendChild(item);
  });

  for (let index = visibleRanking.length; index < 15; index += 1) {
    const item = document.createElement("li");
    item.className = "ranking-item";

    const position = document.createElement("strong");
    position.className = "ranking-position";
    position.textContent = `${index + 1}º lugar`;

    const player = document.createElement("span");
    player.className = "ranking-player";
    player.textContent = "Aguardando pontuação";

    const meta = document.createElement("span");
    meta.className = "ranking-meta";
    meta.textContent = "Sem jogador registrado";

    item.append(position, player, meta);
    rankingList.appendChild(item);
  }
}

async function updateCurrentUserProgress(score = currentScore, phase = currentPhase, bestCheck = false) {
  if (!currentUser || currentUser.role === "master") return;

  if (isRemoteBackendEnabled()) {
    await apiPost("sync_progress", {
      nickname: currentUser.nickname,
      score,
      phase,
      bestCheck
    });
    await renderMasterDashboard();
    return;
  }

  const users = getUsersLocal();
  const userIndex = users.findIndex((user) => user.nickname === currentUser.nickname);
  if (userIndex === -1) return;

  const user = users[userIndex];
  const stats = {
    ...createDefaultStats(),
    ...user.stats
  };
  const previousBest = Number(stats.bestScore || 0);

  stats.lastPhase = phase;
  stats.lastDate = new Date().toLocaleDateString("pt-BR");
  stats.currentScore = score;
  stats.currentPhase = phase;
  stats.hasSavedProgress = true;

  if (bestCheck || score > previousBest) {
    stats.bestScore = Math.max(previousBest, score);
    if (score > previousBest) {
      stats.bestPhase = phase;
    }
  }

  user.stats = stats;
  users[userIndex] = user;
  saveUsersLocal(users);
  await renderMasterDashboard();
}

async function registerPhaseError(phase) {
  if (!currentUser || currentUser.role === "master") return;

  if (isRemoteBackendEnabled()) {
    await apiPost("increment_error", {
      nickname: currentUser.nickname,
      phase
    });
    await renderMasterDashboard();
    return;
  }

  const users = getUsersLocal();
  const userIndex = users.findIndex((user) => user.nickname === currentUser.nickname);
  if (userIndex === -1) return;

  const user = users[userIndex];
  const stats = {
    ...createDefaultStats(),
    ...user.stats
  };
  const key = String(phase);

  stats.errorsByPhase[key] = (stats.errorsByPhase[key] || 0) + 1;
  stats.lastPhase = phase;
  stats.lastDate = new Date().toLocaleDateString("pt-BR");
  stats.currentScore = currentScore;
  stats.currentPhase = phase;
  stats.hasSavedProgress = true;

  user.stats = stats;
  users[userIndex] = user;
  saveUsersLocal(users);
  await renderMasterDashboard();
}

async function renderMasterDashboard() {
  if (!masterTableBody) return;

  const users = isRemoteBackendEnabled()
    ? await fetchRemoteUsers()
    : getUsersLocal();
  const ranking = isRemoteBackendEnabled()
    ? await fetchRemoteRanking()
    : getRankingLocal();

  const rankingMap = new Map(ranking.map((entry, index) => [entry.nickname, index + 1]));
  masterTableBody.innerHTML = "";
  masterUsersCount.textContent = `${users.length} usuario${users.length === 1 ? "" : "s"}`;
  masterTopScore.textContent = `${ranking[0]?.score || 0} pts`;

  if (!users.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "master-empty";
    cell.textContent = "Nenhum usuario cadastrado ainda.";
    row.appendChild(cell);
    masterTableBody.appendChild(row);
    return;
  }

  const sortedUsers = [...users].sort((left, right) => {
    const leftScore = Number(left.stats?.bestScore || left.bestScore || 0);
    const rightScore = Number(right.stats?.bestScore || right.bestScore || 0);
    return rightScore - leftScore || left.nickname.localeCompare(right.nickname);
  });

  sortedUsers.forEach((user) => {
    const row = document.createElement("tr");
    const stats = {
      ...createDefaultStats(),
      ...(user.stats || {
        bestScore: Number(user.bestScore || 0),
        bestPhase: Number(user.bestPhase || 0),
        lastPhase: Number(user.lastPhase || 0),
        lastDate: user.lastDate || "-",
        errorsByPhase: user.errorsByPhase || {}
      })
    };
    const rankingPosition = rankingMap.get(user.nickname);
    const errorEntries = Object.entries(stats.errorsByPhase || {});
    const errorText = errorEntries.length
      ? errorEntries
          .sort((left, right) => Number(left[0]) - Number(right[0]))
          .map(([phase, count]) => `F${phase}: ${count}`)
          .join(" | ")
      : "Sem erros";

    row.innerHTML = `
      <td>${rankingPosition ? `${rankingPosition}º lugar` : "-"}</td>
      <td>${user.username || "-"}</td>
      <td>${user.nickname}</td>
      <td>${stats.bestScore || 0} pts</td>
      <td>${stats.bestPhase || stats.lastPhase || 0}</td>
      <td>${formatDisplayDate(stats.lastDate || "-")}</td>
      <td class="phase-errors">${errorText}</td>
    `;

    masterTableBody.appendChild(row);
  });
}

function prepareResumeState() {
  const stats = currentUser?.stats || {};
  const resumePhase = Number(stats.currentPhase || 1);
  const resumeScore = Number(stats.currentScore || 0);
  const hasSavedProgress = Boolean(stats.hasSavedProgress) && (resumeScore > 0 || resumePhase > 1);

  pendingResumeState = hasSavedProgress
    ? {
        phase: resumePhase,
        score: resumeScore
      }
    : null;

  if (pendingResumeState) {
    resumeText.textContent = `Encontramos um progresso salvo com ${pendingResumeState.score} pts na fase ${pendingResumeState.phase}.`;
  }
}

function resumeSavedGame() {
  if (!pendingResumeState) return;
  currentPhase = pendingResumeState.phase;
  currentScore = pendingResumeState.score;
  streak = 0;
  pendingResumeState = null;
  updateUserInterface();

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  audioContext.resume().then(() => {
    startScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    startPhase();
  });
}

function discardSavedGame() {
  pendingResumeState = null;
  currentPhase = 1;
  currentScore = 0;
  streak = 0;
  updateDashboard();
  updateUserInterface();
  void clearSavedProgress();
}

async function clearSavedProgress() {
  if (!currentUser || currentUser.role === "master") return;

  if (isRemoteBackendEnabled()) {
    await apiPost("clear_progress", {
      nickname: currentUser.nickname
    });
    return;
  }

  const users = getUsersLocal();
  const userIndex = users.findIndex((user) => user.nickname === currentUser.nickname);
  if (userIndex === -1) return;
  users[userIndex].stats = {
    ...createDefaultStats(),
    ...(users[userIndex].stats || {}),
    currentScore: 0,
    currentPhase: 1,
    hasSavedProgress: false
  };
  saveUsersLocal(users);
}
