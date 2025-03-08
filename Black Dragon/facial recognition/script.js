// Global array to store registered face descriptors in memory.
let labeledDescriptorsArray = [];

// Global attendance log array.
let attendanceLog = [];

// Global object to manage check-in/check-out state for each recognized person.
// It holds the last seen timestamp for each person.
let attendanceState = {};

// Threshold (in milliseconds) after which a person is considered to have left (checked out).
const CHECKOUT_THRESHOLD = 5000; // 5 seconds

// Function to load registered face data from localStorage.
function loadRegisteredFaces() {
  const storedData = localStorage.getItem('registeredFaces');
  if (storedData) {
    try {
      const parsed = JSON.parse(storedData); // Array of { label, descriptor: [numbers] }
      labeledDescriptorsArray = parsed.map(item => ({
        label: item.label,
        descriptor: new Float32Array(item.descriptor)
      }));
      console.log('Loaded registered faces from localStorage:', labeledDescriptorsArray);
    } catch (error) {
      console.error('Error parsing stored face data:', error);
    }
  }
}

// Function to save registered face data to localStorage.
function saveRegisteredFaces() {
  // Convert each descriptor (Float32Array) into a plain array so it can be JSON stringified.
  const dataToStore = labeledDescriptorsArray.map(item => ({
    label: item.label,
    descriptor: Array.from(item.descriptor)
  }));
  localStorage.setItem('registeredFaces', JSON.stringify(dataToStore));
  console.log('Registered faces saved to localStorage.');
}

// Load registered faces on page load.
loadRegisteredFaces();

// Function to load models and start the video stream.
async function loadModelsAndStartVideo() {
  const statusElement = document.getElementById('status');
  const video = document.getElementById('video');
  const container = document.getElementById('videoContainer');

  try {
    // Load face-api.js models from the local 'models' folder.
    await faceapi.nets.tinyFaceDetector.loadFromUri('./models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('./models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('./models');

    statusElement.textContent = 'Models loaded. Starting video...';

    // Start the webcam stream.
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    video.srcObject = stream;

    // When the video starts playing, set up detection and recognition.
    video.addEventListener('play', () => {
      // Create a canvas overlay to display detection results.
      const canvas = faceapi.createCanvasFromMedia(video);
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      container.appendChild(canvas);

      // Set display size based on video dimensions.
      const displaySize = { width: video.width, height: video.height };
      faceapi.matchDimensions(canvas, displaySize);

      // Set up a periodic detection loop (every 1 second).
      setInterval(async () => {
        // Detect faces with landmarks and compute descriptors.
        const detections = await faceapi.detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions()
        )
          .withFaceLandmarks()
          .withFaceDescriptors();

        // Resize detections to match the display size.
        const resizedDetections = faceapi.resizeResults(detections, displaySize);

        // Clear the canvas before drawing new detections.
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // If there are registered faces, perform recognition.
        if (labeledDescriptorsArray.length > 0) {
          const labeledFaceDescriptors = labeledDescriptorsArray.map(item => {
            return new faceapi.LabeledFaceDescriptors(item.label, [item.descriptor]);
          });
          const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);

          resizedDetections.forEach(detection => {
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { label: bestMatch.toString() });
            drawBox.draw(canvas);

            // Check In:
            // If the recognized face (not "unknown") is not already logged as present,
            // log a "Check In" and record the current timestamp.
            if (bestMatch.label !== "unknown") {
              const currentTime = Date.now();
              if (!attendanceState[bestMatch.label]) {
                addAttendanceRecord(bestMatch.label, "Check In");
                attendanceState[bestMatch.label] = currentTime;
              } else {
                // Update the last seen time if the face is already checked in.
                attendanceState[bestMatch.label] = currentTime;
              }
            }
          });
        } else {
          // If no registered faces, simply draw the detection boxes.
          faceapi.draw.drawDetections(canvas, resizedDetections);
        }

        // Check for persons who haven't been seen recently to log Check Out.
        const currentTime = Date.now();
        for (const name in attendanceState) {
          if (attendanceState.hasOwnProperty(name)) {
            if (currentTime - attendanceState[name] > CHECKOUT_THRESHOLD) {
              addAttendanceRecord(name, "Check Out");
              delete attendanceState[name];
            }
          }
        }
      }, 1000); // Run the loop every 1 second.
    });
  } catch (error) {
    console.error('Error loading models or accessing webcam:', error);
    statusElement.textContent = 'Error loading models or accessing webcam.';
  }
}

// Start the models and video stream when the window loads.
window.onload = loadModelsAndStartVideo;

// Registration logic: When "Register Face" is clicked, capture a face descriptor and store it.
document.getElementById('registerBtn').addEventListener('click', async () => {
  const userName = document.getElementById('userName').value.trim();
  if (!userName) {
    alert("Please enter a name.");
    return;
  }
  const video = document.getElementById('video');

  // Capture a single face detection with landmarks and descriptor.
  const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
                                   .withFaceLandmarks()
                                   .withFaceDescriptor();
  if (!detection) {
    alert("No face detected. Please try again.");
    return;
  }

  // Save the user's label and descriptor in the global array.
  labeledDescriptorsArray.push({ label: userName, descriptor: detection.descriptor });
  // Save the updated face data to localStorage.
  saveRegisteredFaces();

  alert("Face registered for " + userName);
  // Clear the input field.
  document.getElementById('userName').value = '';
});

// Function to add an attendance record (Check In or Check Out) to the log.
function addAttendanceRecord(name, eventType) {
  const now = new Date();
  const date = now.toLocaleDateString();
  const time = now.toLocaleTimeString();

  // Create a record and add it to the attendance log array.
  const record = { name, date, time, event: eventType };
  attendanceLog.push(record);

  // Append the record to the attendance log table in the DOM.
  const tbody = document.querySelector('#logTable tbody');
  const row = document.createElement('tr');
  row.innerHTML = `<td>${name}</td><td>${date}</td><td>${time}</td><td>${eventType}</td>`;
  tbody.appendChild(row);
}
