const token = localStorage.getItem("adminToken");
const adminId = Number(localStorage.getItem("adminId") || 1);

const flash = document.getElementById("adminFlash");
const statUsers = document.getElementById("statUsers");
const statSkills = document.getElementById("statSkills");
const statPending = document.getElementById("statPending");
const skillsTableBody = document.getElementById("skillsTableBody");
const jobsTableBody = document.getElementById("jobsTableBody");
const jobSkillMappingsBody = document.getElementById("jobSkillMappingsBody");
const jobSkillMappingSearch = document.getElementById("jobSkillMappingSearch");
const jobSkillMappingCount = document.getElementById("jobSkillMappingCount");
const refreshAll = document.getElementById("refreshAll");
const logoutBtn = document.getElementById("logoutBtn");
const openMapFromCatalog = document.getElementById("openMapFromCatalog");
const summaryUserSelect = document.getElementById("summaryUserSelect");
const sendSummaryBtn = document.getElementById("sendSummaryBtn");

const confirmModal = new bootstrap.Modal(document.getElementById("confirmModal"));
const confirmText = document.getElementById("confirmText");
const confirmActionBtn = document.getElementById("confirmActionBtn");

const mapSkillsModalEl = document.getElementById("mapSkillsModal");
const mapSkillsModal = new bootstrap.Modal(mapSkillsModalEl);
const mapSkillsModalTitle = document.getElementById("mapSkillsModalTitle");
const mapSkillsRolePickerWrap = document.getElementById("mapSkillsRolePickerWrap");
const mapSkillsRoleSelect = document.getElementById("mapSkillsRoleSelect");
const mapSkillsCurrentBody = document.getElementById("mapSkillsCurrentBody");
const mapSkillsAddSelect = document.getElementById("mapSkillsAddSelect");
const mapSkillsAddImportance = document.getElementById("mapSkillsAddImportance");
const mapSkillsAddBtn = document.getElementById("mapSkillsAddBtn");

let pendingAction = null;
let skillsCatalog = [];
let jobRolesCatalog = [];
let jobSkillMappings = [];
let mapModalRoleLocked = false;
let mapModalSelectedRoleId = null;
const mappingDisplayLimit = 8;

if (!token) {
  window.location.href = "admin-login.html";
}

function showFlash(type, message) {
  flash.className = `alert alert-${type}`;
  flash.textContent = message;
  flash.classList.remove("d-none");
  setTimeout(() => flash.classList.add("d-none"), 4000);
}

function badge(status) {
  const map = {
    Pending: "bg-warning-subtle text-warning-emphasis",
    Approved: "bg-success-subtle text-success-emphasis",
    Rejected: "bg-danger-subtle text-danger-emphasis",
  };
  return `<span class="badge ${map[status] || "bg-secondary"}">${status || "Pending"}</span>`;
}

function importanceBadgeClass(imp) {
  if (imp === "High") return "bg-danger-subtle text-danger-emphasis";
  if (imp === "Low") return "bg-secondary-subtle text-secondary-emphasis";
  return "bg-warning-subtle text-warning-emphasis";
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function apiGet(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function apiPost(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function apiDelete(url, body) {
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function skillRowTemplate(item) {
  const canReview = item.status === "Pending";
  return `
    <tr>
      <td>${item.name}</td>
      <td>${badge(item.status)}</td>
      <td class="text-secondary small">${item.user_email || "Unknown"}</td>
      <td>
        <button class="btn btn-sm btn-success ${canReview ? "" : "disabled"}" data-action="Approved" data-type="skill" data-id="${
    item.id
  }" data-name="${escapeAttr(item.name)}">Approve</button>
        <button class="btn btn-sm btn-danger ms-1 ${canReview ? "" : "disabled"}" data-action="Rejected" data-type="skill" data-id="${
    item.id
  }" data-name="${escapeAttr(item.name)}">Reject</button>
      </td>
    </tr>
  `;
}

function jobRowTemplate(item) {
  const canReview = item.status === "Pending";
  const canMap = item.status === "Approved" && item.role_id != null;
  return `
    <tr>
      <td>${item.name}</td>
      <td>${badge(item.status)}</td>
      <td class="text-secondary small">${item.user_email || "Unknown"}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-success ${canReview ? "" : "disabled"}" data-action="Approved" data-type="job" data-id="${
    item.id
  }" data-name="${escapeAttr(item.name)}">Approve</button>
        <button class="btn btn-sm btn-danger ms-1 ${canReview ? "" : "disabled"}" data-action="Rejected" data-type="job" data-id="${
    item.id
  }" data-name="${escapeAttr(item.name)}">Reject</button>
        ${
          canMap
            ? `<button type="button" class="btn btn-sm btn-outline-primary ms-1" data-map-role="${item.role_id}" data-map-name="${escapeAttr(
                item.name
              )}">Map skills</button>`
            : ""
        }
      </td>
    </tr>
  `;
}

function renderTable(tbody, items, type) {
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-secondary">No ${type} records found.</td></tr>`;
    return;
  }
  tbody.innerHTML =
    type === "job"
      ? items.map((item) => jobRowTemplate(item)).join("")
      : items.map((item) => skillRowTemplate(item)).join("");
}

