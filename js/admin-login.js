const loginForm = document.getElementById("adminLoginForm");
const loginFlash = document.getElementById("loginFlash");

function showFlash(type, message) {
  loginFlash.className = `alert alert-${type}`;
  loginFlash.textContent = message;
  loginFlash.classList.remove("d-none");
}

if (localStorage.getItem("adminToken")) {
  window.location.href = "admin-dashboard.html";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    email: document.getElementById("adminEmail").value.trim(),
    password: document.getElementById("adminPassword").value,
  };

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Login failed.");

    localStorage.setItem("adminToken", data.token);
    localStorage.setItem("adminId", String(data.admin.id));
    showFlash("success", "Login successful. Redirecting...");
    setTimeout(() => {
      window.location.href = "admin-dashboard.html";
    }, 700);
  } catch (error) {
    showFlash("danger", error.message);
  }
});

