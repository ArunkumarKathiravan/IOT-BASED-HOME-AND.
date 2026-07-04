/* =========================================================
   SMART HOME AUTOMATION V2 - DARK ANIMATED SCRIPT
   Handles Firebase, switches, DHT11, weather fallback,
   statistics, and collapsible activity history.
========================================================= */

/* Firebase configuration */
const firebaseConfig = {
    apiKey: "AIzaSyDOWMHv22hZjSDP1EwVGuJM8Oj5NIzAIpo",
    authDomain: "esp-32-home-automation-f158c.firebaseapp.com",
    databaseURL: "https://esp-32-home-automation-f158c-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "esp-32-home-automation-f158c",
    storageBucket: "esp-32-home-automation-f158c.firebasestorage.app",
    messagingSenderId: "1029711889803",
    appId: "1:1029711889803:web:69d4dd39dcde60ebb71b8e"
};

/* Start Firebase */
firebase.initializeApp(firebaseConfig);

/* Firebase database object */
const database = firebase.database();

/* Firebase paths */
const rootRef = database.ref("SmartHome");
const deviceRef = rootRef.child("devices");
const systemRef = rootRef.child("system");
const environmentRef = rootRef.child("environment");
const historyRef = rootRef.child("history");
const commandRef = rootRef.child("commands");

/* Device element mapping */
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

/* Local state */
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
    fan: {
        web: 0,
        switch: 0
    },
    light1: {
        web: 0,
        switch: 0
    },
    socket: {
        web: 0,
        switch: 0
    },
    light2: {
        web: 0,
        switch: 0
    }
};

let totalOperations = 0;
let previousState = {};
let latestSensorData = null;

/* PRIORITY SYNC FINAL
   Website no longer writes actual device state directly.
   Website writes a command to SmartHome/commands/<device>.
   ESP32 is the authority and writes confirmed actual state to SmartHome/devices/<device>.
*/
let pendingCommand = {};
let latestConfirmedTime = {};
let writeCooldown = {};
const WEB_PENDING_TIMEOUT = 3500;

/* Short element selector */
function $(id) {
    return document.getElementById(id);
}

/* Current time */
function nowTime() {
    return new Date().toLocaleTimeString("en-IN");
}

/* Runtime formatter */
function formatRuntime(seconds) {
    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return minutes + " Min";
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return hours + "h " + remainingMinutes + "m";
}

/* Update clock */
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

/* Set status text */
function setStatusText(id, text, className) {
    const element = $(id);

    if (!element) {
        return;
    }

    element.innerHTML = text;
    element.className = className || "";
}

/* Notification */
function addNotification(text) {
    if ($("notificationText")) {
        $("notificationText").innerHTML = text;
    }
}

/* Add activity event */
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

/* Update summary/statistics */
function updateSummary() {
    let running = 0;
    let totalRuntime = 0;

    Object.keys(devices).forEach((key) => {
        if (localState[key]) {
            running++;
        }

        totalRuntime += runtime[key];

        const device = devices[key];

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

/* Update device UI */
function updateDeviceUI(key, data, options = {}) {
    const device = devices[key];

    if (!device) {
        return;
    }

    const state = data && data.state === true;
    const source = data && data.source ? data.source : "web";
    const lastUpdated = data && data.lastUpdated ? Number(data.lastUpdated) : Date.now();
    const commandId = data && data.commandId ? String(data.commandId) : "";

    const pending = pendingCommand[key];

    if (!options.local && pending) {
        const pendingAge = Date.now() - pending.createdAt;

        if (commandId === pending.commandId) {
            delete pendingCommand[key];
        } else if (pendingAge < WEB_PENDING_TIMEOUT && lastUpdated < pending.createdAt) {
            return;
        } else if (pendingAge >= WEB_PENDING_TIMEOUT) {
            delete pendingCommand[key];
        }
    }

    if (!options.local) {
        if (latestConfirmedTime[key] && lastUpdated < latestConfirmedTime[key]) {
            return;
        }

        latestConfirmedTime[key] = lastUpdated;
    }

    localState[key] = state;

    if ($(device.sw)) {
        $(device.sw).checked = state;
    }

    if ($(device.state)) {
        $(device.state).innerHTML = state ? "ON" : "OFF";
    }

    if ($(device.source)) {
        let label = source;

        if (source === "google") {
            label = "Google Home";
        }

        if (source === "switch") {
            label = "Manual Switch";
        }

        if (source === "web") {
            label = "Website";
        }

        $(device.source).innerHTML = "Last: " + label;
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

    if (previousState[key] !== undefined && previousState[key] !== state) {
        totalOperations++;

        if (state) {
            onCount[key]++;
        }

        if (source === "switch") {
            sourceCount[key].switch++;
        } else {
            sourceCount[key].web++;
        }

        addEventLog(device.name + " " + (state ? "ON" : "OFF"), "Changed by " + source);

        addNotification(device.name + " turned " + (state ? "ON" : "OFF") + " by " + source);

        historyRef.push({
            device: device.name,
            state: state,
            source: source,
            commandId: commandId,
            time: Date.now()
        });
    }

    previousState[key] = state;

    updateSummary();
}

/* Write device command to Firebase
   Website writes only to SmartHome/commands.
   ESP32 reads command, applies relay, then confirms in SmartHome/devices.
*/
function setDevice(key, state) {
    const device = devices[key];

    if (!device) {
        return;
    }

    const now = Date.now();

    if (writeCooldown[key] && now - writeCooldown[key] < 450) {
        if ($(device.sw)) {
            $(device.sw).checked = localState[key];
        }

        return;
    }

    writeCooldown[key] = now;

    const commandId =
        "web-" +
        key +
        "-" +
        now +
        "-" +
        Math.random().toString(16).slice(2);

    pendingCommand[key] = {
        commandId: commandId,
        state: state,
        createdAt: now
    };

    updateDeviceUI(
        key,
        {
            state: state,
            source: "web",
            commandId: commandId,
            lastUpdated: now
        },
        {
            local: true
        }
    );

    commandRef.child(key).set({
        requestedState: state,
        source: "web",
        commandId: commandId,
        requestedAt: now
    }).catch((error) => {
        console.log("Firebase command write failed:", error);
        delete pendingCommand[key];
        addNotification("Command failed. Check internet/Firebase.");
    });
}

/* Device listeners */
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
            updateDeviceUI(key, data, { local: false });
        }
    });
});