function renderJobSkillMappingsOverview() {
  const searchTerm = jobSkillMappingSearch.value.trim().toLowerCase();
  const rolesFromCatalog = jobRolesCatalog
    .map((r) => ({
      roleId: r.id,
      roleName: r.name,
      skills: jobSkillMappings.filter((m) => m.roleId === r.id),
    }))
    .filter((group) => group.skills.length > 0)
    .filter((group) => {
      if (!searchTerm) return true;
      return (
        group.roleName.toLowerCase().includes(searchTerm) ||
        group.skills.some((skill) => skill.skillName.toLowerCase().includes(searchTerm))
      );
    });

  if (!rolesFromCatalog.length) {
    jobSkillMappingCount.textContent = "0 mapped jobs";
    jobSkillMappingsBody.innerHTML = `<tr><td colspan="3" class="text-secondary">No matching job skill mappings found.</td></tr>`;
    return;
  }

  const visibleRoles = rolesFromCatalog.slice(0, mappingDisplayLimit);
  jobSkillMappingCount.textContent = searchTerm
    ? `Showing ${visibleRoles.length} of ${rolesFromCatalog.length} matching jobs`
    : `Showing ${visibleRoles.length} of ${rolesFromCatalog.length} mapped jobs`;

  jobSkillMappingsBody.innerHTML = visibleRoles
    .map((group) => {
      const chips =
        group.skills.length === 0
          ? `<span class="text-secondary small">No skills mapped yet.</span>`
          : group.skills
              .map(
                (s) =>
                  `<span class="badge ${importanceBadgeClass(s.importance)} me-1 mb-1">${s.skillName} · ${s.importance}</span>`
              )
              .join(" ");

      return `
        <tr>
          <td class="fw-medium">${group.roleName}</td>
          <td class="small">${chips}</td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-primary" data-manage-role="${group.roleId}" data-manage-name="${escapeAttr(
        group.roleName
      )}">Manage</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function fillRoleSelect(selectEl, roles, selectedId) {
  selectEl.innerHTML = roles
    .map(
      (r) =>
        `<option value="${r.id}" ${Number(selectedId) === Number(r.id) ? "selected" : ""}>${r.name}</option>`
    )
    .join("");
}

function fillSkillAddSelect(roleId) {
  const mappedIds = new Set(
    jobSkillMappings.filter((m) => m.roleId === Number(roleId)).map((m) => m.skillId)
  );
  const options = skillsCatalog.filter((s) => !mappedIds.has(s.id));
  if (!options.length) {
    mapSkillsAddSelect.innerHTML = `<option value="">All catalog skills are already mapped</option>`;
    mapSkillsAddSelect.disabled = true;
    mapSkillsAddBtn.disabled = true;
    return;
  }
  mapSkillsAddSelect.disabled = false;
  mapSkillsAddBtn.disabled = false;
  mapSkillsAddSelect.innerHTML = options
    .map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join("");
}

function renderMapModalCurrentRows(roleId) {
  const rows = jobSkillMappings.filter((m) => m.roleId === Number(roleId));
  if (!rows.length) {
    mapSkillsCurrentBody.innerHTML = `<tr><td colspan="3" class="text-secondary small">No mappings yet. Add a skill below.</td></tr>`;
    return;
  }
  mapSkillsCurrentBody.innerHTML = rows
    .map(
      (m) => `
    <tr data-row-skill="${m.skillId}">
      <td>${m.skillName}</td>
      <td>
        <select class="form-select form-select-sm js-importance-change" data-role="${m.roleId}" data-skill="${m.skillId}">
          <option value="High" ${m.importance === "High" ? "selected" : ""}>High</option>
          <option value="Medium" ${m.importance === "Medium" ? "selected" : ""}>Medium</option>
          <option value="Low" ${m.importance === "Low" ? "selected" : ""}>Low</option>
        </select>
      </td>
      <td class="text-end">
        <button type="button" class="btn btn-sm btn-outline-danger js-remove-mapping" data-role="${m.roleId}" data-skill="${m.skillId}">Remove</button>
      </td>
    </tr>
  `
    )
    .join("");
}

async function openMapSkillsModal({ roleId, roleName, lockRole }) {
  await ensureCatalogsLoaded();
  mapModalRoleLocked = Boolean(lockRole);
  mapModalSelectedRoleId = Number(roleId) || Number(jobRolesCatalog[0]?.id) || null;

  if (!mapModalSelectedRoleId) {
    showFlash("warning", "No job roles available to map.");
    return;
  }

  mapSkillsRolePickerWrap.classList.toggle("d-none", mapModalRoleLocked);
  mapSkillsModalTitle.textContent = mapModalRoleLocked
    ? `Map skills — ${roleName || "Job role"}`
    : "Map skills to a job role";

  fillRoleSelect(mapSkillsRoleSelect, jobRolesCatalog, mapModalSelectedRoleId);
  if (mapModalRoleLocked) {
    mapSkillsRoleSelect.value = String(mapModalSelectedRoleId);
  }

  await reloadMappings();
  fillSkillAddSelect(mapModalSelectedRoleId);
  renderMapModalCurrentRows(mapModalSelectedRoleId);
  mapSkillsModal.show();
}

async function ensureCatalogsLoaded() {
  if (skillsCatalog.length && jobRolesCatalog.length) return;
  const [skillsData, rolesData] = await Promise.all([
    apiGet("/api/admin/skills-catalog"),
    apiGet("/api/admin/job-roles-catalog"),
  ]);
  skillsCatalog = skillsData.items || [];
  jobRolesCatalog = rolesData.items || [];
}

async function reloadMappings() {
  const data = await apiGet("/api/admin/job-skill-mappings");
  jobSkillMappings = data.mappings || [];
}

function attachActionHandlers() {
  document.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingAction = {
        action: btn.dataset.action,
        type: btn.dataset.type,
        id: Number(btn.dataset.id),
        name: btn.dataset.name,
      };
      confirmText.textContent = `Are you sure you want to ${pendingAction.action.toLowerCase()} "${pendingAction.name}"?`;
      confirmActionBtn.className = `btn ${pendingAction.action === "Approved" ? "btn-success" : "btn-danger"}`;
      confirmActionBtn.textContent = pendingAction.action;
      confirmModal.show();
    });
  });

  document.querySelectorAll("button[data-map-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rid = Number(btn.dataset.mapRole);
      const rname = btn.dataset.mapName || "";
      openMapSkillsModal({ roleId: rid, roleName: rname, lockRole: true });
    });
  });

  document.querySelectorAll("button[data-manage-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rid = Number(btn.dataset.manageRole);
      const rname = btn.dataset.manageName || "";
      openMapSkillsModal({ roleId: rid, roleName: rname, lockRole: true });
    });
  });
}

async function loadStats() {
  const data = await apiGet("/api/admin/stats");
  statUsers.textContent = data.totalUsers;
  statSkills.textContent = data.totalSkills;
  statPending.textContent = data.pendingApprovals;
}

async function loadTables() {
  const data = await apiGet("/api/admin/pending?status=Pending");
  renderTable(skillsTableBody, data.pendingSkills, "skill");
  renderTable(jobsTableBody, data.pendingJobs, "job");
  attachActionHandlers();
}

async function loadSummaryRecipients() {
  const data = await apiGet("/api/admin/pending?status=all");
  const tallies = new Map();

  const append = (row) => {
    if (row.status === "Pending") return;
    if (Number(row.notified) !== 0) return;
    const uid = row.user_id;
    if (uid == null) return;
    const prev = tallies.get(uid) || {
      email: row.user_email || `User #${uid}`,
      count: 0,
    };
    prev.count += 1;
    tallies.set(uid, prev);
  };

  (data.pendingSkills || []).forEach(append);
  (data.pendingJobs || []).forEach(append);

  if (!tallies.size) {
    summaryUserSelect.innerHTML = `<option value="">No users awaiting notification</option>`;
    sendSummaryBtn.disabled = true;
    return;
  }

  summaryUserSelect.innerHTML = [...tallies.entries()]
    .map(([userId, v]) => {
      const label = `${v.email} (${v.count} item${v.count !== 1 ? "s" : ""})`;
      return `<option value="${userId}">${escapeHtml(label)}</option>`;
    })
    .join("");
  sendSummaryBtn.disabled = false;
}

