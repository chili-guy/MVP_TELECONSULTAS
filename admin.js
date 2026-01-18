(() => {
  const API = "/api";

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

  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      showToast("Acesso admin necessario.", "error");
      return null;
    }
    if (!response.ok) {
      showToast(data.error || "Erro na solicitacao.", "error");
      return null;
    }
    return data;
  };

  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  };

  const types = {
    blog: {
      listPath: "/blog",
      adminPath: "/admin/blog",
      label: (item) => item.title || item.id,
    },
    news: {
      listPath: "/news",
      adminPath: "/admin/news",
      label: (item) => item.title || item.id,
    },
    videos: {
      listPath: "/videos",
      adminPath: "/admin/videos",
      label: (item) => item.title || item.id,
    },
    events: {
      listPath: "/events",
      adminPath: "/admin/events",
      label: (item) => item.title || item.id,
    },
    support: {
      listPath: "/support-orgs",
      adminPath: "/admin/support-orgs",
      label: (item) => item.name || item.id,
    },
    tests: {
      listPath: "/tests",
      adminPath: "/admin/tests",
      label: (item) => item.name || item.id,
    },
  };

  const normalizePayload = (type, formData) => {
    const raw = Object.fromEntries(formData.entries());
    if (type === "blog") {
      return {
        title: raw.title,
        category: raw.category,
        summary: raw.summary,
        readMinutes: raw.readMinutes ? Number(raw.readMinutes) : null,
        content: raw.content,
        imageUrl: raw.imageUrl,
      };
    }
    if (type === "news") {
      return {
        title: raw.title,
        summary: raw.summary,
        source: raw.source,
        url: raw.url,
        imageUrl: raw.imageUrl,
      };
    }
    if (type === "videos") {
      return {
        title: raw.title,
        category: raw.category,
        duration: raw.duration,
        channel: raw.channel,
        url: raw.url,
        imageUrl: raw.imageUrl,
      };
    }
    if (type === "events") {
      return {
        title: raw.title,
        description: raw.description,
        category: raw.category,
        dateTime: raw.dateTime,
        imageUrl: raw.imageUrl,
        status: raw.status,
        isRecorded: raw.isRecorded === "on",
      };
    }
    if (type === "support") {
      const tags = raw.tags
        ? raw.tags.split(",").map((item) => item.trim()).filter(Boolean)
        : [];
      return {
        name: raw.name,
        category: raw.category,
        city: raw.city,
        country: raw.country,
        description: raw.description,
        phone: raw.phone,
        email: raw.email,
        website: raw.website,
        tags,
        imageUrl: raw.imageUrl,
      };
    }
    if (type === "tests") {
      return {
        name: raw.name,
        category: raw.category,
        durationMinutes: raw.durationMinutes ? Number(raw.durationMinutes) : null,
      };
    }
    return raw;
  };

  const fillForm = (form, type, item) => {
    form.dataset.editId = item.id || "";
    const set = (name, value) => {
      const field = form.querySelector(`[name="${name}"]`);
      if (!field) return;
      if (field.type === "checkbox") {
        field.checked = !!value;
      } else {
        field.value = value ?? "";
      }
    };
    if (type === "blog") {
      set("title", item.title);
      set("category", item.category);
      set("summary", item.summary);
      set("readMinutes", item.read_minutes);
      set("content", item.content);
      set("imageUrl", item.image_url);
    }
    if (type === "news") {
      set("title", item.title);
      set("summary", item.summary);
      set("source", item.source);
      set("url", item.url);
      set("imageUrl", item.image_url);
    }
    if (type === "videos") {
      set("title", item.title);
      set("category", item.category);
      set("duration", item.duration);
      set("channel", item.channel);
      set("url", item.url);
      set("imageUrl", item.image_url);
    }
    if (type === "events") {
      set("title", item.title);
      set("description", item.description);
      set("category", item.category);
      set("dateTime", item.date_time);
      set("imageUrl", item.image_url);
      set("status", item.status);
      set("isRecorded", item.is_recorded);
    }
    if (type === "support") {
      set("name", item.name);
      set("category", item.category);
      set("city", item.city);
      set("country", item.country);
      set("description", item.description);
      set("phone", item.phone);
      set("email", item.email);
      set("website", item.website);
      set("tags", Array.isArray(item.tags) ? item.tags.join(", ") : "");
      set("imageUrl", item.image_url);
    }
    if (type === "tests") {
      set("name", item.name);
      set("category", item.category);
      set("durationMinutes", item.duration_minutes);
    }
  };

  const clearForm = (form) => {
    form.reset();
    delete form.dataset.editId;
  };

  const renderList = (type, items) => {
    const container = document.querySelector(`[data-admin-list="${type}"]`);
    if (!container) return;
    container.innerHTML = "";
    if (!items || items.length === 0) {
      container.innerHTML = '<p class="text-sm text-text-secondary">Sem registros.</p>';
      return;
    }
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className =
        "flex items-center justify-between gap-3 rounded-xl bg-white/70 dark:bg-white/5 p-3 border border-gray-100 dark:border-white/10";
      card.innerHTML = `
        <div class="flex flex-col">
          <p class="text-sm font-semibold">${types[type].label(item)}</p>
          <p class="text-xs text-text-secondary">${item.id}</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-700" data-admin-action="edit" data-type="${type}" data-id="${item.id}">Editar</button>
          <button class="px-3 py-1 rounded-full text-xs bg-red-100 text-red-700" data-admin-action="delete" data-type="${type}" data-id="${item.id}">Excluir</button>
        </div>
      `;
      card.dataset.item = JSON.stringify(item);
      container.appendChild(card);
    });
  };

  const loadList = async (type) => {
    const data = await request(types[type].listPath);
    if (!data) return;
    renderList(type, data);
  };

  const loadStats = async () => {
    const data = await request("/admin/stats");
    if (!data) return;
    setText('[data-stat="users"]', data.users);
    setText('[data-stat="blog"]', data.blog);
    setText('[data-stat="news"]', data.news);
    setText('[data-stat="videos"]', data.videos);
    setText('[data-stat="events"]', data.events);
    setText('[data-stat="support"]', data.support);
    setText('[data-stat="tests"]', data.tests);
  };

  const loadUsers = async () => {
    const data = await request("/admin/users");
    if (!data) return;
    const tbody = document.querySelector("[data-admin-users]");
    if (!tbody) return;
    tbody.innerHTML = "";
    data.forEach((user) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="py-2 text-sm">${user.name || "-"}</td>
        <td class="py-2 text-sm">${user.email}</td>
        <td class="py-2 text-sm">${user.is_admin ? "Sim" : "Nao"}</td>
        <td class="py-2 text-sm">${user.created_at ? user.created_at.split("T")[0] : "-"}</td>
        <td class="py-2 text-sm text-right">
          <button class="px-3 py-1 rounded-full text-xs bg-red-100 text-red-700" data-admin-action="delete-user" data-id="${user.id}">Excluir</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  };

  const loadMe = async () => {
    const data = await request("/me");
    if (!data?.authenticated) {
      setText("[data-admin-user]", "Nao autenticado");
      return;
    }
    const isAdmin = data.user?.isAdmin;
    setText("[data-admin-user]", `${data.user?.email} (${isAdmin ? "admin" : "usuario"})`);
  };

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-admin-action]");
    if (!button) return;
    const action = button.dataset.adminAction;
    if (action === "delete-user") {
      event.preventDefault();
      const id = button.dataset.id;
      const ok = await request(`/admin/users/${id}`, { method: "DELETE" });
      if (ok) loadUsers();
      return;
    }
    if (action === "edit" || action === "delete") {
      event.preventDefault();
      const type = button.dataset.type;
      const id = button.dataset.id;
      if (!type || !id) return;
      if (action === "delete") {
        const ok = await request(`${types[type].adminPath}/${id}`, { method: "DELETE" });
        if (ok) loadList(type);
        return;
      }
      const card = button.closest("[data-item]");
      if (!card) return;
      const item = JSON.parse(card.dataset.item);
      const form = document.querySelector(`[data-admin-form="${type}"]`);
      if (form) fillForm(form, type, item);
    }
  });

  document.querySelectorAll("[data-admin-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const type = form.dataset.adminForm;
      const editId = form.dataset.editId;
      const payload = normalizePayload(type, new FormData(form));
      const endpoint = editId ? `${types[type].adminPath}/${editId}` : types[type].adminPath;
      const method = editId ? "PUT" : "POST";
      const result = await request(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      if (result?.ok) {
        clearForm(form);
        loadList(type);
        loadStats();
        showToast("Salvo com sucesso.");
      }
    });
  });

  document.querySelectorAll("[data-admin-clear]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.querySelector(button.dataset.adminClear);
      if (target) clearForm(target);
    });
  });

  loadMe();
  loadStats();
  loadUsers();
  Object.keys(types).forEach((type) => loadList(type));
})();

