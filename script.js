/* =========================================================
   SMART HOME AUTOMATION V2 - FINAL FAST SYNC SCRIPT
   ---------------------------------------------------------
   Keeps existing website features:
   - Firebase Realtime Database
   - Website control
   - Device live status
   - DHT11 / online weather fallback
   - Statistics and activity history
   - Login / signup / email verification
   - Forgot password
   - Face/camera demo login
   ---------------------------------------------------------
   Main fix:
   - Uses commandId + server timestamp for clean sync
   - Avoids repeated glitch/confusion between website, ESP32,
     RainMaker/Google Home, and manual switches
========================================================= */


/* =========================================================
   FIREBASE CONFIGURATION
========================================================= */

const firebaseConfig = {
    apiKey: "AIzaSyDOWMHv22hZjSDP1EwVGuJM8Oj5NIzAIpo",
    authDomain: "esp-32-home-automation-f158c.firebaseapp.com",
    databaseURL: "https://esp-32-home-automation-f158c-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "esp-32-home-automation-f158c",
    storageBucket: "esp-32-home-automation-f158c.firebasestorage.app",
    messagingSenderId: "1029711889803",
    appId: "1:1029711889803:web:69d4dd39dcde60ebb71b8e"
};

firebase.initializeApp(firebaseConfig);

const database = firebase.database();
const auth = firebase.auth();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

const rootRef = database.ref("SmartHome");
const deviceRef = rootRef.child("devices");
const systemRef = rootRef.child("system");
const environmentRef = rootRef.child("environment");
const historyRef = rootRef.child("history");


/* =========================================================
   DEVICE ELEMENT MAPPING
========================================================= */

const devices = {
    fan: {
        name: "Fan",
        card: "fanCard",
        sw: "fanSwitch",
        state: "fanState",
        source: "fanSource",
        time: "fanTime",
        runtime: "fanRuntime",
        count: "fanCount",
        switchCount: "fanSwitchCount",
        webCount: "fanWebCount",
        progress: "fanProgress"
    },

    light1: {
        name: "Light 1",
        card: "light1Card",
        sw: "light1Switch",
        state: "light1State",
        source: "light1Source",
        time: "light1Time",
        runtime: "light1Runtime",
        count: "light1Count",
        switchCount: "light1SwitchCount",
        webCount: "light1WebCount",
        progress: "light1Progress"
    },

    socket: {
        name: "Socket",
        card: "socketCard",
        sw: "socketSwitch",
        state: "socketState",
        source: "socketSource",
        time: "socketTime",
        runtime: "socketRuntime",
        count: "socketCount",
        switchCount: "socketSwitchCount",
        webCount: "socketWebCount",
        progress: "socketProgress"
    },

    light2: {
        name: "Light 2",
        card: "light2Card",
        sw: "light2Switch",
        state: "light2State",
        source: "light2Source",
        time: "light2Time",
        runtime: "light2Runtime",
        count: "light2Count",
        switchCount: "light2SwitchCount",
        webCount: "light2WebCount",
        progress: "light2Progress"
    }
};


/* =========================================================
   LOCAL STATE
========================================================= */

let localState = {
    fan: false,
    light1: false,
    socket: false,
    light2: false
};

let runtime = {
    fan: 0,
    light1: 0,
    socket: 0,
    light2: 0
};

let onCount = {
    fan: 0,
    light1: 0,
    socket: 0,
    light2: 0
};

let sourceCount = {
    fan: { web: 0, switch: 0 },
    light1: { web: 0, switch: 0 },
    socket: { web: 0, switch: 0 },
    light2: { web: 0, switch: 0 }
};

let totalOperations = 0;

let previousState = {};

let latestSensorData = null;

let pendingCommands = {};

let lastSeenTimestamp = {};

let switchLock = {};


/* =========================================================
   HELPERS
========================================================= */

function $(id) {
    return document.getElementById(id);
}

function nowTime() {
    return new Date().toLocaleTimeString("en-IN");
}

function formatRuntime(seconds) {
    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return minutes + " Min";
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return hours + "h " + remainingMinutes + "m";
}

function formatSource(source) {
    if (source === "google") {
        return "Google Home";
    }

    if (source === "switch") {
        return "Manual Switch";
    }

    if (source === "web") {
        return "Website";
    }

    return source || "Website";
}