async function loadMappingsSection() {
  await ensureCatalogsLoaded();
  await reloadMappings();
  renderJobSkillMappingsOverview();
  attachActionHandlers();
}

async function refreshDashboard() {
  try {
    await Promise.all([
      loadStats(),
      loadTables(),
      loadMappingsSection(),
      loadSummaryRecipients(),
    ]);
  } catch (error) {
    showFlash("danger", error.message);
    if (error.message.toLowerCase().includes("unauthorized")) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminId");
      window.location.href = "admin-login.html";
    }
  }
}

mapSkillsRoleSelect.addEventListener("change", async () => {
  if (mapModalRoleLocked) return;
  mapModalSelectedRoleId = Number(mapSkillsRoleSelect.value);
  await reloadMappings();
  fillSkillAddSelect(mapModalSelectedRoleId);
  renderMapModalCurrentRows(mapModalSelectedRoleId);
});

mapSkillsAddBtn.addEventListener("click", async () => {
  const roleId = mapModalRoleLocked
    ? mapModalSelectedRoleId
    : Number(mapSkillsRoleSelect.value);
  const skillId = Number(mapSkillsAddSelect.value);
  const importance = mapSkillsAddImportance.value;
  if (!roleId || !skillId) {
    showFlash("warning", "Choose a skill to add.");
    return;
  }
  try {
    await apiPost("/api/admin/map-skills", { roleId, skillId, importance });
    showFlash("success", "Skill mapped.");
    await reloadMappings();
    renderJobSkillMappingsOverview();
    attachActionHandlers();
    fillSkillAddSelect(roleId);
    renderMapModalCurrentRows(roleId);
  } catch (error) {
    showFlash("danger", error.message);
  }
});

