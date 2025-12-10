(function () {
  const STORAGE_KEYS = {
    items: "inventory-items-v1",
    sessions: "inventory-sessions-v1",
    current: "inventory-current-session-v1",
  };

  const defaultItems = [
    { name: "Тарелка обеденная", category: "Посуда", location: "Кухня", minStock: 50, note: "фарфор 27 см" },
    { name: "Вилка столовая", category: "Столовые приборы", location: "Зал", minStock: 120, note: "нержавеющая сталь" },
    { name: "Кружка кофейная", category: "Бар", location: "Бар", minStock: 30, note: "250 мл" },
    { name: "Сковорода", category: "Кухонное оборудование", location: "Кухня", minStock: 10, note: "чугун" },
    { name: "Доска разделочная", category: "Кухонное оборудование", location: "Цех заготовки", minStock: 12 },
  ];

  const elements = {};
  const filters = { search: "", category: "all", location: "all", archived: false, lowOnly: false };

  let items = loadItems();
  let sessions = loadSessions();
  let currentSession = loadCurrentSession();
  let selectedSessionId = sessions.at(-1)?.id ?? null;
  let baselineSessionId = sessions.length > 1 ? sessions.at(-2).id : null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    hydrateFilters();
    renderItems();
    renderHistory();
    renderDiff();
    updateSessionStatus();
    syncNoteField();
  }

  function cacheElements() {
    elements.search = document.getElementById("search");
    elements.filterCategory = document.getElementById("filter-category");
    elements.filterLocation = document.getElementById("filter-location");
    elements.showArchived = document.getElementById("show-archived");
    elements.lowStockOnly = document.getElementById("low-stock-only");
    elements.itemForm = document.getElementById("item-form");
    elements.itemList = document.getElementById("item-list");
    elements.historyList = document.getElementById("history-list");
    elements.baselineSelect = document.getElementById("baseline-select");
    elements.diffList = document.getElementById("diff-list");
    elements.diffLabel = document.getElementById("diff-label");
    elements.newSession = document.getElementById("new-session");
    elements.saveSession = document.getElementById("save-session");
    elements.resetSession = document.getElementById("reset-session");
    elements.sessionStatus = document.getElementById("session-status");
    elements.sessionNote = document.getElementById("session-note");
    elements.exportCsv = document.getElementById("export-csv");
    elements.categoryShortcut = document.getElementById("category-shortcut");
    elements.locationShortcut = document.getElementById("location-shortcut");
    elements.clearFilters = document.getElementById("clear-filters");
  }

  function bindEvents() {
    elements.search.addEventListener("input", (e) => {
      filters.search = e.target.value.toLowerCase();
      renderItems();
    });

    elements.filterCategory.addEventListener("change", (e) => {
      filters.category = e.target.value;
      renderItems();
    });

    elements.filterLocation.addEventListener("change", (e) => {
      filters.location = e.target.value;
      renderItems();
    });

    elements.showArchived.addEventListener("change", (e) => {
      filters.archived = e.target.checked;
      renderItems();
    });

    elements.lowStockOnly.addEventListener("change", (e) => {
      filters.lowOnly = e.target.checked;
      renderItems();
    });

    elements.itemForm.addEventListener("submit", handleAddItem);

    elements.itemList.addEventListener("click", handleItemListClick);
    elements.itemList.addEventListener("change", handleItemListChange);

    elements.newSession.addEventListener("click", startNewSession);
    elements.saveSession.addEventListener("click", saveSession);
    elements.resetSession.addEventListener("click", resetSession);

    elements.sessionNote.addEventListener("input", () => {
      if (!currentSession) return;
      currentSession.note = elements.sessionNote.value;
      persistCurrentSession();
    });

    elements.historyList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-session-id]");
      if (!card) return;
      selectedSessionId = card.dataset.sessionId;
      renderHistory();
      renderDiff();
    });

    elements.baselineSelect.addEventListener("change", (e) => {
      baselineSessionId = e.target.value || null;
      renderDiff();
    });

    elements.exportCsv.addEventListener("click", exportCsv);

    elements.categoryShortcut.addEventListener("click", () => {
      const category = prompt("Введите категорию для быстрого фильтра");
      if (category) {
        filters.category = category;
        elements.filterCategory.value = category;
        renderItems();
      }
    });

    elements.locationShortcut.addEventListener("click", () => {
      const location = prompt("Введите локацию (кухня, бар, склад)");
      if (location) {
        filters.location = location;
        elements.filterLocation.value = location;
        renderItems();
      }
    });

    elements.clearFilters.addEventListener("click", () => {
      filters.search = "";
      filters.category = "all";
      filters.location = "all";
      filters.archived = false;
      filters.lowOnly = false;
      elements.search.value = "";
      elements.filterCategory.value = "all";
      elements.filterLocation.value = "all";
      elements.showArchived.checked = false;
      elements.lowStockOnly.checked = false;
      renderItems();
    });
  }

  function hydrateFilters() {
    const categories = ["all", ...new Set(items.map((i) => i.category).filter(Boolean))];
    const locations = ["all", ...new Set(items.map((i) => i.location || "").filter(Boolean))];

    elements.filterCategory.innerHTML = categories
      .map((c) => `<option value="${c}">${c === "all" ? "Все категории" : c}</option>`)
      .join("");
    elements.filterLocation.innerHTML = locations
      .map((l) => `<option value="${l}">${l === "all" ? "Все локации" : l}</option>`)
      .join("");
  }

  function handleAddItem(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const name = formData.get("name")?.toString().trim();
    const category = formData.get("category")?.toString().trim();
    const location = formData.get("location")?.toString().trim();
    const min = parseInt(formData.get("min"), 10);
    const note = formData.get("note")?.toString().trim();

    if (!name || !category) {
      alert("Укажите название и категорию");
      return;
    }

    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      name,
      category,
      location: location || "",
      minStock: Number.isFinite(min) ? Math.max(0, min) : 0,
      note,
      archived: false,
      createdAt: new Date().toISOString(),
    };

    items.unshift(item);
    saveItems();
    hydrateFilters();
    renderItems();
    event.target.reset();
  }

  function handleItemListClick(event) {
    const row = event.target.closest(".item-row");
    if (!row) return;
    const id = row.dataset.itemId;

    if (event.target.matches("[data-action='add']")) {
      ensureSession();
      const increment = prompt("Сколько добавить к текущему количеству?");
      if (increment === null) return;
      const value = Number(increment);
      if (!Number.isFinite(value) || value < 0) {
        alert("Введите неотрицательное число");
        return;
      }
      applyCount(id, (getCurrentCount(id) ?? 0) + value);
    }

    if (event.target.matches("[data-action='archive']")) {
      toggleArchive(id);
    }

    if (event.target.matches("[data-action='note']")) {
      ensureSession();
      const currentNote = currentSession?.counts?.[id]?.note || "";
      const text = prompt("Комментарий по позиции (бой, ремонт, перенос)", currentNote);
      if (text === null) return;
      const entry = getSessionEntry(id);
      entry.note = text.trim();
      persistCurrentSession();
      renderItems();
      renderDiff();
    }

    if (event.target.matches("[data-action='delete']")) {
      const confirmDelete = confirm("Удалить позицию без удаления истории? Лучше архивировать. Удалить точно?");
      if (!confirmDelete) return;
      items = items.filter((i) => i.id !== id);
      saveItems();
      renderItems();
      renderHistory();
      renderDiff();
    }
  }

  function handleItemListChange(event) {
    if (!event.target.matches("[data-role='direct']")) return;
    const row = event.target.closest(".item-row");
    if (!row) return;
    ensureSession();
    const id = row.dataset.itemId;
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value < 0) {
      alert("Количество не может быть отрицательным");
      event.target.value = getCurrentCount(id) ?? 0;
      return;
    }
    if (value > 1_000_000) {
      alert("Слишком большое значение — проверьте ввод");
      return;
    }
    applyCount(id, value);
  }

  function applyCount(id, value) {
    ensureSession();
    const entry = getSessionEntry(id);
    entry.qty = value;
    persistCurrentSession();
    renderItems();
    renderDiff();
  }

  function getSessionEntry(id) {
    if (!currentSession.counts[id]) {
      currentSession.counts[id] = { qty: 0 };
    }
    return currentSession.counts[id];
  }

  function toggleArchive(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    item.archived = !item.archived;
    saveItems();
    renderItems();
  }

  function ensureSession() {
    if (currentSession) return;
    currentSession = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      startedAt: new Date().toISOString(),
      note: elements.sessionNote.value || "",
      counts: {},
    };
    persistCurrentSession();
    updateSessionStatus();
    renderHistory();
  }

  function startNewSession() {
    if (currentSession && !confirm("Начать заново? Текущий подсчёт не сохранён.")) return;
    currentSession = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      startedAt: new Date().toISOString(),
      note: "",
      counts: {},
    };
    elements.sessionNote.value = "";
    persistCurrentSession();
    updateSessionStatus();
    renderItems();
  }

  function saveSession() {
    if (!currentSession) {
      alert("Нет активной инвентаризации");
      return;
    }
    if (!confirm("Сохранить итоги инвентаризации?")) return;
    const sessionToSave = {
      ...currentSession,
      finishedAt: new Date().toISOString(),
    };
    sessions.push(sessionToSave);
    saveSessions();
    selectedSessionId = sessionToSave.id;
    const prev = sessions.length > 1 ? sessions.at(-2) : null;
    baselineSessionId = prev?.id ?? null;
    currentSession = null;
    clearCurrentSession();
    renderHistory();
    renderDiff();
    renderItems();
    updateSessionStatus();
    alert("Сохранено. История обновлена");
  }

  function resetSession() {
    if (!currentSession) return;
    if (!confirm("Очистить текущий подсчёт без сохранения?")) return;
    currentSession = null;
    clearCurrentSession();
    renderItems();
    updateSessionStatus();
  }

  function renderItems() {
    const filtered = items
      .filter((item) => (filters.archived ? true : !item.archived))
      .filter((item) => {
        if (filters.category !== "all" && item.category !== filters.category) return false;
        if (filters.location !== "all" && item.location !== filters.location) return false;
        if (filters.search && !item.name.toLowerCase().includes(filters.search)) return false;
        return true;
      })
      .filter((item) => {
        if (!filters.lowOnly) return true;
        const count = getCurrentCount(item.id) ?? getLastSavedCount(item.id) ?? 0;
        return item.minStock ? count < item.minStock : false;
      })
      .sort((a, b) => a.category.localeCompare(b.category));

    elements.itemList.innerHTML = filtered
      .map((item) => {
        const count = getCurrentCount(item.id) ?? 0;
        const previous = getLastSavedCount(item.id);
        const low = item.minStock && count < item.minStock;
        const noteFlag = currentSession?.counts?.[item.id]?.note;
        return `
          <div class="item-row" data-item-id="${item.id}">
            <div>
              <div class="item-title">${item.name}</div>
              <div class="item-sub">${item.category}${item.location ? " · " + item.location : ""}</div>
              ${item.note ? `<div class="item-sub">${item.note}</div>` : ""}
              ${item.archived ? `<span class="tag pill-danger">Архив</span>` : ""}
            </div>
            <div>
              <div class="item-sub">Минимум: ${item.minStock ?? 0}</div>
              <div class="item-sub">${previous !== undefined ? `Прошлая фиксация: ${previous}` : "Нет прошлых данных"}</div>
              ${low ? '<div class="item-sub low">Ниже PAR уровня</div>' : ""}
            </div>
            <div class="count-stack">
              <input class="count-input" type="number" min="0" data-role="direct" value="${count}" />
              <button class="btn small" data-action="add">+</button>
              <button class="btn small secondary" data-action="note">📝</button>
              ${noteFlag ? `<span class="note-flag">есть заметка</span>` : ""}
            </div>
            <div class="stack">
              <button class="chip" data-action="archive">${item.archived ? "Разархивировать" : "В архив"}</button>
              <button class="chip" data-action="delete">Удалить</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderHistory() {
    elements.historyList.innerHTML = sessions
      .map((session, index) => {
        const totalPositions = Object.keys(session.counts || {}).length;
        const sums = Object.values(session.counts || {}).reduce((acc, entry) => acc + (entry.qty || 0), 0);
        const active = session.id === selectedSessionId;
        const label = session.finishedAt ? new Date(session.finishedAt).toLocaleString() : new Date(session.startedAt).toLocaleString();
        const compareLabel = index === sessions.length - 1 ? "последняя" : `#${index + 1}`;
        return `
          <div class="history-card ${active ? "active" : ""}" data-session-id="${session.id}">
            <div>
              <div class="item-title">${label}</div>
              <div class="item-sub">Позиций: ${totalPositions}, всего учтено: ${sums}</div>
              ${session.note ? `<div class="item-sub">${session.note}</div>` : ""}
            </div>
            <span class="badge">${compareLabel}</span>
          </div>
        `;
      })
      .join("") || '<div class="muted">История пуста</div>';

    elements.baselineSelect.innerHTML = ['<option value="">Сравнить с предыдущей</option>']
      .concat(
        sessions.map((session) => `<option value="${session.id}" ${session.id === baselineSessionId ? "selected" : ""}>${new Date(session.finishedAt || session.startedAt).toLocaleString()}</option>`)
      )
      .join("");
  }

  function renderDiff() {
    const current = sessions.find((s) => s.id === selectedSessionId);
    if (!current) {
      elements.diffList.innerHTML = "<div class=\"muted\">Выберите инвентаризацию из истории</div>";
      elements.diffLabel.textContent = "Выберите инвентаризацию";
      return;
    }
    const baseline = baselineSessionId
      ? sessions.find((s) => s.id === baselineSessionId)
      : getPreviousSession(selectedSessionId);
    const label = baseline
      ? `Сравнение с ${new Date(baseline.finishedAt || baseline.startedAt).toLocaleString()}`
      : "Базовая точка не выбрана (нет предыдущей записи)";
    elements.diffLabel.textContent = label;

    const rows = items.map((item) => {
      const currentCount = current.counts?.[item.id]?.qty ?? 0;
      const baseCount = baseline?.counts?.[item.id]?.qty ?? 0;
      const diff = currentCount - baseCount;
      const changed = diff !== 0;
      return { item, currentCount, baseCount, diff, changed };
    });

    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    elements.diffList.innerHTML = rows
      .map((row) => {
        const diffClass = row.diff > 0 ? "diff-pos" : row.diff < 0 ? "diff-neg" : "";
        const diffText = row.diff > 0 ? `+${row.diff}` : row.diff;
        const low = row.item.minStock && row.currentCount < row.item.minStock;
        return `
          <div class="history-row">
            <div>
              <div class="item-title">${row.item.name}</div>
              <div class="item-sub">${row.item.category}${row.item.location ? " · " + row.item.location : ""}</div>
            </div>
            <div>
              <div class="item-sub">Было: ${row.baseCount}</div>
              <div class="item-sub">Стало: ${row.currentCount}</div>
            </div>
            <div class="item-title ${diffClass}">${row.changed ? diffText : "без изменений"}</div>
            <div class="item-sub">${low ? '<span class="low">Ниже минимума</span>' : ""}</div>
          </div>
        `;
      })
      .join("");
  }

  function exportCsv() {
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (!session) {
      alert("Выберите инвентаризацию для экспорта");
      return;
    }
    const baseline = baselineSessionId
      ? sessions.find((s) => s.id === baselineSessionId)
      : getPreviousSession(selectedSessionId);

    const header = ["Название", "Категория", "Локация", "Минимум", "Было", "Стало", "Δ", "Заметка позиции", "Комментарий инвентаризации"];
    const lines = [header];
    items.forEach((item) => {
      const currentCount = session.counts?.[item.id]?.qty ?? 0;
      const baseCount = baseline?.counts?.[item.id]?.qty ?? 0;
      const diff = currentCount - baseCount;
      const note = session.counts?.[item.id]?.note || "";
      lines.push([
        item.name,
        item.category,
        item.location || "",
        item.minStock ?? 0,
        baseCount,
        currentCount,
        diff,
        note,
        session.note || "",
      ]);
    });
    const csv = lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-${new Date(session.finishedAt || session.startedAt).toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateSessionStatus() {
    if (!currentSession) {
      elements.sessionStatus.textContent = "Нет активной инвентаризации";
      return;
    }
    const total = Object.values(currentSession.counts || {}).reduce((acc, entry) => acc + (entry.qty || 0), 0);
    elements.sessionStatus.textContent = `Активно · позиций: ${Object.keys(currentSession.counts).length}, всего: ${total}`;
  }

  function syncNoteField() {
    if (currentSession) {
      elements.sessionNote.value = currentSession.note || "";
    }
  }

  function getCurrentCount(id) {
    return currentSession?.counts?.[id]?.qty;
  }

  function getLastSavedCount(id) {
    const last = sessions.at(-1);
    if (!last) return undefined;
    return last.counts?.[id]?.qty;
  }

  function getPreviousSession(id) {
    const index = sessions.findIndex((s) => s.id === id);
    if (index <= 0) return null;
    return sessions[index - 1];
  }

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.items);
      if (!raw) return defaultItemsWithIds();
      return JSON.parse(raw);
    } catch (err) {
      console.error("Не удалось загрузить каталог", err);
      return defaultItemsWithIds();
    }
  }

  function defaultItemsWithIds() {
    return defaultItems.map((item) => ({
      ...item,
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      archived: false,
      createdAt: new Date().toISOString(),
    }));
  }

  function saveItems() {
    localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(items));
  }

  function loadSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.sessions);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (err) {
      console.error("Не удалось загрузить историю", err);
      return [];
    }
  }

  function saveSessions() {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
  }

  function loadCurrentSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.current);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.error("Не удалось загрузить черновик", err);
      return null;
    }
  }

  function persistCurrentSession() {
    if (!currentSession) return;
    localStorage.setItem(STORAGE_KEYS.current, JSON.stringify(currentSession));
    updateSessionStatus();
  }

  function clearCurrentSession() {
    localStorage.removeItem(STORAGE_KEYS.current);
  }
})();

