const analysisForm = document.getElementById("analysisForm");
const analysisResult = document.getElementById("analysisResult");
const flashMessage = document.getElementById("flashMessage");

let jobSelect;
let skillSelect;

const escapeHtml = (text) =>
  String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function showFlash(type, message) {
  flashMessage.className = `alert alert-${type}`;
  flashMessage.textContent = message;
  flashMessage.classList.remove("d-none");
  setTimeout(() => flashMessage.classList.add("d-none"), 5000);
}

function togglePasswordVisibility(buttonId, inputId) {
  const button = document.getElementById(buttonId);
  const input = document.getElementById(inputId);
  if (!button || !input) return;

  button.addEventListener("click", () => {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    button.textContent = isPassword ? "Hide" : "Show";
  });
}

function renderBulletSkillList(items, pillClass) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) {
    return '<ul class="analysis-skill-list text-secondary mb-0"><li>None</li></ul>';
  }
  return `<ul class="analysis-skill-list mb-0">${list
    .map(
      (item) =>
        `<li class="mb-1"><span class="pill ${pillClass}">${escapeHtml(item)}</span></li>`
    )
    .join("")}</ul>`;
}

function pills(list, cssClass) {
  if (!list || !list.length) return "<span>-</span>";
  return list.map((item) => `<span class="pill ${cssClass}">${escapeHtml(item)}</span>`).join("");
}

function renderAnalysis(data) {
  analysisResult.classList.remove("d-none");

  const isPending = data.status === "Pending";

  if (isPending) {
    analysisResult.innerHTML = `
      <h3>Pending Review</h3>
      <p><strong>User:</strong> ${escapeHtml(data.user.name)} (${escapeHtml(data.user.email)})</p>
      <p><strong>Selected Role:</strong> ${escapeHtml(data.role.input)} ${
        data.role.exists ? "" : '<span class="pill pill-pending">Pending review</span>'
      }</p>
      <div class="alert alert-warning">
        Your request is pending admin review because it contains unknown skills or job roles.
      </div>
      <div class="mb-3">
        <p class="mb-1"><strong>Pending Skill Suggestions</strong></p>
        ${pills(data.pending.skills, "pill-pending")}
      </div>
      <div class="mb-3">
        <p class="mb-1"><strong>Pending Job Suggestions</strong></p>
        ${pills(data.pending.jobs, "pill-pending")}
      </div>
      <p class="mb-0"><strong>Message:</strong> ${escapeHtml(data.message)}</p>
    `;
    return;
  }

  const a = data.analysis || {};
  const totalReq =
    typeof a.totalRequiredSkills === "number"
      ? a.totalRequiredSkills
      : (a.matchedSkills || []).length + (a.missingSkills || []).length;
  const matchedCount =
    typeof a.matchedSkillsCount === "number"
      ? a.matchedSkillsCount
      : (a.matchedSkills || []).length;
  const pct =
    typeof a.skillMatchPercentage === "number"
      ? a.skillMatchPercentage
      : totalReq > 0
        ? Math.round((matchedCount / totalReq) * 100)
        : 0;
  const barClass =
    pct >= 80 ? "bg-success" : pct >= 50 ? "bg-warning text-dark" : "bg-danger";

  const matchedList = a.matchedSkills || [];
  const missingList = a.missingSkills || [];
  const jobExists = Boolean(data.role && data.role.exists);
  const showNoMatchMessage = jobExists && matchedList.length === 0;

  analysisResult.innerHTML = `
    <h3>Analysis Result</h3>
    <p><strong>User:</strong> ${escapeHtml(data.user.name)} (${escapeHtml(data.user.email)})</p>
    <p><strong>Selected Role:</strong> ${escapeHtml(data.role.input)} ${
      data.role.exists ? "" : '<span class="pill pill-pending">Pending review</span>'
    }</p>

    <div class="mb-3">
      <p class="mb-2"><strong>Skill Match Percentage:</strong> <span id="skillMatchPctLabel">${pct}%</span></p>
      <div class="progress" style="height: 1.5rem" role="progressbar" id="skillMatchProgress" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" aria-label="Skill match percentage">
        <div id="skillMatchProgressBar" class="progress-bar progress-bar-striped progress-bar-animated ${barClass}" style="width: 0%; transition: width 0.55s ease-out">0%</div>
      </div>
      <p class="text-secondary small mb-0 mt-1">
        Matched ${matchedCount} of ${totalReq} required skill${totalReq === 1 ? "" : "s"} for this role.
      </p>
    </div>

    <div class="mb-3">
      <p class="mb-1"><strong>Matched Skills</strong></p>
      ${
        showNoMatchMessage
          ? `<p class="alert alert-warning py-2 px-3 small mb-2">You do not match any required skills for this job.</p>`
          : ""
      }
      ${renderBulletSkillList(matchedList, "pill-ok")}
    </div>

    <div class="mb-3">
      <p class="mb-1"><strong>Missing Skills</strong></p>
      ${renderBulletSkillList(missingList, "pill-gap")}
    </div>

    <div class="mb-3">
      <p class="mb-1"><strong>Pending Skill Suggestions</strong></p>
      ${pills(data.pending.skills, "pill-pending")}
    </div>

    <div class="mb-3">
      <p class="mb-1"><strong>Pending Job Suggestions</strong></p>
      ${pills(data.pending.jobs, "pill-pending")}
    </div>

    <p class="mb-0"><strong>Message:</strong> ${escapeHtml(data.message)}</p>
  `;

  const bar = document.getElementById("skillMatchProgressBar");
  const progress = document.getElementById("skillMatchProgress");
  const label = document.getElementById("skillMatchPctLabel");
  if (bar) {
    requestAnimationFrame(() => {
      bar.style.width = `${pct}%`;
      bar.textContent = `${pct}%`;
      bar.setAttribute("aria-valuenow", String(pct));
      progress?.setAttribute("aria-valuenow", String(pct));
      if (label) label.textContent = `${pct}%`;
    });
  }
}