function generateCommandId(key) {
    return "web-" + key + "-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}


/* =========================================================
   CLOCK
========================================================= */

function updateClock() {
    const now = new Date();

    if ($("date")) {
        $("date").innerHTML = now.toLocaleDateString("en-IN", {
            weekday: "long",
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    if ($("time")) {
        $("time").innerHTML = now.toLocaleTimeString("en-IN");
    }

    if ($("lastUpdate")) {
        $("lastUpdate").innerHTML = now.toLocaleTimeString("en-IN");
    }

    if ($("lastUpdateTime")) {
        $("lastUpdateTime").innerHTML = now.toLocaleTimeString("en-IN");
    }
}

setInterval(updateClock, 1000);
updateClock();


/* =========================================================
   STATUS / NOTIFICATIONS / HISTORY
========================================================= */

function setStatusText(id, text, className) {
    const element = $(id);

    if (!element) {
        return;
    }

    element.innerHTML = text;
    element.className = className || "";
}

function addNotification(text) {
    if ($("notificationText")) {
        $("notificationText").innerHTML = text;
    }
}

function addEventLog(title, subtitle) {
    const eventLog = $("eventLog");

    if (!eventLog) {
        return;
    }

    const item = document.createElement("article");

    item.className = "history-item";

    item.innerHTML = `
        <div class="history-icon">
            <i class="fa-solid fa-bolt"></i>
        </div>

        <div>
            <h4>${title}</h4>
            <p>${subtitle}</p>
        </div>

        <span>${nowTime()}</span>
    `;

    eventLog.prepend(item);

    while (eventLog.children.length > 6) {
        eventLog.removeChild(eventLog.lastChild);
    }
}


/* =========================================================
   SUMMARY
========================================================= */

function updateSummary() {
    let running = 0;
    let totalRuntime = 0;

    Object.keys(devices).forEach((key) => {
        const device = devices[key];

        if (localState[key]) {
            running++;
        }

        totalRuntime += runtime[key];

        if ($(device.runtime)) {
            $(device.runtime).innerHTML = formatRuntime(runtime[key]);
        }

        if ($(device.count)) {
            $(device.count).innerHTML = onCount[key];
        }

        if ($(device.switchCount)) {
            $(device.switchCount).innerHTML = sourceCount[key].switch;
        }

        if ($(device.webCount)) {
            $(device.webCount).innerHTML = sourceCount[key].web;
        }

        if ($(device.progress)) {
            const percent = Math.min(100, Math.floor((runtime[key] / 3600) * 100));
            $(device.progress).style.width = percent + "%";
        }
    });

    if ($("runningCount")) {
        $("runningCount").innerHTML = running;
    }

    if ($("operationCount")) {
        $("operationCount").innerHTML = totalOperations;
    }

    if ($("totalOperations")) {
        $("totalOperations").innerHTML = totalOperations;
    }

    if ($("todayRuntime")) {
        $("todayRuntime").innerHTML = formatRuntime(totalRuntime);
    }
}


/* =========================================================
   DEVICE UI
========================================================= */

function setPendingVisual(key, active) {
    const device = devices[key];

    if (!device) {
        return;
    }

    const card = $(device.card);

    if (!card) {
        return;
    }

    if (active) {
        card.classList.add("sync-pending");
    } else {
        card.classList.remove("sync-pending");
    }
}

function updateDeviceUI(key, data, options = {}) {
    const device = devices[key];

    if (!device) {
        return;
    }

    const state = data && data.state === true;
    const source = data && data.source ? data.source : "web";
    const lastUpdated = Number(data && data.lastUpdated ? data.lastUpdated : Date.now());
    const commandId = data && data.commandId ? data.commandId : "";

    if (lastSeenTimestamp[key] && lastUpdated < lastSeenTimestamp[key]) {
        return;
    }

    lastSeenTimestamp[key] = lastUpdated;

    localState[key] = state;

    if ($(device.sw)) {
        $(device.sw).checked = state;
    }

    if ($(device.state)) {
        $(device.state).innerHTML = state ? "ON" : "OFF";
    }

    if ($(device.source)) {
        $(device.source).innerHTML = "Last: " + formatSource(source);
    }

    if ($(device.time)) {
        $(device.time).innerHTML = new Date(lastUpdated).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    const card = $(device.card);

    if (card) {
        if (state) {
            card.classList.add("active");
        } else {
            card.classList.remove("active");
        }
    }

    if (pendingCommands[key]) {
        if (pendingCommands[key].state === state || pendingCommands[key].commandId === commandId) {
            delete pendingCommands[key];
            setPendingVisual(key, false);
        }
    }

    if (!options.silent && previousState[key] !== undefined && previousState[key] !== state) {
        totalOperations++;

        if (state) {
            onCount[key]++;
        }

        if (source === "switch") {
            sourceCount[key].switch++;
        } else {
            sourceCount[key].web++;
        }

        addEventLog(
            device.name + " " + (state ? "ON" : "OFF"),
            "Changed by " + formatSource(source)
        );

        addNotification(
            device.name + " turned " + (state ? "ON" : "OFF") + " by " + formatSource(source)
        );

        historyRef.push({
            device: device.name,
            state: state,
            source: source,
            sourceLabel: formatSource(source),
            commandId: commandId,
            time: firebase.database.ServerValue.TIMESTAMP
        });
    }

    previousState[key] = state;

    updateSummary();
}


/* =========================================================
   WEBSITE TO FIREBASE COMMAND
========================================================= */

function setDevice(key, state) {
    const device = devices[key];

    if (!device) {
        return;
    }

    const now = Date.now();
    const commandId = generateCommandId(key);

    if (switchLock[key] && now - switchLock[key] < 250) {
        if ($(device.sw)) {
            $(device.sw).checked = localState[key];
        }

        return;
    }

    switchLock[key] = now;

    pendingCommands[key] = {
        state: state,
        commandId: commandId,
        time: now
    };

    setPendingVisual(key, true);

    updateDeviceUI(key, {
        state: state,
        source: "web",
        commandId: commandId,
        lastUpdated: now
    }, {
        silent: true
    });

    deviceRef.child(key).update({
        state: state,
        source: "web",
        commandId: commandId,
        lastUpdated: firebase.database.ServerValue.TIMESTAMP
    }).catch((error) => {
        console.error("Firebase write error:", error);

        addNotification("Firebase write failed. Check internet.");

        delete pendingCommands[key];

        setPendingVisual(key, false);
    });

    setTimeout(() => {
        if (pendingCommands[key] && pendingCommands[key].commandId === commandId) {
            delete pendingCommands[key];

            setPendingVisual(key, false);
        }
    }, 3500);
}


/* =========================================================
   DEVICE LISTENERS
========================================================= */

Object.keys(devices).forEach((key) => {
    const device = devices[key];

    if ($(device.sw)) {
        $(device.sw).addEventListener("change", function () {
            setDevice(key, this.checked);
        });
    }

    deviceRef.child(key).on("value", (snapshot) => {
        const data = snapshot.val();

        if (data) {
            updateDeviceUI(key, data);
        }
    });
});


/* =========================================================
   RUNTIME COUNTER
========================================================= */

setInterval(() => {
    Object.keys(localState).forEach((key) => {
        if (localState[key]) {
            runtime[key]++;
        }
    });

    updateSummary();
}, 1000);


/* =========================================================
   CONNECTION STATUS
========================================================= */

database.ref(".info/connected").on("value", (snapshot) => {
    if (snapshot.val() === true) {
        setStatusText("firebaseStatus", "Connected", "connected");
    } else {
        setStatusText("firebaseStatus", "Disconnected", "disconnected");
    }
});

function updateBrowserNetwork() {
    if (navigator.onLine) {
        setStatusText("wifiStatus", "Online", "online");
    } else {
        setStatusText("wifiStatus", "Offline", "offline");
    }
}

window.addEventListener("online", updateBrowserNetwork);
window.addEventListener("offline", updateBrowserNetwork);
updateBrowserNetwork();

systemRef.child("lastSeen").on("value", (snapshot) => {
    const lastSeen = Number(snapshot.val() || 0);
    const difference = Date.now() - lastSeen;

    if (lastSeen > 0 && difference < 25000) {
        setStatusText("espStatus", "Online", "online");
    } else {
        setStatusText("espStatus", "Offline", "offline");
    }
});

setInterval(() => {
    systemRef.update({
        websiteLastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}, 10000);


/* =========================================================
   WEATHER / DHT11
========================================================= */

const KONGALNAGARAM = {
    latitude: 10.6759,
    longitude: 77.1909
};

function getWeatherMood(temp) {
    if (isNaN(temp)) {
        return "Checking...";
    }

    if (temp < 20) {
        return "🥶 Cold";
    }

    if (temp < 30) {
        return "😊 Normal";
    }

    if (temp < 35) {
        return "🌤 Warm";
    }

    return "🔥 Hot";
}

function updateEnvironmentUI(data, source) {
    const temp = Number(data.temperature);
    const hum = Number(data.humidity);
    const feels = Number(data.heatIndex);

    if ($("temperatureValue")) {
        $("temperatureValue").innerHTML = isNaN(temp) ? "-- °C" : temp.toFixed(1) + " °C";
    }

    if ($("humidityValue")) {
        $("humidityValue").innerHTML = isNaN(hum) ? "-- %" : Math.round(hum) + " %";
    }

    if ($("heatIndexValue")) {
        $("heatIndexValue").innerHTML = isNaN(feels) ? "-- °C" : feels.toFixed(1) + " °C";
    }

    if ($("topTemperatureValue")) {
        $("topTemperatureValue").innerHTML = isNaN(temp) ? "-- °C" : temp.toFixed(1) + " °C";
    }

    if ($("temperatureStatus")) {
        $("temperatureStatus").innerHTML = source === "sensor" ? "From DHT11 sensor" : "From online weather";
    }

    if ($("humidityStatus")) {
        $("humidityStatus").innerHTML = source === "sensor" ? "From DHT11 sensor" : "From online weather";
    }

    if ($("heatIndexStatus")) {
        $("heatIndexStatus").innerHTML = source === "sensor" ? "DHT11 calculated value" : "Online feels-like value";
    }

    if ($("sensorStatus")) {
        $("sensorStatus").innerHTML = source === "sensor" ? "DHT11 Online" : "Online Weather";
        $("sensorStatus").className = source === "sensor" ? "sensor-online" : "sensor-warning";
    }

    if ($("sensorLastUpdated")) {
        $("sensorLastUpdated").innerHTML = "Last updated: " + nowTime();
    }

    const displayTemp = isNaN(feels) ? temp : feels;

    if ($("weatherMood")) {
        $("weatherMood").innerHTML = getWeatherMood(displayTemp);
    }

    if ($("weatherMiniData")) {
        const tempText = isNaN(temp) ? "-- °C" : temp.toFixed(1) + " °C";
        const humText = isNaN(hum) ? "-- %" : Math.round(hum) + " %";
        $("weatherMiniData").innerHTML = tempText + " | " + humText;
    }
}

function isFreshDHT(data) {
    if (!data) {
        return false;
    }

    if (data.temperature === undefined || data.humidity === undefined) {
        return false;
    }

    const lastUpdated = Number(data.lastUpdated || 0);

    if (lastUpdated === 0) {
        return false;
    }

    return Date.now() - lastUpdated < 120000;
}

async function loadOnlineWeather() {
    try {
        const url =
            "https://api.open-meteo.com/v1/forecast" +
            "?latitude=" + KONGALNAGARAM.latitude +
            "&longitude=" + KONGALNAGARAM.longitude +
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature" +
            "&timezone=auto";

        const response = await fetch(url);
        const weather = await response.json();
        const current = weather.current;

        updateEnvironmentUI({
            temperature: current.temperature_2m,
            humidity: current.relative_humidity_2m,
            heatIndex: current.apparent_temperature,
            lastUpdated: Date.now()
        }, "online");

    } catch (error) {
        console.log("Weather API Error:", error);

        if ($("sensorStatus")) {
            $("sensorStatus").innerHTML = "No Data";
            $("sensorStatus").className = "sensor-offline";
        }

        if ($("sensorLastUpdated")) {
            $("sensorLastUpdated").innerHTML = "DHT11 and online weather unavailable";
        }
    }
}

environmentRef.on("value", (snapshot) => {
    const data = snapshot.val();

    latestSensorData = data;

    if (isFreshDHT(data)) {
        updateEnvironmentUI(data, "sensor");
    } else {
        loadOnlineWeather();
    }
});

setInterval(() => {
    if (isFreshDHT(latestSensorData)) {
        updateEnvironmentUI(latestSensorData, "sensor");
    } else {
        loadOnlineWeather();
    }
}, 60000);


/* =========================================================
   HISTORY TOGGLE
========================================================= */

const historyToggle = $("historyToggle");
const historyPanel = $("historyPanel");
const historyArrow = $("historyArrow");

if (historyToggle && historyPanel) {
    historyToggle.addEventListener("click", () => {
        historyPanel.classList.toggle("open");

        if (historyArrow) {
            historyArrow.classList.toggle("rotate");
        }
    });
}


/* =========================================================
   AUTH ELEMENTS
========================================================= */

const authScreen = $("authScreen");

const loginForm = $("loginForm");
const signupForm = $("signupForm");
const forgotForm = $("forgotForm");
const verifyForm = $("verifyForm");
const faceForm = $("faceForm");

const authMessage = $("authMessage");

const loginEmail = $("loginEmail");
const loginPassword = $("loginPassword");

const signupName = $("signupName");
const signupEmail = $("signupEmail");
const signupPassword = $("signupPassword");

const forgotEmail = $("forgotEmail");

const verifyEmailText = $("verifyEmailText");

const loginBtn = $("loginBtn");
const signupBtn = $("signupBtn");
const forgotBtn = $("forgotBtn");

const checkVerifyBtn = $("checkVerifyBtn");
const resendVerifyBtn = $("resendVerifyBtn");

const logoutBtn = $("logoutBtn");

const showSignup = $("showSignup");
const showLogin = $("showLogin");
const showForgot = $("showForgot");
const backToLogin = $("backToLogin");
const verifyBackLogin = $("verifyBackLogin");

const faceVerifyBtn = $("faceVerifyBtn");
const faceBackLogin = $("faceBackLogin");
const faceVideo = $("faceVideo");
const faceStatus = $("faceStatus");

const localUserName = $("localUserName");
const localUserPassword = $("localUserPassword");
const localLoginBtn = $("localLoginBtn");

const emailActionSettings = {
    url: window.location.origin + window.location.pathname + "?verified=1",
    handleCodeInApp: false
};

const LOCAL_AUTH_SALT = "AK_SMART_HOME_V2";

const LOCAL_USERS = [
    { hash: "8c6d26bdb8fa557dd0828f30481725dc1dbaefae6904c31610e2aab4f13cc910" },
    { hash: "9b8ff5dd5e018e23085d4ecae35b3cd4e822d62e9e90a0b1a44811db442f87d2" },
    { hash: "4113675f36681507bc8aebf411eff445313d05814a69a9edd5a9e3221c040857" }
];

function showAuthMessage(message, type) {
    if (!authMessage) {
        return;
    }

    authMessage.innerHTML = message;
    authMessage.className = "auth-message " + (type || "");
}

function stopFaceCameraStream() {
    if (faceVideo && faceVideo.srcObject) {
        faceVideo.srcObject.getTracks().forEach((track) => {
            track.stop();
        });

        faceVideo.srcObject = null;
    }
}

function hideAllAuthForms() {
    if (loginForm) loginForm.classList.add("hidden");
    if (signupForm) signupForm.classList.add("hidden");
    if (forgotForm) forgotForm.classList.add("hidden");
    if (verifyForm) verifyForm.classList.add("hidden");
    if (faceForm) faceForm.classList.add("hidden");
}

function openLoginForm() {
    hideAllAuthForms();
    stopFaceCameraStream();

    if (loginForm) {
        loginForm.classList.remove("hidden");
    }

    showAuthMessage("", "");
}

function openSignupForm() {
    hideAllAuthForms();
    stopFaceCameraStream();

    if (signupForm) {
        signupForm.classList.remove("hidden");
    }

    showAuthMessage("", "");
}

function openForgotForm() {
    hideAllAuthForms();
    stopFaceCameraStream();

    if (forgotForm) {
        forgotForm.classList.remove("hidden");
    }

    showAuthMessage("", "");
}

function openVerifyForm(email) {
    hideAllAuthForms();
    stopFaceCameraStream();

    if (verifyForm) {
        verifyForm.classList.remove("hidden");
    }

    if (verifyEmailText) {
        verifyEmailText.innerHTML = email || "your email";
    }

    showAuthMessage("Verification email sent. Please verify your email.", "success");
}

function openFaceForm() {
    hideAllAuthForms();

    if (faceForm) {
        faceForm.classList.remove("hidden");
    }

    showAuthMessage("", "");

    startCameraDemo();
}

if (showSignup) showSignup.addEventListener("click", openSignupForm);
if (showLogin) showLogin.addEventListener("click", openLoginForm);
if (showForgot) showForgot.addEventListener("click", openForgotForm);
if (backToLogin) backToLogin.addEventListener("click", openLoginForm);
if (verifyBackLogin) verifyBackLogin.addEventListener("click", openLoginForm);
if (faceVerifyBtn) faceVerifyBtn.addEventListener("click", openFaceForm);
if (faceBackLogin) faceBackLogin.addEventListener("click", openLoginForm);


/* =========================================================
   SIGNUP / SIGNIN / VERIFY
========================================================= */

if (signupBtn) {
    signupBtn.addEventListener("click", () => {
        const name = signupName.value.trim();
        const email = signupEmail.value.trim();
        const password = signupPassword.value.trim();

        if (name === "" || email === "" || password === "") {
            showAuthMessage("Please fill all signup details.", "error");
            return;
        }

        if (password.length < 6) {
            showAuthMessage("Password must be at least 6 characters.", "error");
            return;
        }

        signupBtn.innerHTML = "Creating...";

        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                const user = userCredential.user;

                return user.updateProfile({
                    displayName: name
                }).then(() => {
                    return user.sendEmailVerification(emailActionSettings);
                }).then(() => {
                    return database.ref("SmartHome/users/" + user.uid).set({
                        name: name,
                        email: email,
                        role: "user",
                        createdAt: firebase.database.ServerValue.TIMESTAMP
                    });
                }).then(() => {
                    openVerifyForm(email);
                });
            })
            .catch((error) => {
                showAuthMessage(error.message, "error");
            })
            .finally(() => {
                signupBtn.innerHTML = "Create Account";
            });
    });
}

function checkEmailVerificationNow() {
    const user = auth.currentUser;

    if (!user) {
        openLoginForm();
        showAuthMessage("Verification done. Please sign in once to continue.", "success");
        return;
    }

    user.reload()
        .then(() => {
            if (auth.currentUser && auth.currentUser.emailVerified) {
                if (authScreen) {
                    authScreen.style.display = "none";
                }

                if (logoutBtn) {
                    logoutBtn.style.display = "inline-flex";
                }

                showAuthMessage("", "");
            } else {
                openVerifyForm(auth.currentUser.email);
                showAuthMessage("Email still not verified. Check inbox or spam.", "error");
            }
        });
}

if (checkVerifyBtn) {
    checkVerifyBtn.addEventListener("click", checkEmailVerificationNow);
}

if (resendVerifyBtn) {
    resendVerifyBtn.addEventListener("click", () => {
        const user = auth.currentUser;

        if (!user) {
            openLoginForm();
            showAuthMessage("Please sign in again.", "error");
            return;
        }

        user.sendEmailVerification(emailActionSettings)
            .then(() => {
                showAuthMessage("Verification email sent again. Check inbox or spam.", "success");
            })
            .catch((error) => {
                showAuthMessage(error.message, "error");
            });
    });
}

if (loginBtn) {
    loginBtn.addEventListener("click", () => {
        const email = loginEmail.value.trim();
        const password = loginPassword.value.trim();

        if (email === "" || password === "") {
            showAuthMessage("Please enter email and password.", "error");
            return;
        }

        loginBtn.innerHTML = "Signing in...";

        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                const user = userCredential.user;

                if (user.emailVerified) {
                    if (authScreen) {
                        authScreen.style.display = "none";
                    }

                    if (logoutBtn) {
                        logoutBtn.style.display = "inline-flex";
                    }

                    showAuthMessage("", "");
                } else {
                    user.sendEmailVerification(emailActionSettings);
                    openVerifyForm(user.email);
                }
            })
            .catch((error) => {
                showAuthMessage(error.message, "error");
            })
            .finally(() => {
                loginBtn.innerHTML = "Sign In";
            });
    });
}

if (forgotBtn) {
    forgotBtn.addEventListener("click", () => {
        const email = forgotEmail.value.trim();

        if (email === "") {
            showAuthMessage("Please enter your email.", "error");
            return;
        }

        forgotBtn.innerHTML = "Sending...";

        auth.sendPasswordResetEmail(email, emailActionSettings)
            .then(() => {
                showAuthMessage("Password reset email sent. Check inbox or spam.", "success");
                forgotEmail.value = "";
                openLoginForm();
            })
            .catch((error) => {
                showAuthMessage(error.message, "error");
            })
            .finally(() => {
                forgotBtn.innerHTML = "Send Reset Email";
            });
    });
}


/* =========================================================
   CAMERA DEMO / LOCAL HASHED LOGIN
========================================================= */

function startCameraDemo() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (faceStatus) {
            faceStatus.innerHTML = "Camera not supported. Use username and password.";
        }

        return;
    }

    navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
    })
    .then((stream) => {
        if (faceVideo) {
            faceVideo.srcObject = stream;
        }

        if (faceStatus) {
            faceStatus.innerHTML = "Camera opened. Real mobile Face ID can be added later using passkeys.";
        }
    })
    .catch(() => {
        if (faceStatus) {
            faceStatus.innerHTML = "Camera permission denied. Use username and password.";
        }
    });
}

