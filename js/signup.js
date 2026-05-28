const signupForm = document.getElementById("signupForm");
const signupFlash = document.getElementById("signupFlash");

function showFlash(type, message) {
  signupFlash.className = `alert alert-${type}`;
  signupFlash.textContent = message;
  signupFlash.classList.remove("d-none");
}

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = document.getElementById("signupPassword").value;
  const confirmPassword = document.getElementById("signupConfirmPassword").value;

  if (password !== confirmPassword) {
    showFlash("danger", "Passwords do not match.");
    return;
  }

  const payload = {
    name: document.getElementById("signupName").value.trim(),
    email: document.getElementById("signupEmail").value.trim(),
    password,
  };

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Registration failed.");

    localStorage.setItem("pendingVerificationEmail", payload.email);
    if (data.fallbackCode && !data.verificationSent) {
      showFlash("warning", `Verification email could not be sent. Your code is ${data.fallbackCode}. Redirecting to verification...`);
    } else {
      showFlash("success", "Registration successful. Redirecting to email verification...");
    }
    setTimeout(() => {
      window.location.href = "verify.html";
    }, 1200);
  } catch (error) {
    showFlash("danger", error.message);
  }
});
