(() => {
  const API = "/api";
  const STORAGE_KEY = "tekoa_selection";
  const PSYCH_SIGNUP_KEY = "tekoa_psychologist_signup";

  const defaultSelection = {
    psychologistId: "psy-1",
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    packageCode: "pkg-4",
  };

  const getSelection = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaultSelection, ...JSON.parse(raw) } : { ...defaultSelection };
    } catch {
      return { ...defaultSelection };
    }
  };

  const setSelection = (patch) => {
    const next = { ...getSelection(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  };

  const getPsychSignup = () => {
    try {
      const raw = localStorage.getItem(PSYCH_SIGNUP_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const setPsychSignup = (patch) => {
    const next = { ...getPsychSignup(), ...patch };
    localStorage.setItem(PSYCH_SIGNUP_KEY, JSON.stringify(next));
    return next;
  };

  const showToast = (message, type = "info") => {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.position = "fixed";
    toast.style.bottom = "24px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.padding = "10px 16px";
    toast.style.borderRadius = "999px";
    toast.style.background = type === "error" ? "#ef4444" : "#111827";
    toast.style.color = "#fff";
    toast.style.fontSize = "14px";
    toast.style.zIndex = "9999";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  };

  const apiRequest = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    if (response.status === 401) {
      showToast("Faça login para continuar.", "error");
      window.location.href = "entrada.html";
      return null;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(data.error || "Erro na solicitação.", "error");
      return null;
    }
    return data;
  };

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "short",
    }).format(date);
  };

  const formatTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatFullDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date);
  };

  let psychologistsCache = null;

  const normalizeText = (value) =>
    (value || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const renderPsychologists = async (filter = "all") => {
    const container = document.getElementById("psychologists-list");
    if (!container) return;
    if (!psychologistsCache) {
      const data = await apiRequest("/psychologists");
      if (!data) return;
      psychologistsCache = data;
    }
    const normalizedFilter = normalizeText(filter);
    const data =
      normalizedFilter === "all"
        ? psychologistsCache
        : psychologistsCache.filter((item) => {
            const tags = Array.isArray(item.tags) ? item.tags : [];
            return tags.some(
              (tag) => normalizeText(tag).includes(normalizedFilter)
            );
          });
    container.innerHTML = "";
    if (!data || data.length === 0) {
      container.innerHTML =
        '<p class="text-sm text-gray-500">Nenhum profissional encontrado.</p>';
      return;
    }
    data.forEach((item) => {
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const card = document.createElement("article");
      card.className =
        "w-full bg-white dark:bg-surface-dark rounded-3xl p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 dark:border-gray-800 flex flex-col gap-4";
      card.innerHTML = `
        <div class="p-4 flex flex-col gap-4">
          <div class="flex gap-4 items-start">
            <div class="size-20 shrink-0 rounded-full overflow-hidden bg-gray-200">
              <img alt="${item.name}" class="w-full h-full object-cover" src="${item.image_url || ""}"/>
            </div>
            <div class="flex flex-col flex-1">
              <div class="flex justify-between items-start">
                <div>
                  <h3 class="text-[#111318] dark:text-white text-lg font-bold leading-tight">${item.name}</h3>
                  <p class="text-primary text-sm font-medium">${item.title || "Psicólogo"}</p>
                </div>
                <div class="flex items-center gap-1 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded-lg">
                  <span class="material-symbols-outlined text-yellow-500 text-[16px] leading-none">star</span>
                  <span class="text-xs font-bold text-yellow-700 dark:text-yellow-500">${item.rating || "-"}</span>
                </div>
              </div>
              <div class="flex flex-wrap gap-1 mt-2">
                ${tags
                  .map(
                    (tag) =>
                      `<span class="px-2 py-1 bg-surface-light dark:bg-background-dark rounded-md text-xs text-gray-600 dark:text-gray-300">${tag}</span>`
                  )
                  .join("")}
              </div>
            </div>
          </div>
          <div class="h-px w-full bg-gray-100 dark:bg-gray-700"></div>
          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <div class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 mb-1">
                <span class="material-symbols-outlined text-[18px]">calendar_today</span>
                <span class="text-xs">Próxima vaga</span>
              </div>
              <p class="text-[#111318] dark:text-white text-sm font-semibold">Hoje, 14:00</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-500 dark:text-gray-400">Sessão (50 min)</p>
              <p class="text-lg font-bold text-[#111318] dark:text-white">€${(item.price_cents || 1700) / 100}</p>
            </div>
          </div>
        </div>
        <div class="px-4 pb-4">
          <a class="w-full bg-primary hover:bg-primary/90 text-white font-semibold h-12 rounded-full transition-all active:scale-[0.98] flex items-center justify-center gap-2" href="psicologo-perfil.html" data-action="select-psychologist" data-psychologist-id="${
            item.id
          }"><span>Ver perfil</span><span class="material-symbols-outlined text-[20px]">arrow_forward</span></a>
        </div>
      `;
      container.appendChild(card);
    });
  };

  const initPsychologistFilters = () => {
    const wrapper = document.querySelector("[data-psychologists-filters]");
    if (!wrapper) return;
    wrapper.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      event.preventDefault();
      const filter = button.dataset.filter || "all";
      wrapper.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.remove("bg-[#111318]", "dark:bg-white");
        const label = item.querySelector("p");
        if (label) {
          label.classList.remove("text-white", "dark:text-[#111318]");
          label.classList.add("text-[#111318]", "dark:text-white");
        }
        item.classList.add(
          "bg-surface-light",
          "dark:bg-surface-dark",
          "border",
          "border-gray-100",
          "dark:border-gray-800"
        );
      });
      button.classList.remove(
        "bg-surface-light",
        "dark:bg-surface-dark",
        "border",
        "border-gray-100",
        "dark:border-gray-800"
      );
      button.classList.add("bg-[#111318]", "dark:bg-white");
      const label = button.querySelector("p");
      if (label) {
        label.classList.remove("text-[#111318]", "dark:text-white");
        label.classList.add("text-white", "dark:text-[#111318]");
      }
      renderPsychologists(filter);
    });
  };

  const renderAppointments = async () => {
    const upcoming = document.querySelector("[data-appointments-upcoming]");
    const history = document.querySelector("[data-appointments-history]");
    if (!upcoming && !history) return;
    const [appointments, psychologists] = await Promise.all([
      apiRequest("/appointments"),
      apiRequest("/psychologists"),
    ]);
    if (!appointments || !psychologists) return;
    const map = new Map(psychologists.map((item) => [item.id, item]));
    const now = new Date();
    const upcomingItems = [];
    const historyItems = [];
    appointments.forEach((item) => {
      const date = new Date(item.scheduled_at);
      const target = date >= now ? upcomingItems : historyItems;
      target.push(item);
    });
    if (upcoming) {
      upcoming.innerHTML = "";
      if (upcomingItems.length === 0) {
        upcoming.innerHTML =
          '<p class="text-sm text-text-sub dark:text-gray-400">Sem agendamentos futuros.</p>';
      } else {
        upcomingItems.forEach((item) => {
          const psy = map.get(item.psychologist_id);
          const card = document.createElement("div");
          card.className =
            "flex flex-col rounded-xl bg-white dark:bg-gray-800 shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden border border-gray-100 dark:border-gray-700";
          card.innerHTML = `
            <div class="bg-accent/10 px-4 py-2 flex items-center justify-between border-b border-accent/10">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                <span class="text-accent font-bold text-sm uppercase tracking-wide">Psicólogo</span>
              </div>
              <span class="text-xs font-semibold text-accent/80 bg-accent/10 px-2 py-0.5 rounded-full">${
                item.status === "paid" ? "Confirmado" : "Agendado"
              }</span>
            </div>
            <div class="p-4 flex gap-4">
              <div class="w-16 h-16 rounded-xl bg-gray-200 shrink-0 bg-cover bg-center" style="background-image: url('${
                psy?.image_url || ""
              }');"></div>
              <div class="flex-1 flex flex-col justify-center">
                <h3 class="text-lg font-bold text-[#111318] dark:text-white leading-tight">${
                  psy?.name || "Profissional"
                }</h3>
                <div class="flex items-center gap-4 mt-2 text-text-sub dark:text-gray-400">
                  <div class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-lg">calendar_today</span>
                    <span class="text-sm font-medium">${formatDate(item.scheduled_at)}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-lg">schedule</span>
                    <span class="text-sm font-medium">${formatTime(item.scheduled_at)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="px-4 pb-4">
              <button class="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-blue-700 active:scale-[0.98] transition-all text-white font-bold text-base shadow-lg shadow-blue-500/20">
                <span class="material-symbols-outlined">videocam</span>
                Entrar na Sala
              </button>
            </div>
          `;
          upcoming.appendChild(card);
        });
      }
    }
    if (history) {
      history.innerHTML = "";
      if (historyItems.length === 0) {
        history.innerHTML =
          '<p class="text-sm text-text-sub dark:text-gray-400">Nenhum histórico ainda.</p>';
      } else {
        historyItems.forEach((item) => {
          const psy = map.get(item.psychologist_id);
          const row = document.createElement("div");
          row.className =
            "flex items-center justify-between p-4 rounded-xl bg-surface-light dark:bg-gray-800/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-colors";
          row.innerHTML = `
            <div class="flex gap-3 items-center">
              <div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400">
                <span class="material-symbols-outlined text-xl">check</span>
              </div>
              <div>
                <p class="font-bold text-[#111318] dark:text-white text-sm">${psy?.name || "Profissional"}</p>
                <p class="text-xs text-text-sub dark:text-gray-400 mt-0.5">Psicólogo • ${formatDate(
                  item.scheduled_at
                )}</p>
              </div>
            </div>
            <button class="text-primary font-semibold text-sm px-3 py-1 rounded-lg hover:bg-primary/10">Ver</button>
          `;
          history.appendChild(row);
        });
      }
    }
  };

  const renderContentList = async (selector, path, renderItem) => {
    const container = document.querySelector(selector);
    if (!container) return;
    const data = await apiRequest(path);
    if (!data) return;
    container.innerHTML = "";
    data.forEach((item) => {
      container.insertAdjacentHTML("beforeend", renderItem(item));
    });
  };

  const renderBlog = async () => {
    const hero = document.querySelector("[data-blog-hero]");
    const list = document.querySelector("[data-blog-list]");
    if (!hero && !list) return;
    const data = await apiRequest("/blog");
    if (!data) return;
    if (hero) {
      const top = data[0];
      hero.innerHTML = top
        ? `
          <div class="flex flex-col items-stretch justify-start rounded-xl shadow-lg bg-white dark:bg-gray-800">
            <div class="w-full bg-center bg-no-repeat aspect-video bg-cover rounded-t-xl" style="background-image: url('${top.image_url || ""}');"></div>
            <div class="flex w-full flex-col items-start justify-center gap-4 p-4">
              <span class="inline-block rounded-full bg-orange-100 dark:bg-orange-900 px-3 py-1 text-sm font-semibold text-orange-800 dark:text-orange-200">${
                top.category || "Blog"
              }</span>
              <p class="text-[#1F2937] dark:text-white text-xl font-bold leading-tight tracking-tight">${top.title}</p>
              <p class="text-gray-600 dark:text-gray-300 text-base font-normal leading-normal">${top.summary || ""}</p>
              <p class="text-gray-500 dark:text-gray-400 text-sm font-normal leading-normal">Equipe Tekóa • Leitura ${
                top.read_minutes || "-"
              } min</p>
              <a class="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-full h-12 px-6 bg-primary text-white text-base font-medium leading-normal mt-2" href="blog.html">Ler artigo</a>
            </div>
          </div>`
        : '<p class="text-sm text-gray-500">Sem artigos.</p>';
    }
    if (list) {
      list.innerHTML = "";
      data.slice(1).forEach((item) => {
        list.insertAdjacentHTML(
          "beforeend",
          `
            <a class="flex items-start justify-between gap-4 rounded-xl bg-white dark:bg-gray-800 p-4 shadow-lg" href="blog.html">
              <div class="flex flex-1 flex-col gap-3">
                <span class="inline-block rounded-full bg-blue-100 dark:bg-blue-900 px-3 py-1 text-sm font-semibold text-primary dark:text-blue-200 w-fit">${item.category || "Blog"}</span>
                <p class="text-[#1F2937] dark:text-white text-base font-bold leading-tight">${item.title}</p>
                <p class="text-gray-500 dark:text-gray-400 text-sm font-normal leading-normal">Equipe Tekóa • ${
                  item.read_minutes || "-"
                } min</p>
              </div>
              <div class="w-24 h-24 bg-center bg-no-repeat bg-cover rounded-lg flex-shrink-0" style="background-image: url('${
                item.image_url || ""
              }');"></div>
            </a>`
        );
      });
    }
  };

  const renderNews = async () => {
    await renderContentList("[data-news-list]", "/news", (item) => {
      return `
        <div class="p-4 pt-0 @container">
          <div class="flex flex-col items-stretch justify-start rounded-xl bg-background-light dark:bg-gray-800/50 shadow-[0_2px_8px_rgba(0,0,0,0.05)] dark:shadow-none border border-gray-200/50 dark:border-gray-700/50">
            <div class="w-full bg-center bg-no-repeat aspect-video bg-cover rounded-t-xl" style="background-image: url('${item.image_url || ""}');"></div>
            <div class="flex w-full grow flex-col items-stretch justify-center gap-2 p-4">
              <p class="text-gray-900 dark:text-gray-100 text-lg font-bold leading-tight tracking-[-0.015em]">${item.title}</p>
              <p class="text-gray-600 dark:text-gray-400 text-base font-normal leading-normal">${item.summary || ""}</p>
              <div class="flex items-center justify-between pt-2">
                <p class="text-gray-500 dark:text-gray-400 text-sm font-normal leading-normal">Fonte: ${item.source || "-"}</p>
                <a class="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full h-10 px-4 bg-primary text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90" href="${item.url || "#"}">Ler na fonte<span class="material-symbols-outlined text-base">open_in_new</span></a>
              </div>
            </div>
          </div>
        </div>`;
    });
  };

  const renderVideos = async () => {
    await renderContentList("[data-videos-list]", "/videos", (item) => {
      return `
        <div class="flex flex-col overflow-hidden rounded-xl border border-[#f3f4f6] bg-white shadow-sm hover:shadow-md transition-shadow">
          <div class="relative w-full aspect-video bg-gray-100 overflow-hidden">
            <img alt="${item.title}" class="h-full w-full object-cover" src="${item.image_url || ""}"/>
            <div class="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-xs font-medium text-white">
              ${item.duration || ""}
            </div>
          </div>
          <div class="flex flex-col p-4 gap-3">
            <div class="flex flex-col gap-1">
              <span class="text-primary text-xs font-bold uppercase tracking-wider">${item.category || "Video"}</span>
              <h3 class="text-[#101622] text-lg font-bold leading-tight">${item.title}</h3>
            </div>
            <div class="flex items-center gap-2 text-[#616f89] text-sm">
              <span class="material-symbols-outlined text-[18px]">smart_display</span>
              <span>${item.url ? "YouTube" : "Video"}</span>
              <span class="text-xs text-[#9ca3af]">•</span>
              <span>${item.channel || "Tekóa"}</span>
            </div>
            <div class="h-px bg-[#f3f4f6] w-full"></div>
            <div class="flex items-center justify-between gap-4">
              <p class="text-xs text-[#9ca3af] font-medium flex-1">Você será redirecionado</p>
              <a class="flex shrink-0 items-center justify-center size-8 rounded-full bg-[#f0f2f4] text-primary hover:bg-primary hover:text-white transition-colors" href="${item.url || "#"}">
                <span class="material-symbols-outlined text-[20px]">open_in_new</span>
              </a>
            </div>
          </div>
        </div>`;
    });
  };

  const renderEvents = async () => {
    await renderContentList("[data-events-list]", "/events", (item) => {
      if (item.status && item.status !== "upcoming") return "";
      return `
        <div class="flex flex-col items-stretch justify-start rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] bg-white dark:bg-background-dark border border-transparent dark:border-stone-800">
          <div class="w-full bg-center bg-no-repeat aspect-[2/1] bg-cover rounded-t-xl" style="background-image: url('${item.image_url || ""}');"></div>
          <div class="flex w-full grow flex-col items-stretch justify-center gap-4 p-4">
            <div class="flex items-center gap-3">
              <span class="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/50 px-3 py-1 text-sm font-medium text-green-800 dark:text-green-300">Gratuito</span>
            </div>
            <p class="text-[#1D2939] dark:text-background-light text-lg font-bold leading-tight tracking-[-0.015em]">${item.title}</p>
            <div class="flex flex-col gap-2">
              <p class="text-[#667085] dark:text-stone-400 text-base font-normal leading-normal">${item.description || ""}</p>
              <p class="text-[#667085] dark:text-stone-400 text-sm font-medium leading-normal flex items-center gap-2"><span class="material-symbols-outlined text-base">calendar_today</span> ${formatFullDate(
                item.date_time
              )} • Webinar</p>
            </div>
            <a class="flex min-w-[84px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-full h-12 px-4 bg-primary text-white text-base font-bold leading-normal mt-2" href="#" data-action="event-signup" data-event-id="${
              item.id
            }">Inscrever-se</a>
            <p class="text-[#667085] dark:text-stone-400 text-xs font-normal leading-normal text-center pt-1">Você receberá um lembrete antes do evento.</p>
          </div>
        </div>`;
    });
  };

  const renderSupport = async () => {
    await renderContentList("[data-support-list]", "/support-orgs", (item) => {
      return `
        <a href="rede-apoio.html" class="group relative flex w-full flex-col overflow-hidden rounded-xl bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800 shadow-card hover:shadow-lg transition-all active:scale-[0.99]">
          <div class="flex p-4 gap-4 items-start">
            <div class="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700">
              <img class="h-full w-full object-cover" alt="${item.name}" src="${item.image_url || ""}"/>
            </div>
            <div class="flex flex-1 flex-col gap-1">
              <div class="flex items-start justify-between">
                <span class="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-primary dark:text-blue-300 ring-1 ring-inset ring-blue-700/10">${item.category || "Instituicao"}</span>
                <span class="material-symbols-outlined text-gray-400">chevron_right</span>
              </div>
              <h3 class="text-lg font-bold text-text-main dark:text-white leading-tight mt-1">${item.name}</h3>
              <div class="flex items-center gap-1 text-text-secondary dark:text-gray-400 text-sm mt-1">
                <span class="material-symbols-outlined text-[16px] text-primary">location_on</span>
                <span>${item.city || "-"}, ${item.country || "-"}</span>
              </div>
            </div>
          </div>
        </a>`;
    });
  };

  const renderTests = async (selector, categoryFilter, redirect) => {
    const container = document.querySelector(selector);
    if (!container) return;
    const data = await apiRequest("/tests");
    if (!data) return;
    const items = data.filter((item) =>
      item.category?.toLowerCase().includes(categoryFilter.toLowerCase())
    );
    container.innerHTML = "";
    items.forEach((item) => {
      container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="flex flex-col gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div class="flex items-start gap-4">
            <div class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <span class="material-symbols-outlined text-3xl">psychology</span>
            </div>
            <div class="flex flex-1 flex-col justify-center">
              <p class="text-[#101622] dark:text-white text-base font-semibold leading-normal">${item.name}</p>
              <p class="text-gray-500 dark:text-gray-400 text-sm font-normal leading-normal">Tempo estimado</p>
              <p class="text-gray-500 dark:text-gray-400 text-sm font-normal leading-normal mt-1">${item.duration_minutes || "-"} minutos</p>
            </div>
          </div>
          <a class="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-primary text-white text-sm font-medium leading-normal" href="#" data-action="test-result" data-test-id="${item.id}" data-redirect="${redirect}">Iniciar teste</a>
        </div>`
      );
    });
  };

  const renderConfirmation = async () => {
    const nameEl = document.querySelector("[data-confirm-name]");
    const dateEl = document.querySelector("[data-confirm-date]");
    const timeEl = document.querySelector("[data-confirm-time]");
    if (!nameEl && !dateEl && !timeEl) return;
    const [appointments, psychologists] = await Promise.all([
      apiRequest("/appointments"),
      apiRequest("/psychologists"),
    ]);
    if (!appointments || appointments.length === 0) return;
    const map = new Map((psychologists || []).map((item) => [item.id, item]));
    const latest = appointments[0];
    const psy = map.get(latest.psychologist_id);
    if (nameEl) nameEl.textContent = psy?.name || "Profissional";
    if (dateEl) dateEl.textContent = formatFullDate(latest.scheduled_at);
    if (timeEl) timeEl.textContent = formatTime(latest.scheduled_at);
  };

  const renderPsychologistProfile = async () => {
    const nameEl = document.querySelector("[data-profile-name]");
    const titleEl = document.querySelector("[data-profile-title]");
    const bioEl = document.querySelector("[data-profile-bio]");
    const imageEl = document.querySelector("[data-profile-image]");
    const tagsEl = document.querySelector("[data-profile-tags]");
    const cta = document.querySelector("[data-profile-cta]");
    if (!nameEl && !titleEl && !bioEl && !imageEl && !tagsEl) return;
    const selection = getSelection();
    const data = await apiRequest("/psychologists");
    if (!data) return;
    const psy = data.find((item) => item.id === selection.psychologistId) || data[0];
    if (!psy) return;
    if (nameEl) nameEl.textContent = psy.name || "Profissional";
    if (titleEl) titleEl.textContent = psy.title || "Psicólogo";
    if (bioEl && psy.bio) bioEl.textContent = psy.bio;
    if (imageEl && psy.image_url) imageEl.src = psy.image_url;
    if (tagsEl) {
      const tags = Array.isArray(psy.tags) ? psy.tags : [];
      tagsEl.innerHTML = tags
        .map(
          (tag) => `
        <div class="flex items-center justify-center px-4 py-2 rounded-full bg-background-light dark:bg-white/10 border border-transparent dark:border-white/5">
          <span class="text-navy-dark dark:text-white text-sm font-semibold">${tag}</span>
        </div>`
        )
        .join("");
    }
    if (cta) cta.dataset.psychologistId = psy.id;
  };

  const renderScheduleSummary = () => {
    const summary = document.querySelector("[data-schedule-summary]");
    if (!summary) return;
    const selection = getSelection();
    summary.textContent = `${formatFullDate(selection.scheduledAt)} às ${formatTime(
      selection.scheduledAt
    )}`;
  };

  const renderPsychologistSignup = () => {
    const data = getPsychSignup();
    const map = [
      ["[data-psych-name]", data.name],
      ["[data-psych-email]", data.email],
      ["[data-psych-phone]", data.phone],
      ["[data-psych-country]", data.country],
      ["[data-psych-crp]", data.crp],
      ["[data-psych-password]", data.password],
      ["[data-psych-profession]", data.profession],
      ["[data-psych-area]", data.area],
      ["[data-psych-experience]", data.experience],
      ["[data-psych-countries]", data.countries],
      ["[data-psych-linkedin]", data.linkedin],
      ["[data-psych-bio]", data.bio],
      ["[data-psych-availability-days]", data.availabilityDays],
      ["[data-psych-availability-times]", data.availabilityTimes],
      ["[data-psych-pix]", data.pixKey],
      ["[data-psych-bank]", data.bankInfo],
    ];
    map.forEach(([selector, value]) => {
      const el = document.querySelector(selector);
      if (el && value !== undefined && value !== null) {
        el.value = value;
      }
    });
  };

  const updatePsychologistStatusUI = async () => {
    const statusEl = document.querySelector("[data-psych-status]");
    const ctaLabel = document.querySelector("[data-psych-cta-label]");
    if (!statusEl && !ctaLabel) return;
    const data = await apiRequest("/psychologist-applications/me");
    if (!data?.application) return;
    const statusMap = {
      submitted: "Cadastro enviado",
      training: "Trilha obrigatória",
      review: "Em análise",
      approved: "Aprovado",
    };
    if (statusEl) {
      statusEl.textContent = statusMap[data.application.status] || "Em análise";
    }
    if (ctaLabel) {
      ctaLabel.textContent =
        data.application.status === "approved"
          ? "Acessar meu dashboard"
          : "Voltar ao início";
    }
  };

  const initSchedulePicker = () => {
    const calendarGrid = document.querySelector("[data-calendar-grid]");
    const calendarLabel = document.querySelector("[data-calendar-label]");
    const calendarMonth = document.querySelector("[data-calendar-month]");
    const dayButtons = Array.from(
      document.querySelectorAll("[data-schedule-day]")
    );
    const timeButtons = Array.from(
      document.querySelectorAll("[data-schedule-time]")
    );
    const cta = document.querySelector("[data-action='set-schedule']");
    const today = new Date();
    const monthNames = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    if (calendarGrid) {
      const year = today.getFullYear();
      const month = today.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const startOffset = (firstDay + 6) % 7; // Monday-first
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      if (calendarLabel) {
        calendarLabel.textContent = `${monthNames[month]} ${year}`;
      }
      if (calendarMonth) {
        calendarMonth.textContent = monthNames[month];
      }
      calendarGrid.innerHTML = "";
      for (let i = 0; i < startOffset; i += 1) {
        const spacer = document.createElement("span");
        spacer.className = "h-10";
        calendarGrid.appendChild(spacer);
      }
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateValue = `${year}-${String(month + 1).padStart(2, "0")}-${String(
          day
        ).padStart(2, "0")}`;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.scheduleDay = dateValue;
        button.className =
          "flex h-10 w-full items-center justify-center rounded-full text-sm font-medium text-[#111318] hover:bg-gray-100";
        button.textContent = String(day);
        calendarGrid.appendChild(button);
      }
    }
    const resolvedDayButtons = Array.from(
      document.querySelectorAll("[data-schedule-day]")
    );
    if (resolvedDayButtons.length === 0 && timeButtons.length === 0) return;

    const selection = getSelection();
    const currentDate = new Date(selection.scheduledAt);
    const currentDay = Number.isNaN(currentDate.getTime())
      ? null
      : currentDate.toISOString().slice(0, 10);
    const currentTime = Number.isNaN(currentDate.getTime())
      ? null
      : new Intl.DateTimeFormat("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(currentDate);
    const todayValue = new Date().toISOString().slice(0, 10);
    let selectedDay = todayValue || currentDay;
    let selectedTime = currentTime;

    const updateCTA = (nextIso) => {
      if (!cta) return;
      cta.dataset.scheduledAt = nextIso;
    };

    const markDaySelected = (value) => {
      resolvedDayButtons.forEach((btn) => {
        const isActive = btn.dataset.scheduleDay === value;
        btn.classList.toggle("bg-primary", isActive);
        btn.classList.toggle("text-white", isActive);
        btn.classList.toggle("shadow-md", isActive);
        btn.classList.toggle("shadow-blue-200", isActive);
        btn.classList.toggle("text-[#111318]", !isActive);
        btn.classList.toggle("hover:bg-gray-100", !isActive);
      });
    };

    const markTimeSelected = (value) => {
      timeButtons.forEach((btn) => {
        const label = btn.querySelector("span");
        const isActive = btn.dataset.scheduleTime === value;
        btn.classList.toggle("bg-primary", isActive);
        btn.classList.toggle("text-white", isActive);
        btn.classList.toggle("shadow-md", isActive);
        btn.classList.toggle("shadow-blue-200", isActive);
        btn.classList.toggle("ring-2", isActive);
        btn.classList.toggle("ring-primary", isActive);
        btn.classList.toggle("ring-offset-1", isActive);
        btn.classList.toggle("border-gray-200", !isActive);
        btn.classList.toggle("bg-white", !isActive);
        if (label) {
          label.classList.toggle("text-[#111318]", !isActive);
          label.classList.toggle("text-white", isActive);
          label.classList.toggle("font-semibold", !isActive);
          label.classList.toggle("font-bold", isActive);
        }
        const existing = btn.querySelector("[data-check]");
        if (isActive && !existing) {
          const badge = document.createElement("div");
          badge.dataset.check = "true";
          badge.className =
            "absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-white text-primary";
          badge.innerHTML =
            '<span class="material-symbols-outlined text-[10px] font-bold">check</span>';
          btn.classList.add("relative");
          btn.appendChild(badge);
        }
        if (!isActive && existing) {
          existing.remove();
          btn.classList.remove("relative");
        }
      });
    };

    const applySelection = (dateValue, timeValue) => {
      const date =
        dateValue || selectedDay || resolvedDayButtons[0]?.dataset.scheduleDay;
      const time =
        timeValue || selectedTime || timeButtons[0]?.dataset.scheduleTime;
      if (!date || !time) return;
      const next = new Date(`${date}T${time}:00`);
      const nextIso = next.toISOString();
      selectedDay = date;
      selectedTime = time;
      setSelection({ scheduledAt: nextIso });
      markDaySelected(date);
      markTimeSelected(time);
      renderScheduleSummary();
      updateCTA(nextIso);
    };

    if (currentDay) markDaySelected(currentDay);
    if (currentTime) markTimeSelected(currentTime);
    updateCTA(selection.scheduledAt);

    resolvedDayButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        applySelection(btn.dataset.scheduleDay, selectedTime);
      });
    });
    timeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        applySelection(selectedDay, btn.dataset.scheduleTime);
      });
    });

    if (cta) {
      cta.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const selection = getSelection();
        const scheduledAt =
          cta.dataset.scheduledAt || selection.scheduledAt || defaultSelection.scheduledAt;
        setSelection({ scheduledAt });
        window.location.href = cta.getAttribute("href") || "consulta-pacote.html";
      });
    }

    applySelection(selectedDay, selectedTime);
  };

  const initCadastroBackGuard = () => {
    const registerButton = document.querySelector("[data-register-submit]");
    if (!registerButton) return;
    window.addEventListener("popstate", () => {
      window.location.href = "escolha-perfil.html";
    });
  };

  const renderProfile = async () => {
    const nameEl = document.querySelector("[data-user-name]");
    const emailEl = document.querySelector("[data-user-email]");
    const avatarEl = document.querySelector("[data-user-avatar]");
    if (!nameEl && !emailEl && !avatarEl) return;
    const data = await apiRequest("/me");
    if (!data?.authenticated) return;
    if (nameEl) nameEl.textContent = data.user?.name || "Usuário";
    if (emailEl) emailEl.textContent = data.user?.email || "-";
    if (avatarEl && data.user?.name) {
      avatarEl.alt = `Foto de perfil de ${data.user.name}`;
    }
  };

  const renderDashboardGreeting = async () => {
    const greeting = document.querySelector("[data-dashboard-greeting]");
    if (!greeting) return;
    const data = await apiRequest("/me");
    if (!data?.authenticated) return;
    const firstName = data.user?.name ? data.user.name.split(" ")[0] : "Olá";
    greeting.textContent = `Olá, ${firstName}`;
  };

  const handleClick = async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    if (action === "select-psychologist") {
      const psychologistId = target.dataset.psychologistId;
      if (psychologistId) setSelection({ psychologistId });
      return;
    }

    if (action === "set-schedule") {
      event.preventDefault();
      const scheduledAt = target.dataset.scheduledAt;
      setSelection({ scheduledAt: scheduledAt || defaultSelection.scheduledAt });
      window.location.href = target.getAttribute("href") || "consulta-pacote.html";
      return;
    }

    if (action === "select-package") {
      event.preventDefault();
      const packageCode = target.dataset.packageCode || "pkg-4";
      setSelection({ packageCode });
      window.location.href = target.getAttribute("href") || "consulta-checkout.html";
      return;
    }

    if (action === "psych-step-1") {
      event.preventDefault();
      const name = document.querySelector("[data-psych-name]")?.value?.trim();
      const email = document.querySelector("[data-psych-email]")?.value?.trim();
      const phone = document.querySelector("[data-psych-phone]")?.value?.trim();
      const country = document.querySelector("[data-psych-country]")?.value?.trim();
      const crp = document.querySelector("[data-psych-crp]")?.value?.trim();
      const password = document.querySelector("[data-psych-password]")?.value;
      if (!name || !email || !password) {
        showToast("Preencha nome, e-mail e senha.", "error");
        return;
      }
      setPsychSignup({ name, email, phone, country, crp, password });
      window.location.href = "psicologo-cadastro-2.html";
      return;
    }

    if (action === "psych-step-2") {
      event.preventDefault();
      const profession = document.querySelector("[data-psych-profession]")?.value?.trim();
      const area = document.querySelector("[data-psych-area]")?.value?.trim();
      const experience = document.querySelector("[data-psych-experience]")?.value?.trim();
      const countries = document.querySelector("[data-psych-countries]")?.value?.trim();
      const linkedin = document.querySelector("[data-psych-linkedin]")?.value?.trim();
      const bio = document.querySelector("[data-psych-bio]")?.value?.trim();
      if (!profession || !area) {
        showToast("Preencha sua profissão e área de atuação.", "error");
        return;
      }
      setPsychSignup({ profession, area, experience, countries, linkedin, bio });
      window.location.href = "psicologo-cadastro-3.html";
      return;
    }

    if (action === "psych-submit") {
      event.preventDefault();
      const terms = document.querySelector("[data-psych-terms]")?.checked;
      if (!terms) {
        showToast("Aceite os termos para continuar.", "error");
        return;
      }
      const availabilityDays = document
        .querySelector("[data-psych-availability-days]")
        ?.value?.trim();
      const availabilityTimes = document
        .querySelector("[data-psych-availability-times]")
        ?.value?.trim();
      const pixKey = document.querySelector("[data-psych-pix]")?.value?.trim();
      const bankInfo = document.querySelector("[data-psych-bank]")?.value?.trim();
      const signup = setPsychSignup({
        availabilityDays,
        availabilityTimes,
        pixKey,
        bankInfo,
        termsAccepted: true,
      });
      const authResponse = await fetch(`${API}/me`);
      const me = await authResponse.json().catch(() => ({}));
      if (!me?.authenticated) {
        const register = await apiRequest("/register", {
          method: "POST",
          body: JSON.stringify({
            name: signup.name,
            email: signup.email,
            password: signup.password,
          }),
        });
        if (!register?.ok) {
          const login = await apiRequest("/login", {
            method: "POST",
            body: JSON.stringify({
              email: signup.email,
              password: signup.password,
            }),
          });
          if (!login?.ok) return;
        }
      }
      const result = await apiRequest("/psychologist-applications", {
        method: "POST",
        body: JSON.stringify({
          name: signup.name,
          email: signup.email,
          phone: signup.phone,
          country: signup.country,
          crp: signup.crp,
          profession: signup.profession,
          area: signup.area,
          experience: signup.experience,
          countries: signup.countries,
          linkedin: signup.linkedin,
          bio: signup.bio,
          availabilityDays: signup.availabilityDays,
          availabilityTimes: signup.availabilityTimes,
          pixKey: signup.pixKey,
          bankInfo: signup.bankInfo,
        }),
      });
      if (!result?.ok) return;
      setPsychSignup({ applicationId: result.id, status: result.status });
      window.location.href = "psicologo-status.html";
      return;
    }

    if (action === "psych-status-cta") {
      event.preventDefault();
      const current = await apiRequest("/psychologist-applications/me");
      if (current?.application?.status === "approved") {
        window.location.href = "dashboard.html";
        return;
      }
      window.location.href = "dashboard.html";
      return;
    }

    if (action === "go-profile-choice") {
      event.preventDefault();
      window.location.href = "escolha-perfil.html";
      return;
    }

    if (action === "checkout") {
      event.preventDefault();
      const selection = getSelection();
      const result = await apiRequest("/checkout", {
        method: "POST",
        body: JSON.stringify(selection),
      });
      if (result?.ok) {
        window.location.href = "consulta-confirmacao.html";
      }
      return;
    }

    if (action === "test-result") {
      event.preventDefault();
      const testId = target.dataset.testId;
      const result = await apiRequest("/test-results", {
        method: "POST",
        body: JSON.stringify({
          testId,
          score: Math.floor(Math.random() * 20) + 1,
          result: "Concluído",
        }),
      });
      if (result?.ok) {
        showToast("Teste registrado com sucesso.");
        window.location.href = target.dataset.redirect || "tests-saude.html";
      }
      return;
    }

    if (action === "event-signup") {
      event.preventDefault();
      const eventId = target.dataset.eventId;
      if (!eventId) return;
      const result = await apiRequest(`/events/${eventId}/signup`, { method: "POST" });
      if (result?.ok) {
        showToast("Inscrição confirmada!");
        window.location.href = target.dataset.redirect || "eventos-proximos.html";
      }
      return;
    }

    if (action === "logout") {
      event.preventDefault();
      const result = await apiRequest("/logout", { method: "POST" });
      if (result?.ok) {
        window.location.href = "entrada.html";
      }
      return;
    }
  };

  const init = () => {
    renderPsychologists();
    initPsychologistFilters();
    renderAppointments();
    renderBlog();
    renderNews();
    renderVideos();
    renderEvents();
    renderSupport();
    renderTests("[data-tests-list]", "saude", "tests-saude.html");
    renderTests("[data-tests-integracao-list]", "integracao", "tests-integracao.html");
    renderConfirmation();
    renderPsychologistProfile();
    renderScheduleSummary();
    initSchedulePicker();
    renderPsychologistSignup();
    updatePsychologistStatusUI();
    initCadastroBackGuard();
    renderProfile();
    renderDashboardGreeting();
  };

  document.addEventListener("click", handleClick);
  document.addEventListener("DOMContentLoaded", init);
})();

