const loginForm = document.getElementById("loginForm");
const loginFlash = document.getElementById("loginFlash");

function showFlash(type, message) {
  loginFlash.className = `alert alert-${type}`;
  loginFlash.textContent = message;
  loginFlash.classList.remove("d-none");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    email: document.getElementById("loginEmail").value.trim(),
    password: document.getElementById("loginPassword").value,
  };

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 403) {
        showFlash("warning", data.error || "Email not verified. Please verify your email.");
        setTimeout(() => {
          localStorage.setItem("pendingVerificationEmail", payload.email);
          window.location.href = "verify.html";
        }, 1200);
        return;
      }
      throw new Error(data.error || "Login failed.");
    }

    localStorage.setItem(
      "currentUser",
      JSON.stringify({
        name: data.user.name,
        email: data.user.email,
        password: payload.password,
      })
    );

    showFlash("success", "Login successful. Redirecting...");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 800);
  } catch (error) {
    showFlash("danger", error.message);
  }
});