async function fetchOptions(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed loading options.");
  return data.items || [];
}

async function initSearchableDropdowns() {
  const [jobs, skills] = await Promise.all([fetchOptions("/api/jobs"), fetchOptions("/api/skills")]);

  jobSelect = new TomSelect("#jobRole", {
    create: true,
    maxItems: 1,
    valueField: "value",
    labelField: "label",
    searchField: ["label"],
    options: jobs.map((item) => ({ value: item.name, label: item.name })),
    placeholder: "Search job roles or type custom",
    persist: false,
  });

  skillSelect = new TomSelect("#skills", {
    create: true,
    plugins: ["remove_button"],
    valueField: "value",
    labelField: "label",
    searchField: ["label"],
    options: skills.map((item) => ({ value: item.name, label: item.name })),
    placeholder: "Search skills or type custom and press Enter",
    persist: false,
  });
}

analysisForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    name: document.getElementById("name").value.trim(),
    email: document.getElementById("email").value.trim(),
    password: document.getElementById("password").value,
    jobRole: (jobSelect?.getValue() || "").trim(),
    skills: (skillSelect?.getValue() || []).map((s) => s.trim()).filter(Boolean),
  };

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to analyze.");
    renderAnalysis(data);
    if (data.status === "Pending") {
      showFlash("warning", "Your request is pending admin review because it contains unknown skills or job roles.");
    } else {
      showFlash("success", "Analysis completed successfully.");
    }
  } catch (error) {
    analysisResult.classList.remove("d-none");
    analysisResult.innerHTML = `<p style="color:#b91c1c;"><strong>Error:</strong> ${escapeHtml(error.message)}</p>`;
    showFlash("danger", error.message);
  }
});

async function bootstrapPage() {
  try {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

    if (!currentUser || !currentUser.email || !currentUser.password) {
      window.location.href = "login.html";
      return;
    }

    document.getElementById("sessionHeader").classList.remove("d-none");
    document.getElementById("sessionName").textContent = currentUser.name;
    document.getElementById("sessionEmail").textContent = currentUser.email;
    document.getElementById("userInfo").textContent = `${currentUser.name} — ${currentUser.email}`;
    document.getElementById("name").value = currentUser.name;
    document.getElementById("email").value = currentUser.email;
    document.getElementById("password").value = currentUser.password;

    document.getElementById("logoutBtn").addEventListener("click", () => {
      localStorage.removeItem("currentUser");
      window.location.href = "login.html";
    });

    await initSearchableDropdowns();
  } catch (error) {
    showFlash("danger", error.message);
  }
}

bootstrapPage();

