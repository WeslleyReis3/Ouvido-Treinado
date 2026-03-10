const SHEET_NAMES = {
    USERS: "usuarios",
      RANKING: "ranking"
};

function doGet(e) {
    const action = e?.parameter?.action || "";

      if (action === "bootstrap") {
            return jsonOutput({
                    ok: true,
                          users: getUsers_(),
                                ranking: getRanking_()
            });
      }

        if (action === "dashboard") {
              return jsonOutput({
                      ok: true,
                            users: getUsers_(),
                                  ranking: getRanking_()
              });
        }

          return jsonOutput({ ok: false, error: "Acao GET invalida." });
}

function doPost(e) {
    const payload = JSON.parse(e.postData.contents || "{}");
      const action = payload.action || "";

        switch (action) {
              case "register":
                    return jsonOutput(registerUser_(payload));
                        case "login":
                              return jsonOutput(loginUser_(payload));
                                  case "save_score":
                                        return jsonOutput(saveScore_(payload));
                                            case "sync_progress":
                                                  return jsonOutput(syncProgress_(payload));
                                                      case "increment_error":
                                                            return jsonOutput(incrementError_(payload));
                                                                case "dashboard":
                                                                      return jsonOutput({
                                                                                ok: true,
                                                                                        users: getUsers_(),
                                                                                                ranking: getRanking_()
                                                                      });
                                                                          default:
                                                                                return jsonOutput({ ok: false, error: "Acao POST invalida." });
        }
}

function registerUser_(payload) {
    const username = String(payload.username || "").trim();
      const nickname = String(payload.nickname || "").trim();
        const password = String(payload.password || "").trim();

          if (!username || !nickname || !password) {
                return { ok: false, error: "Preencha nome de usuario, apelido e senha." };
          }

            const usersSheet = getOrCreateSheet_(SHEET_NAMES.USERS, [
                  "username",
                      "nickname",
                          "password",
                              "bestScore",
                                  "bestPhase",
                                      "lastPhase",
                                          "lastDate",
                                              "errorsJson"
            ]);

              const users = getUsers_();
                const exists = users.some((user) => user.nickname.toLowerCase() === nickname.toLowerCase());
                  if (exists) {
                        return { ok: false, error: "Esse apelido ja esta em uso." };
                  }

  usersSheet.appendRow([username, nickname, password, 0, 0, 0, "-", "{}"]);
  return { ok: true };
}

function loginUser_(payload) {
    const nickname = String(payload.nickname || "").trim();
      const password = String(payload.password || "").trim();
        const users = getUsers_();
          const foundUser = users.find((user) => user.nickname === nickname && user.password === password);

            if (!foundUser) {
                  return { ok: false, error: "Apelido ou senha incorretos." };
            }

              return {
                    ok: true,
    user: {
      username: foundUser.username,
      nickname: foundUser.nickname,
      role: "player",
      stats: foundUser.stats
    }
  };
}

function saveScore_(payload) {
    const nickname = String(payload.nickname || "").trim();
      const score = Number(payload.score || 0);
        const phase = Number(payload.phase || 0);
          const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

            const users = getUsers_();
              const user = users.find((entry) => entry.nickname === nickname);
                if (!user) {
                      return { ok: false, error: "Usuario nao encontrado." };
                }

  const usersSheet = getOrCreateSheet_(SHEET_NAMES.USERS, []);
  const rowIndex = findUserRow_(nickname);

  const bestScore = Math.max(Number(user.bestScore || 0), score);
  const bestPhase = score >= Number(user.bestScore || 0) ? phase : Number(user.bestPhase || 0);
  const stats = {
    ...(user.stats || {}),
    currentScore: score,
    currentPhase: phase,
    hasSavedProgress: true
  };
  usersSheet.getRange(rowIndex, 4, 1, 4).setValues([[bestScore, bestPhase, phase, date]]);
  usersSheet.getRange(rowIndex, 8).setValue(JSON.stringify(stats));

  upsertRanking_(nickname, score, phase, date);

                              return {
                                    ok: true,
                                        users: getUsers_(),
                                            ranking: getRanking_()
                              };
}

function syncProgress_(payload) {
    const nickname = String(payload.nickname || "").trim();
      const phase = Number(payload.phase || 0);
        const score = Number(payload.score || 0);
          const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

            const users = getUsers_();
              const user = users.find((entry) => entry.nickname === nickname);
                if (!user) {
                      return { ok: false, error: "Usuario nao encontrado." };
                }

                  const usersSheet = getOrCreateSheet_(SHEET_NAMES.USERS, []);
                    const rowIndex = findUserRow_(nickname);

  const previousBest = Number(user.bestScore || 0);
  const bestScore = Math.max(previousBest, score);
  const bestPhase = score > previousBest ? phase : Number(user.bestPhase || 0);
  const stats = {
    ...(user.stats || {}),
    currentScore: score,
    currentPhase: phase,
    hasSavedProgress: true
  };
  usersSheet.getRange(rowIndex, 4, 1, 4).setValues([[bestScore, bestPhase, phase, date]]);
  usersSheet.getRange(rowIndex, 8).setValue(JSON.stringify(stats));

  return { ok: true };
}