async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    return hashArray
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

if (localLoginBtn) {
    localLoginBtn.addEventListener("click", async () => {
        const username = localUserName.value.trim().toLowerCase();
        const password = localUserPassword.value.trim().toLowerCase();

        if (username === "" || password === "") {
            showAuthMessage("Enter username and password.", "error");
            return;
        }

        const loginHash = await sha256(username + ":" + password + ":" + LOCAL_AUTH_SALT);

        const allowed = LOCAL_USERS.some((user) => user.hash === loginHash);

        if (allowed) {
            sessionStorage.setItem("localDemoAuth", "true");

            stopFaceCameraStream();

            if (authScreen) {
                authScreen.style.display = "none";
            }

            if (logoutBtn) {
                logoutBtn.style.display = "inline-flex";
            }

            addNotification("Local demo login successful.");
        } else {
            showAuthMessage("Invalid local username or password.", "error");
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        sessionStorage.removeItem("localDemoAuth");
        stopFaceCameraStream();
        auth.signOut();
    });
}

auth.onAuthStateChanged((user) => {
    if (!authScreen) {
        return;
    }

    if (sessionStorage.getItem("localDemoAuth") === "true") {
        authScreen.style.display = "none";

        if (logoutBtn) {
            logoutBtn.style.display = "inline-flex";
        }

        return;
    }

    if (!user) {
        authScreen.style.display = "flex";

        if (logoutBtn) {
            logoutBtn.style.display = "none";
        }

        openLoginForm();
        return;
    }

    user.reload()
        .then(() => {
            const refreshedUser = auth.currentUser;

            if (refreshedUser && refreshedUser.emailVerified) {
                authScreen.style.display = "none";

                if (logoutBtn) {
                    logoutBtn.style.display = "inline-flex";
                }

                stopFaceCameraStream();
            } else {
                authScreen.style.display = "flex";

                if (logoutBtn) {
                    logoutBtn.style.display = "none";
                }

                openVerifyForm(refreshedUser ? refreshedUser.email : "your email");
            }
        });
});

if (window.location.search.includes("verified=1")) {
    setTimeout(() => {
        checkEmailVerificationNow();

        window.history.replaceState(
            {},
            document.title,
            window.location.pathname
        );
    }, 1500);
}


/* =========================================================
   STARTUP
========================================================= */

if ($("systemStartTime")) {
    $("systemStartTime").innerHTML = nowTime();
}

addNotification("Dashboard loaded successfully");

console.log("Smart Home Automation V2 final fast sync script loaded.");