/* Runtime counter */
setInterval(() => {
    Object.keys(localState).forEach((key) => {
        if (localState[key]) {
            runtime[key]++;
        }
    });

    updateSummary();
}, 1000);

/* Firebase connection status */
database.ref(".info/connected").on("value", (snapshot) => {
    if (snapshot.val() === true) {
        setStatusText("firebaseStatus", "Connected", "connected");
    } else {
        setStatusText("firebaseStatus", "Disconnected", "disconnected");
    }
});

/* Browser internet status */
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

/* ESP32 online status */
systemRef.child("lastSeen").on("value", (snapshot) => {
    const lastSeen = Number(snapshot.val() || 0);
    const difference = Date.now() - lastSeen;

    if (lastSeen > 0 && difference < 20000) {
        setStatusText("espStatus", "Online", "online");
    } else {
        setStatusText("espStatus", "Offline", "offline");
    }
});

/* Website heartbeat */
setInterval(() => {
    systemRef.update({
        websiteLastSeen: Date.now()
    });
}, 10000);

/* Weather fallback location */
const KONGALNAGARAM = {
    latitude: 10.6759,
    longitude: 77.1909
};

/* Weather mood text */
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

/* Update environment UI */
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

/* Check if DHT11 data is fresh */
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

/* Load online weather */
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

/* DHT11 listener */
environmentRef.on("value", (snapshot) => {
    const data = snapshot.val();

    latestSensorData = data;

    if (isFreshDHT(data)) {
        updateEnvironmentUI(data, "sensor");
    } else {
        loadOnlineWeather();
    }
});

/* Weather refresh */
setInterval(() => {
    if (isFreshDHT(latestSensorData)) {
        updateEnvironmentUI(latestSensorData, "sensor");
    } else {
        loadOnlineWeather();
    }
}, 60000);

/* Activity history toggle */
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

/* Startup */
if ($("systemStartTime")) {
    $("systemStartTime").innerHTML = nowTime();
}

addNotification("Dashboard loaded successfully");

console.log("Smart Home Automation V2 Dark Theme loaded");

/*=========================================================
 FIREBASE AUTH LOGIN SYSTEM V2 - CLEAN FINAL
 Email Verification Page + Camera Demo + Local Hashed Login
=========================================================*/

const auth = firebase.auth();

/* Keep Firebase login saved after refresh and email verification redirect */
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

/*=========================================================
 AUTH ELEMENTS
=========================================================*/

const authScreen = document.getElementById("authScreen");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const forgotForm = document.getElementById("forgotForm");
const verifyForm = document.getElementById("verifyForm");
const faceForm = document.getElementById("faceForm");

const authMessage = document.getElementById("authMessage");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");

const signupName = document.getElementById("signupName");
const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");

const forgotEmail = document.getElementById("forgotEmail");

const verifyEmailText = document.getElementById("verifyEmailText");

const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const forgotBtn = document.getElementById("forgotBtn");

const checkVerifyBtn = document.getElementById("checkVerifyBtn");
const resendVerifyBtn = document.getElementById("resendVerifyBtn");

const logoutBtn = document.getElementById("logoutBtn");

const showSignup = document.getElementById("showSignup");
const showLogin = document.getElementById("showLogin");
const showForgot = document.getElementById("showForgot");
const backToLogin = document.getElementById("backToLogin");
const verifyBackLogin = document.getElementById("verifyBackLogin");