function incrementError_(payload) {
    const nickname = String(payload.nickname || "").trim();
      const phase = String(payload.phase || "").trim();
        const users = getUsers_();
          const user = users.find((entry) => entry.nickname === nickname);
            if (!user) {
                  return { ok: false, error: "Usuario nao encontrado." };
            }

  const stats = user.stats || {};
  const errors = stats.errorsByPhase || {};
  errors[phase] = (errors[phase] || 0) + 1;

  const usersSheet = getOrCreateSheet_(SHEET_NAMES.USERS, []);
  const rowIndex = findUserRow_(nickname);
  usersSheet.getRange(rowIndex, 8).setValue(JSON.stringify({
    ...stats,
    errorsByPhase: errors
  }));

  return { ok: true };
}

function clearProgress_(payload) {
  const nickname = String(payload.nickname || "").trim();
  const users = getUsers_();
  const user = users.find((entry) => entry.nickname === nickname);
  if (!user) {
    return { ok: false, error: "Usuario nao encontrado." };
  }

  const usersSheet = getOrCreateSheet_(SHEET_NAMES.USERS, []);
  const rowIndex = findUserRow_(nickname);
  const stats = {
    ...(user.stats || {}),
    currentScore: 0,
    currentPhase: 1,
    hasSavedProgress: false
  };
  usersSheet.getRange(rowIndex, 5, 1, 3).setValues([[Number(user.bestPhase || 0), 1, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy")]]);
  usersSheet.getRange(rowIndex, 8).setValue(JSON.stringify(stats));

  return { ok: true };
}

function upsertRanking_(nickname, score, phase, date) {
    const rankingSheet = getOrCreateSheet_(SHEET_NAMES.RANKING, [
          "nickname",
              "score",
                  "phase",
                      "date"
    ]);

      const ranking = getRanking_();
        const rowIndex = findRankingRow_(nickname);
          const existing = ranking.find((entry) => entry.nickname === nickname);

            if (existing && Number(existing.score || 0) >= score) {
                  return;
            }

              if (rowIndex > 1) {
                    rankingSheet.getRange(rowIndex, 1, 1, 4).setValues([[nickname, score, phase, date]]);
              } else {
                    rankingSheet.appendRow([nickname, score, phase, date]);
              }
}

function getUsers_() {
    const sheet = getOrCreateSheet_(SHEET_NAMES.USERS, [
          "username",
              "nickname",
                  "password",
                      "bestScore",
                          "bestPhase",
                              "lastPhase",
                                  "lastDate",
                                      "errorsJson"
    ]);
      const values = sheet.getDataRange().getValues();
        if (values.length <= 1) return [];

  return values.slice(1).filter((row) => row[1]).map((row) => ({
    username: String(row[0] || "").trim(),
    nickname: String(row[1] || "").trim(),
    password: String(row[2] || "").trim(),
    bestScore: Number(row[3] || 0),
    bestPhase: Number(row[4] || 0),
    lastPhase: Number(row[5] || 0),
    lastDate: row[6] || "-",
    stats: normalizeStats_(safeParse_(row[7])),
    errorsByPhase: normalizeStats_(safeParse_(row[7])).errorsByPhase
  }));
}

function getRanking_() {
    const sheet = getOrCreateSheet_(SHEET_NAMES.RANKING, [
          "nickname",
              "score",
                  "phase",
                      "date"
    ]);
      const values = sheet.getDataRange().getValues();
        if (values.length <= 1) return [];

          return values
              .slice(1)
                  .filter((row) => row[0])
                      .map((row) => ({
                              nickname: row[0],
                                    score: Number(row[1] || 0),
                                          phase: Number(row[2] || 0),
                                                date: row[3] || "-"
                      }))
                          .sort((left, right) => right.score - left.score);
}

function getOrCreateSheet_(name, headers) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = spreadsheet.getSheetByName(name);

        if (!sheet) {
              sheet = spreadsheet.insertSheet(name);
        }

          if (headers.length && sheet.getLastRow() === 0) {
                sheet.appendRow(headers);
          }

            return sheet;
}

function findUserRow_(nickname) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.USERS, []);
  const values = sheet.getDataRange().getValues();
  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][1] || "").trim() === String(nickname || "").trim()) {
      return index + 1;
    }
  }
  return -1;
}

function findRankingRow_(nickname) {
  const sheet = getOrCreateSheet_(SHEET_NAMES.RANKING, []);
  const values = sheet.getDataRange().getValues();
  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][0] || "").trim() === String(nickname || "").trim()) {
      return index + 1;
    }
  }
  return -1;
}

function safeParse_(value) {
    try {
          return value ? JSON.parse(value) : {};
    } catch (error) {
          return {};
    }
}

function normalizeStats_(stats) {
  return {
    currentScore: Number(stats.currentScore || 0),
    currentPhase: Number(stats.currentPhase || 1),
    hasSavedProgress: Boolean(stats.hasSavedProgress),
    errorsByPhase: stats.errorsByPhase || {}
  };
}

function jsonOutput(payload) {
    return ContentService
        .createTextOutput(JSON.stringify(payload))
            .setMimeType(ContentService.MimeType.JSON);
}

}
    }
    }
}
              }
        }
}
              }
        }
}
          }
        }
}
                      }))
    ])
}
          }))
    ])
}
              }
              }
            }
    ])
}
            }
}
                }
}
                              }
                }
}
                        }
              }
            }
}
                  }
            ])
          }
}
                                                                      })
        }
}
              })
        }
            })
      }
}
}
