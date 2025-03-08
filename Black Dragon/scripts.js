'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM elements
  const loginContainer = document.getElementById('login-container');
  const registerContainer = document.getElementById('register-container');
  const showRegisterLinks = document.querySelectorAll('#showRegister'); // both in header and within login form
  const showLoginLink = document.getElementById('showLogin');
  const messageDiv = document.getElementById('message');

  // Toggle forms by adding/removing the "hidden" class
  const toggleForms = (showLogin) => {
    if (showLogin) {
      loginContainer.classList.remove('hidden');
      registerContainer.classList.add('hidden');
    } else {
      loginContainer.classList.add('hidden');
      registerContainer.classList.remove('hidden');
    }
    clearMessage();
  };

  // Attach toggle events for all "Show Register" links (header and login form)
  showRegisterLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      toggleForms(false);
    });
  });

  // Attach toggle event for "Show Login" link if it exists (in registration form)
  if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      toggleForms(true);
    });
  }

  // Message Functions (with emoji based on outcome)
  const showMessage = (msg, type) => {
    let emoji = "";
    if (type === "success") {
      emoji = " 😊";
    } else if (type === "danger") {
      emoji = " 😞";
    }
    messageDiv.textContent = msg + emoji;
    messageDiv.className = `alert alert-${type}`;
    messageDiv.classList.remove('hidden');
  };

  const clearMessage = () => {
    messageDiv.textContent = '';
    messageDiv.classList.add('hidden');
  };

  // Password Hashing and Credential Storage
  const hashPassword = (password) => CryptoJS.SHA256(password).toString();

  const saveEmployee = (username, passwordHash) => {
    const employees = JSON.parse(localStorage.getItem('employees')) || {};
    employees[username] = passwordHash;
    localStorage.setItem('employees', JSON.stringify(employees));
  };

  const validateEmployee = (username, password) => {
    const employees = JSON.parse(localStorage.getItem('employees')) || {};
    return employees[username] && employees[username] === hashPassword(password);
  };

  // Registration Form Submission
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('regUsername').value.trim();
      const password = document.getElementById('regPassword').value;

      if (!username || !password) {
        showMessage("Please fill in both username and password.", "danger");
        return;
      }

      const employees = JSON.parse(localStorage.getItem('employees')) || {};
      if (employees[username]) {
        showMessage("Username already exists. Please choose another.", "warning");
        return;
      }

      saveEmployee(username, hashPassword(password));
      showMessage("Registration successful! You can now log in.", "success");
      
      // Switch to login form and reset registration form
      toggleForms(true);
      registerForm.reset();
    });
  }

  // Login Form Submission with Emoji feedback
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!username || !password) {
        showMessage("Please fill in both username and password.", "danger");
        return;
      }

      if (validateEmployee(username, password)) {
        showMessage("Login successful!", "success");
        // Redirect after a brief delay (update URL as needed)
        setTimeout(() => {
          window.location.href = "attendance.html";
        }, 1000);
      } else {
        showMessage("Invalid credentials. Please try again.", "danger");
      }
    });
  }
});
