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

const startScreen = document.getElementById("startScreen");
const gameScreen = document.getElementById("gameScreen");
const startButton = document.getElementById("startButton");
const resetGameButton = document.getElementById("resetGameButton");
const replayButton = document.getElementById("replayButton");
const clearButton = document.getElementById("clearButton");
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
const rankingList = document.getElementById("rankingList");
const visualizer = document.getElementById("visualizer");
const gameCard = document.getElementById("gameScreen");
const noteRibbon = document.getElementById("noteRibbon");
const audioStage = document.querySelector(".audio-stage");

startButton.addEventListener("click", startGame);
resetGameButton.addEventListener("click", resetGame);
replayButton.addEventListener("click", () => playNoteSequence(false));
clearButton.addEventListener("click", () => {
  if (isRoundLocked || isPlayingSequence) return;
  selectedAnswer = [];
  renderAnswerSlots();
  setFeedback("Monte sua resposta com as notas disponíveis.", "");
});

renderRanking();
updateDashboard();

/**
 * Inicia um novo jogo, prepara o contexto de áudio e abre a primeira fase.
 */
async function startGame() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  await audioContext.resume();
  startScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  currentPhase = 1;
  currentScore = 0;
  streak = 0;
  startPhase();
}

/**
 * Reinicia todos os estados principais do jogo e retorna para a fase inicial.
 */
function resetGame() {
  saveRanking(currentScore);
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
  updateDashboard();
}

/**
 * Avança o usuário para a próxima fase e prepara uma nova pergunta.
 */
function nextPhase() {
  currentPhase += 1;
  startPhase();
}

/**
 * Configura os estados temporários da fase e dispara a geração da rodada.
 */
function startPhase() {
  stopTimer();
  attemptsLeft = MAX_ATTEMPTS;
  timeLeft = TIMER_DURATION;
  selectedAnswer = [];
  isRoundLocked = true;
  clearFeedbackActions();
  updateDashboard();
  generateQuestion();
  renderAnswerSlots();
  startTimer();
  playNoteSequence(true);
}

/**
 * Cria a pergunta da fase atual, definindo a sequência correta e as opções exibidas.
 */
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

/**
 * Embaralha um array com o algoritmo de Fisher-Yates e devolve uma nova cópia.
 */
function shuffleArray(items) {
  const array = [...items];

  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }

  return array;
}

/**
 * Gera o som de uma única nota usando Web Audio API com envelope simples.
 */
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

/**
 * Toca a sequência inteira da fase com pausas entre as notas e controla a UI durante a reprodução.
 */
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

  runSequence();
}

/**
 * Verifica a resposta montada pelo usuário, atualiza tentativas e define o estado da rodada.
 */
function checkAnswer() {
  if (!currentQuestion || isRoundLocked) return;

  const expected = currentQuestion.answer.join("-");
  const received = selectedAnswer.join("-");

  if (received === expected) {
    handleCorrectAnswer();
    return;
  }

  attemptsLeft -= 1;
  updateDashboard();

  if (attemptsLeft <= 0) {
    handleFailedPhase("Resposta incorreta");
    return;
  }

  selectedAnswer = [];
  renderAnswerSlots();
  setFeedback(`Resposta incorreta. Você ainda tem ${attemptsLeft} tentativa(s).`, "error");
}

/**
 * Inicia o cronômetro regressivo da rodada e trata o estouro de tempo.
 */
function startTimer() {
  timerDisplay.textContent = `${timeLeft}s`;

  timerId = window.setInterval(() => {
    timeLeft -= 1;
    timerDisplay.textContent = `${timeLeft}s`;

    if (timeLeft <= 0) {
      stopTimer();
      handleFailedPhase("Tempo esgotado");
    }
  }, 1000);
}

/**
 * Interrompe o cronômetro quando a fase termina ou é reiniciada.
 */
function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

/**
 * Desenha os botões de notas disponíveis e conecta cada botão à montagem da resposta.
 */
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

/**
 * Atualiza os espaços visuais que mostram a sequência escolhida pelo usuário.
 */
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

/**
 * Trata o clique em uma nota, completando a resposta e disparando a validação ao atingir o tamanho esperado.
 */
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

/**
 * Processa um acerto, aplica pontuação, animação e libera o avanço de fase.
 */
function handleCorrectAnswer() {
  stopTimer();
  isRoundLocked = true;
  setControlsEnabled(false);
  currentScore += 100 + timeLeft * 2 + streak * 10;
  streak += 1;
  updateDashboard();
  noteRibbon.textContent = "Sequência correta";
  setFeedback("Correto!", "success");
  highlightAnswerButtons("correct-glow");
  flashGameCard("success-flash");
  clearFeedbackActions();
  appendActionButton("Próxima fase", nextPhase, "action-button");
}

