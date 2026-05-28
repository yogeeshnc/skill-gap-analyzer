const verifyForm = document.getElementById("verifyForm");
const verifyFlash = document.getElementById("verifyFlash");
const verifyEmailInput = document.getElementById("verifyEmail");

function showFlash(type, message) {
  verifyFlash.className = `alert alert-${type}`;
  verifyFlash.textContent = message;
  verifyFlash.classList.remove("d-none");
}

function loadPendingEmail() {
  const email = localStorage.getItem("pendingVerificationEmail");
  if (email) {
    verifyEmailInput.value = email;
  }
}

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    email: verifyEmailInput.value.trim(),
    code: document.getElementById("verifyCode").value.trim(),
  };

  try {
    const response = await fetch("/api/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Verification failed.");

    localStorage.removeItem("pendingVerificationEmail");
    showFlash("success", "Email verified successfully. Redirecting to login...");
    setTimeout(() => {
      window.location.href = "login.html";
    }, 800);
  } catch (error) {
    showFlash("danger", error.message);
  }
});

loadPendingEmail();

const resendBtn = document.getElementById("resendBtn");
if (resendBtn) {
  resendBtn.addEventListener("click", async () => {
    const email = verifyEmailInput.value.trim();
    if (!email) {
      showFlash("warning", "Please enter your email to resend the code.");
      return;
    }

    try {
      const resp = await fetch("/api/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Resend failed.");

      if (data.verificationSent) {
        showFlash("success", "Verification code resent to your email.");
      } else {
        showFlash("warning", `Email not sent. Code: ${data.fallbackCode}`);
      }

      localStorage.setItem("pendingVerificationEmail", email);
    } catch (err) {
      showFlash("danger", err.message);
    }
  });
}
