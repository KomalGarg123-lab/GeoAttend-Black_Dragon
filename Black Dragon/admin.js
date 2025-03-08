document.addEventListener("DOMContentLoaded", function() {
  // Dummy admin credentials for demonstration
  const validAdminUsername = "admin";
  const validAdminPassword = "adminpass";

  // DOM Elements for Admin Page
  const loginSection = document.getElementById("loginSection");
  const dashboardSection = document.getElementById("dashboardSection");
  const adminLoginForm = document.getElementById("adminLoginForm");
  const refreshBtn = document.getElementById("refreshBtn");
  const adminLogTableBody = document.querySelector("#adminLogTable tbody");

  // Secret key for decryption (must match the employee side)
  const secretKey = "mySecretKey";

  // Function to load attendance log from localStorage and update the table
  function loadAttendanceLog() {
    const ciphertext = localStorage.getItem("attendanceLog");
    let attendanceLog = [];
    if (ciphertext) {
      try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, secretKey);
        const data = bytes.toString(CryptoJS.enc.Utf8);
        attendanceLog = JSON.parse(data);
      } catch (e) {
        console.error("Error decrypting attendance log:", e);
      }
    }
    updateAdminLogTable(attendanceLog);
  }

  // Update the admin log table with attendance records
  // (This version directly shows record.username without a fallback value.)
  function updateAdminLogTable(attendanceLog) {
    adminLogTableBody.innerHTML = "";
    attendanceLog.forEach(record => {
      const duration = record.workDuration ? record.workDuration.toFixed(2) : "-";
      const row = document.createElement("tr");
      row.innerHTML = `<td>${record.username}</td>
                       <td>${record.office}</td>
                       <td>${record.event}</td>
                       <td>${record.date}</td>
                       <td>${record.time}</td>
                       <td>${duration}</td>`;
      adminLogTableBody.appendChild(row);
    });
  }

  // Handle admin login form submission
  adminLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("adminUsername").value.trim();
    const password = document.getElementById("adminPassword").value.trim();
    
    if (username === validAdminUsername && password === validAdminPassword) {
      // Successful login: hide login section, show dashboard, and load data
      loginSection.style.display = "none";
      dashboardSection.style.display = "block";
      loadAttendanceLog();
    } else {
      alert("Invalid credentials. Please try again.");
    }
  });

  // Refresh button to manually reload attendance log data
  refreshBtn.addEventListener("click", loadAttendanceLog);

  // Listen for changes to localStorage (in case data is updated elsewhere)
  window.addEventListener("storage", (event) => {
    if (event.key === "attendanceLog") {
      loadAttendanceLog();
    }
  });

  // Optionally, poll every 5 seconds as a fallback
  setInterval(loadAttendanceLog, 5000);
});