/**
 * Processa falha por erro ou tempo esgotado, revela a resposta e oferece repetição da fase.
 */
function handleFailedPhase(reason) {
  stopTimer();
  isRoundLocked = true;
  setControlsEnabled(false);
  streak = 0;
  updateDashboard();
  const answerText = currentQuestion.answer.join(" - ");
  noteRibbon.textContent = `Resposta: ${answerText}`;
  setFeedback(`${reason}. Resposta correta: ${answerText}.`, reason === "Tempo esgotado" ? "warning" : "error");
  highlightAnswerButtons("wrong-glow");
  clearFeedbackActions();
  appendActionButton("Tentar novamente", startPhase, "ghost-button");
  flashGameCard("error-flash");
}

/**
 * Atualiza textos e indicadores visuais do cabeçalho e dos cartões de status.
 */
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

/**
 * Ativa ou desativa os botões principais de interação conforme o estado da rodada.
 */
function setControlsEnabled(enabled) {
  const noteButtons = choicesContainer.querySelectorAll(".note-button");
  noteButtons.forEach((button) => {
    button.disabled = !enabled;
  });

  replayButton.disabled = !enabled;
  clearButton.disabled = !enabled;
}

/**
 * Atualiza a caixa de feedback central com cor contextual.
 */
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

/**
 * Remove todos os botões de ação temporários exibidos no feedback.
 */
function clearFeedbackActions() {
  feedbackActions.innerHTML = "";
}

/**
 * Adiciona um botão de ação contextual na área de feedback.
 */
function appendActionButton(label, handler, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", handler);
  feedbackActions.appendChild(button);
}

/**
 * Alterna a animação das ondas sonoras durante a reprodução do áudio.
 */
function setVisualizer(active) {
  visualizer.classList.toggle("active", active);
  audioStage.classList.toggle("playing", active);
}

/**
 * Determina quantas notas devem ser tocadas de acordo com a fase atual.
 */
function getNotesPerPhase(phase) {
  if (phase <= 5) return 1;
  if (phase <= 10) return 2;
  return 3;
}

/**
 * Cria uma pequena pausa assíncrona entre as notas da sequência.
 */
function wait(duration) {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}

/**
 * Aplica uma animação curta no card principal para reforçar visualmente um acerto.
 */
function flashGameCard(effectClass = "result-flash") {
  gameCard.classList.remove("result-flash", "success-flash", "error-flash");
  void gameCard.offsetWidth;
  gameCard.classList.add(effectClass);
}

/**
 * Aplica uma animação curta no botão escolhido pelo usuário durante a montagem da resposta.
 */
function pulseChoiceButton(label) {
  const button = Array.from(choicesContainer.querySelectorAll(".note-button"))
    .find((element) => element.textContent.trim() === label);

  if (!button) return;

  button.classList.remove("just-played");
  void button.offsetWidth;
  button.classList.add("just-played");
}

/**
 * Marca visualmente as opções exibidas após acerto ou erro.
 */
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

/**
 * Persiste a pontuação da sessão no ranking local, mantendo apenas os melhores registros.
 */
function saveRanking(score) {
  if (!score) {
    renderRanking();
    return;
  }

  const ranking = getRanking();
  ranking.push({
    score,
    phase: currentPhase,
    date: new Date().toLocaleDateString("pt-BR")
  });

  ranking.sort((left, right) => right.score - left.score);
  localStorage.setItem(RANKING_KEY, JSON.stringify(ranking.slice(0, 5)));
  renderRanking();
}

/**
 * Lê o ranking salvo no LocalStorage e retorna uma lista segura.
 */
function getRanking() {
  try {
    return JSON.parse(localStorage.getItem(RANKING_KEY)) || [];
  } catch (error) {
    return [];
  }
}

/**
 * Renderiza a lista de melhores pontuações na lateral da interface.
 */
function renderRanking() {
  const ranking = getRanking();
  rankingList.innerHTML = "";

  if (!ranking.length) {
    const item = document.createElement("li");
    item.textContent = "Nenhuma pontuação registrada ainda.";
    rankingList.appendChild(item);
    return;
  }

  ranking.forEach((entry, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}º lugar • ${entry.score} pts • fase ${entry.phase} • ${entry.date}`;
    rankingList.appendChild(item);
  });
}
