document.addEventListener("DOMContentLoaded", () => {
  // Ensure a current user is set. In a real application, set this at login.
  if (!localStorage.getItem("currentUser")) {
    localStorage.setItem("currentUser", "user1");
  }

  // Check secure context (HTTPS, localhost, or 127.0.0.1)
  const isSecure =
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
  if (!isSecure) {
    alert("Geolocation requires a secure context. Please run this page on HTTPS or localhost.");
  }

  // ------------------- Configuration & Global Variables -------------------
  const offices = [
    { name: "Main Office", latitude: 26.836547, longitude: 75.649388 }
  ];
  const allowedRadius = 200; // in meters
  const CHECKOUT_THRESHOLD = 5000; // in ms for auto check-out
  const secretKey = "mySecretKey"; // For encryption storage
  const MAX_RETRIES = 3; // Maximum retries for geolocation fetch

  let isCheckedIn = false;
  let checkInTime = null;
  let currentOffice = null;
  let attendanceLog = [];
  let retryCount = 0;
  let cachedManualPosition = null;

  // ------------------- DOM Elements -------------------
  const statusEl = document.getElementById("status");
  const logTableBody = document.querySelector("#logTable tbody");
  const manualCheckInBtn = document.getElementById("manualCheckInBtn");
  const manualCheckOutBtn = document.getElementById("manualCheckOutBtn");
  const officeSelect = document.getElementById("officeSelect");
  const confirmManualBtn = document.getElementById("confirmManualBtn");

  // ------------------- Leaflet Map Variables -------------------
  let map, officeCircle, currentAccuracyCircle;

  // ------------------- Attendance Logging with Encrypted Storage -------------------
  function updateLogTable() {
    if (!logTableBody) return;
    logTableBody.innerHTML = "";
    attendanceLog.forEach(record => {
      const duration = record.workDuration ? record.workDuration.toFixed(2) : "-";
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${record.office}</td>
        <td>${record.event}</td>
        <td>${record.date}</td>
        <td>${record.time}</td>
        <td>${duration}</td>
      `;
      logTableBody.appendChild(row);
    });
  }

  function saveAttendanceLog() {
    const data = JSON.stringify(attendanceLog);
    const ciphertext = CryptoJS.AES.encrypt(data, secretKey).toString();
    localStorage.setItem("attendanceLog", ciphertext);
  }

  function loadAttendanceLog() {
    const ciphertext = localStorage.getItem("attendanceLog");
    if (ciphertext) {
      try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, secretKey);
        const data = bytes.toString(CryptoJS.enc.Utf8);
        const storedLog = JSON.parse(data);
        const currentUser = localStorage.getItem("currentUser") || "unknown";
        // Filter logs so only the current user's records are loaded
        attendanceLog = storedLog.filter(record => record.username === currentUser);
        updateLogTable();
      } catch (e) {
        console.error("Error decrypting attendance log:", e);
      }
    }
  }

  function addAttendanceRecord(officeName, event) {
    const now = new Date();
    const currentUser = localStorage.getItem("currentUser") || "unknown";
    const record = {
      username: currentUser,
      office: officeName,
      event: event,
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      workDuration: null
    };

    if (event === "Check Out" && checkInTime !== null) {
      record.workDuration = (now.getTime() - checkInTime) / 60000; // in minutes
      checkInTime = null;
    }
    attendanceLog.push(record);
    updateLogTable();
    saveAttendanceLog();
  }

  loadAttendanceLog();

  // ------------------- Geolocation and Map Logic -------------------
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) *
              Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function logCheckIn(office) {
    isCheckedIn = true;
    checkInTime = Date.now();
    addAttendanceRecord(office.name, "Check In");
    console.log("Checked in at:", office.name);
  }

  function logCheckOut() {
    if (currentOffice) {
      addAttendanceRecord(currentOffice.name, "Check Out");
      console.log("Checked out from:", currentOffice.name);
    }
    isCheckedIn = false;
    currentOffice = null;
    checkInTime = null;
  }

  // ------------------- Map Functions using Leaflet -------------------
  function initMap() {
    // Center map on the Main Office initially
    const { latitude: officeLat, longitude: officeLon } = offices[0];
    map = L.map("map").setView([officeLat, officeLon], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    // Main Office marker (green)
    L.marker([officeLat, officeLon], {
      icon: L.icon({
        iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      })
    }).addTo(map).bindPopup("Main Office");

    // Allowed radius circle (green)
    officeCircle = L.circle([officeLat, officeLon], {
      color: "green",
      fillColor: "#0f0",
      fillOpacity: 0.2,
      radius: allowedRadius
    }).addTo(map);

    // Blue circle for current location (accuracy indicator)
    currentAccuracyCircle = L.circle([officeLat, officeLon], {
      color: "blue",
      fillColor: "#03f",
      fillOpacity: 0.15,
      radius: 0 // Will update with actual accuracy
    }).addTo(map);
  }

  function updateUserLocation(lat, lon, accuracy) {
    if (map && currentAccuracyCircle) {
      map.setView([lat, lon], 16);
      currentAccuracyCircle.setLatLng([lat, lon]);
      currentAccuracyCircle.setRadius(accuracy);
      console.log(`Location updated: ${lat}, ${lon} with accuracy ${accuracy}m`);
    }
  }

  // ------------------- Location Fetching -------------------
  function processPosition(position) {
    retryCount = 0; // Reset retry count on success
    const { latitude: lat, longitude: lon, accuracy } = position.coords;
    console.log(`Position fetched: lat=${lat}, lon=${lon}, accuracy=${accuracy}m`);

    const { latitude: offLat, longitude: offLon } = offices[0];
    const distance = getDistance(lat, lon, offLat, offLon);
    statusEl.textContent = `Nearest Office: Main Office, Distance: ${Math.round(distance)}m, Accuracy: ±${Math.round(accuracy)}m`;

    // Update current location indicator on the map
    updateUserLocation(lat, lon, accuracy);

    const currentTime = Date.now();
    if (distance <= allowedRadius) {
      if (!isCheckedIn) {
        currentOffice = offices[0];
        logCheckIn(offices[0]);
      } else {
        // Keep session active
        checkInTime = currentTime;
      }
    } else {
      if (isCheckedIn && (currentTime - checkInTime > CHECKOUT_THRESHOLD)) {
        logCheckOut();
      }
    }
  }

  function handleGeolocationError(error) {
    statusEl.textContent = "Error obtaining location: " + error.message;
    console.error("Geolocation error:", error);

    if (error.code === error.TIMEOUT && retryCount < MAX_RETRIES) {
      retryCount++;
      console.warn(`Timeout. Retrying in 3s... (Retry ${retryCount} of ${MAX_RETRIES})`);
      setTimeout(() => {
        navigator.geolocation.getCurrentPosition(processPosition, handleGeolocationError, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000
        });
      }, 3000);
    } else if (error.code === error.TIMEOUT && retryCount >= MAX_RETRIES) {
      alert("Unable to obtain a precise location after multiple attempts. Please move to an open area and try again.");
      retryCount = 0;
    }
  }

  // ------------------- Manual Check-In/Out Logic -------------------
  function getFreshPosition(retries) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve(pos),
        error => {
          if (error.code === error.TIMEOUT && retries > 0) {
            console.warn(`Timeout expired, retrying in 1 second... (${retries} retries left)`);
            setTimeout(() => {
              getFreshPosition(retries - 1).then(resolve).catch(reject);
            }, 1000);
          } else {
            reject(error);
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
      );
    });
  }

  if (manualCheckInBtn) {
    manualCheckInBtn.addEventListener("click", () => {
      if (cachedManualPosition) {
        console.log("Using cached manual position.");
        displayManualModal(cachedManualPosition);
      } else {
        console.log("Requesting fresh location for manual check-in...");
        getFreshPosition(MAX_RETRIES)
          .then(position => {
            cachedManualPosition = position;
            console.log(`Manual Check-In fetched position: lat=${position.coords.latitude}, lon=${position.coords.longitude}`);
            displayManualModal(position);
          })
          .catch(error => {
            console.error("Manual Check-In Error:", error);
            alert("Unable to fetch a fresh location after multiple attempts. Error: " + error.message);
          });
      }
    });
  }

  function displayManualModal(position) {
    const { latitude: currentLat, longitude: currentLon } = position.coords;
    const officeDistances = offices.map(office => ({
      office,
      distance: getDistance(currentLat, currentLon, office.latitude, office.longitude)
    }));
    officeDistances.sort((a, b) => a.distance - b.distance);
    officeSelect.innerHTML = "";
    officeDistances.forEach(item => {
      const option = document.createElement("option");
      option.value = item.office.name;
      option.textContent = `${item.office.name} - ${Math.round(item.distance)}m away`;
      officeSelect.appendChild(option);
    });
    const manualModal = new bootstrap.Modal(document.getElementById("manualModal"));
    manualModal.show();
  }

  if (confirmManualBtn) {
    confirmManualBtn.addEventListener("click", () => {
      const selectedOfficeName = officeSelect.value;
      const office = offices.find(o => o.name === selectedOfficeName);
      if (office) {
        if (isCheckedIn) {
          logCheckOut();
        }
        currentOffice = office;
        logCheckIn(office);
      }
    });
  }

  if (manualCheckOutBtn) {
    manualCheckOutBtn.addEventListener("click", () => {
      if (isCheckedIn) {
        logCheckOut();
      } else {
        alert("You are not currently checked in.");
      }
    });
  }

  // ------------------- Start Attendance Monitoring -------------------
  // Using watchPosition for continuous location updates
  function startAttendanceMonitoring() {
    initMap();
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        processPosition,
        handleGeolocationError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    } else {
      statusEl.textContent = "Geolocation is not supported by your browser.";
    }
  }

  if (document.getElementById("map")) {
    startAttendanceMonitoring();
  }
});