mapSkillsCurrentBody.addEventListener("change", async (e) => {
  const sel = e.target.closest(".js-importance-change");
  if (!sel) return;
  const roleId = Number(sel.dataset.role);
  const skillId = Number(sel.dataset.skill);
  const importance = sel.value;
  try {
    await apiPost("/api/admin/map-skills", { roleId, skillId, importance });
    await reloadMappings();
    renderJobSkillMappingsOverview();
    attachActionHandlers();
    fillSkillAddSelect(roleId);
  } catch (error) {
    showFlash("danger", error.message);
    await reloadMappings();
    renderMapModalCurrentRows(roleId);
  }
});

mapSkillsCurrentBody.addEventListener("click", async (e) => {
  const btn = e.target.closest(".js-remove-mapping");
  if (!btn) return;
  const roleId = Number(btn.dataset.role);
  const skillId = Number(btn.dataset.skill);
  try {
    await apiDelete("/api/admin/map-skills", { roleId, skillId });
    showFlash("success", "Mapping removed.");
    await reloadMappings();
    renderJobSkillMappingsOverview();
    attachActionHandlers();
    fillSkillAddSelect(roleId);
    renderMapModalCurrentRows(roleId);
  } catch (error) {
    showFlash("danger", error.message);
  }
});

openMapFromCatalog.addEventListener("click", () => {
  openMapSkillsModal({ lockRole: false });
});

jobSkillMappingSearch.addEventListener("input", renderJobSkillMappingsOverview);

mapSkillsModalEl.addEventListener("hidden.bs.modal", () => {
  mapModalRoleLocked = false;
});

confirmActionBtn.addEventListener("click", async () => {
  if (!pendingAction) return;
  try {
    await apiPost("/api/admin/review", {
      type: pendingAction.type,
      id: pendingAction.id,
      action: pendingAction.action,
      adminId,
    });
    confirmModal.hide();
    showFlash("success", `${pendingAction.name} ${pendingAction.action.toLowerCase()} successfully.`);
    pendingAction = null;
    await refreshDashboard();
  } catch (error) {
    showFlash("danger", error.message);
  }
});

refreshAll.addEventListener("click", refreshDashboard);

sendSummaryBtn.addEventListener("click", async () => {
  const userId = Number(summaryUserSelect.value);
  if (!userId) {
    showFlash("warning", "Select a user with pending notifications.");
    return;
  }
  try {
    const response = await fetch("/api/admin/send-summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || "Request failed.");
    }
    if (data.success === false) {
      showFlash("warning", data.message || "Nothing to send for this user.");
      return;
    }
    showFlash("success", data.message || "Email sent.");
    await loadSummaryRecipients();
  } catch (error) {
    showFlash("danger", error.message);
  }
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminId");
  window.location.href = "admin-login.html";
});

refreshDashboard();