const faceVerifyBtn = document.getElementById("faceVerifyBtn");
const faceBackLogin = document.getElementById("faceBackLogin");
const faceVideo = document.getElementById("faceVideo");
const faceStatus = document.getElementById("faceStatus");

const localUserName = document.getElementById("localUserName");
const localUserPassword = document.getElementById("localUserPassword");
const localLoginBtn = document.getElementById("localLoginBtn");

/*=========================================================
 EMAIL VERIFICATION REDIRECT SETTINGS
=========================================================*/

const emailActionSettings = {
    url: window.location.origin + window.location.pathname + "?verified=1",
    handleCodeInApp: false
};

/*=========================================================
 LOCAL DEMO HASHED USERS
 Demo only. Do not use this as final security.
=========================================================*/

const LOCAL_AUTH_SALT = "AK_SMART_HOME_V2";

const LOCAL_USERS = [
    {
        hash: "8c6d26bdb8fa557dd0828f30481725dc1dbaefae6904c31610e2aab4f13cc910"
    },
    {
        hash: "9b8ff5dd5e018e23085d4ecae35b3cd4e822d62e9e90a0b1a44811db442f87d2"
    },
    {
        hash: "4113675f36681507bc8aebf411eff445313d05814a69a9edd5a9e3221c040857"
    }
];

/*=========================================================
 AUTH MESSAGE FUNCTION
=========================================================*/

function showAuthMessage(message, type) {
    if (!authMessage) {
        return;
    }

    authMessage.innerHTML = message;
    authMessage.className = "auth-message " + (type || "");
}

/*=========================================================
 STOP CAMERA STREAM
=========================================================*/

function stopFaceCameraStream() {
    if (faceVideo && faceVideo.srcObject) {
        faceVideo.srcObject.getTracks().forEach((track) => {
            track.stop();
        });

        faceVideo.srcObject = null;
    }
}

/*=========================================================
 FORM CONTROL
=========================================================*/

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

/*=========================================================
 FORM BUTTON EVENTS
=========================================================*/

if (showSignup) {
    showSignup.addEventListener("click", openSignupForm);
}

if (showLogin) {
    showLogin.addEventListener("click", openLoginForm);
}

if (showForgot) {
    showForgot.addEventListener("click", openForgotForm);
}

if (backToLogin) {
    backToLogin.addEventListener("click", openLoginForm);
}

if (verifyBackLogin) {
    verifyBackLogin.addEventListener("click", openLoginForm);
}

if (faceVerifyBtn) {
    faceVerifyBtn.addEventListener("click", openFaceForm);
}

if (faceBackLogin) {
    faceBackLogin.addEventListener("click", openLoginForm);
}

/*=========================================================
 SIGN UP NEW USER
 After creating account, stay on the verify email page.
=========================================================*/

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
                        createdAt: Date.now()
                    });
                }).then(() => {
                    signupName.value = "";
                    signupEmail.value = "";
                    signupPassword.value = "";
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

/*=========================================================
 CHECK EMAIL VERIFICATION
=========================================================*/

function checkEmailVerificationNow() {
    const user = auth.currentUser;

    if (!user) {
        openLoginForm();
        showAuthMessage("Verification completed. Please sign in once to continue.", "success");
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

/*=========================================================
 RESEND VERIFICATION EMAIL
=========================================================*/

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

/*=========================================================
 SIGN IN EXISTING USER
=========================================================*/

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

/*=========================================================
 FORGOT PASSWORD
=========================================================*/

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

/*=========================================================
 CAMERA DEMO
 Face ID / Passkey can be added later.
 This page opens only when Verify with Face is clicked.
=========================================================*/

function startCameraDemo() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (faceStatus) {
            faceStatus.innerHTML = "Camera not supported. Use username and password.";
        }

        return;
    }

    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "user"
        },
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

/*=========================================================
 SHA-256 HASH FUNCTION
=========================================================*/

async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    return hashArray
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

/*=========================================================
 LOCAL HASHED USERNAME / PASSWORD LOGIN
 Usernames and passwords are case-insensitive.
=========================================================*/

if (localLoginBtn) {
    localLoginBtn.addEventListener("click", async () => {
        const username = localUserName.value.trim().toLowerCase();
        const password = localUserPassword.value.trim().toLowerCase();

        if (username === "" || password === "") {
            showAuthMessage("Enter username and password.", "error");
            return;
        }

        const loginHash = await sha256(
            username + ":" + password + ":" + LOCAL_AUTH_SALT
        );

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

/*=========================================================
 LOGOUT
=========================================================*/

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        sessionStorage.removeItem("localDemoAuth");
        stopFaceCameraStream();
        auth.signOut();
    });
}

/*=========================================================
 AUTH STATE CHECK
 Main fix:
 - No user          -> Login page
 - Unverified user  -> Verify email page
 - Verified user    -> Dashboard
 - Face page opens ONLY after clicking Verify with Face
=========================================================*/

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

/*=========================================================
 EMAIL VERIFICATION RETURN HANDLER
=========================================================*/

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

console.log("Clean Firebase Auth login system loaded.");

