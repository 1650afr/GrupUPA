
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  limit,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ROOT_UID = "5L0w42CRcgVVvqk47dF5vVXOQOV2";
const UPA_IDS = ["UPA001", "UPA002"];

const $ = id => document.getElementById(id);
const show = el => el?.classList.remove("hidden");
const hide = el => el?.classList.add("hidden");

let currentUser = null;
let currentProfile = null;
let currentUpaId = null;
let testRunning = false;

function setMessage(id, message, error = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.className = error ? "error" : "";
}

function setTest(index, icon, message) {
  const item = $("testList")?.children[index];
  if (item) item.textContent = `${icon} ${message}`;
}

function showAlert(message) {
  const el = $("alertBox");
  if (!el) return;
  el.textContent = message;
  show(el);
}

function clearAlert() {
  const el = $("alertBox");
  if (!el) return;
  el.textContent = "";
  hide(el);
}

function errorText(error) {
  return error?.code || error?.message || "Kesalahan tidak diketahui";
}

// Login
$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("loginBtn");
  if (button) button.disabled = true;

  setMessage("loginMessage", "Memeriksa akun...");

  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );
  } catch (error) {
    const messages = {
      "auth/invalid-credential": "Email atau kata sandi salah.",
      "auth/user-not-found": "Akun belum terdaftar.",
      "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
      "auth/network-request-failed": "Periksa koneksi internet."
    };

    setMessage(
      "loginMessage",
      messages[error.code] || `Login gagal: ${errorText(error)}`,
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
});

// Logout
$("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
});

// Muat ulang data
$("refreshBtn")?.addEventListener("click", async () => {
  if (auth.currentUser) await loadDashboard(auth.currentUser);
});

// Pantau status login
onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (!user) {
    currentProfile = null;
    currentUpaId = null;
    show($("loginView"));
    hide($("dashboardView"));
    hide($("logoutBtn"));
    return;
  }

  hide($("loginView"));
  show($("dashboardView"));
  show($("logoutBtn"));

  await loadDashboard(user);
});

// Cari profil dan tentukan UPA dari dokumen anggota
async function findProfile(user) {
  if (user.uid === ROOT_UID) {
    const snapshot = await getDoc(doc(db, "users", user.uid));

    return {
      role: "admin_pusat",
      profile: snapshot.exists() ? snapshot.data() : null,
      upaId: null,
      path: `users/${user.uid}`
    };
  }

  for (const upaId of UPA_IDS) {
    const path = `upas/${upaId}/anggota/${user.uid}`;

    const snapshot = await getDoc(
      doc(db, "upas", upaId, "anggota", user.uid)
    );

    if (snapshot.exists()) {
      return {
        role: snapshot.data().role || "",
        profile: snapshot.data(),
        upaId,
        path
      };
    }
  }

  return {
    role: "",
    profile: null,
    upaId: null,
    path: "Profil anggota tidak ditemukan"
  };
}

async function loadDashboard(user) {
  clearAlert();

  $("welcomeTitle").textContent = "Memuat profil...";
  $("welcomeSubtitle").textContent = user.email || user.uid;
  $("upaName").textContent = "Memuat...";
  $("upaIdLabel").textContent = "";
  $("accountStatus").textContent = "Memeriksa...";
  $("binaanList").textContent = "Memuat data binaan...";

  setTest(0, "🟡", "Login Firebase berhasil");
  setTest(1, "🟡", "Memeriksa profil dan peran");
  setTest(2, "🟡", "Memeriksa data UPA");
  setTest(3, "🟡", "Memeriksa daftar binaan");

  try {
    const result = await findProfile(user);
    currentProfile = result.profile;
    currentUpaId = result.upaId;

    if (
      !result.profile ||
      result.profile.aktif !== true ||
      !["admin_pusat", "admin_upa", "pembina"].includes(result.role)
    ) {
      $("welcomeTitle").textContent = "Akun belum memiliki akses";
      $("roleBadge").textContent = "Akses ditolak";
      $("accountStatus").textContent = "Profil tidak valid";
      $("upaName").textContent = "—";
      $("binaanList").textContent =
        "Periksa jalur profil, peran, dan field aktif di Firestore.";

      setTest(0, "✅", "Login Firebase berhasil");
      setTest(1, "❌", "Profil tidak ditemukan atau tidak valid");
      setTest(2, "—", "Belum diuji");
      setTest(3, "—", "Belum diuji");

      showAlert(
        `Profil tidak valid.\nUID: ${user.uid}\nJalur: ${result.path}\n` +
        `Role: ${result.role || "tidak ditemukan"}\n` +
        `Aktif: ${String(result.profile?.aktif)}`
      );

      renderSecurityTest();
      return;
    }

    $("welcomeTitle").textContent =
      `Selamat datang${result.profile.nama ? ", " + result.profile.nama : ""}`;

    $("roleBadge").textContent =
      result.role === "admin_pusat"
        ? "Admin Pusat"
        : result.role === "admin_upa"
          ? "Admin UPA"
          : "Pembina";

    $("accountStatus").textContent = "Aktif";
    setTest(0, "✅", "Login Firebase berhasil");
    setTest(1, "✅", `Profil ditemukan: ${result.role}`);

    if (!result.upaId) {
      $("upaName").textContent = "Administrasi Pusat";
      $("upaIdLabel").textContent = "Akses pusat";
      setTest(2, "✅", "Profil Admin Pusat berhasil dibaca");
      setTest(3, "—", "Daftar binaan UPA belum diuji");
      $("binaanList").textContent =
        "Pilih UPA tertentu untuk pemeriksaan data anggotanya.";
      renderSecurityTest();
      return;
    }

    const upaSnapshot = await getDoc(
      doc(db, "upas", result.upaId)
    );

    if (!upaSnapshot.exists()) {
      $("upaName").textContent = "UPA tidak ditemukan";
      $("upaIdLabel").textContent = `ID UPA: ${result.upaId}`;
      setTest(2, "❌", "Dokumen UPA tidak ditemukan");
      $("binaanList").textContent = "Data UPA tidak tersedia.";
      setTest(3, "—", "Belum diuji");
      renderSecurityTest();
      return;
    }

    $("upaName").textContent =
      upaSnapshot.data().nama || result.upaId;
    $("upaIdLabel").textContent = `ID UPA: ${result.upaId}`;
    setTest(2, "✅", `Data ${result.upaId} berhasil dibaca`);

    try {
      const snapshot = await getDocs(
        query(
          collection(db, "upas", result.upaId, "binaan"),
          limit(50)
        )
      );

      let binaan = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      if (result.role === "pembina") {
        binaan = binaan.filter(
          item => item.pembinaUid === user.uid
        );
      }

      const list = $("binaanList");
      list.replaceChildren();

      if (!binaan.length) {
        list.textContent =
          "Belum ada data binaan atau belum ada binaan yang ditugaskan.";
      } else {
        binaan.forEach(item => {
          const article = document.createElement("article");
          article.className = "data-row";

          const name = document.createElement("b");
          name.textContent = item.nama || "Tanpa nama";

          const id = document.createElement("small");
          id.textContent = `ID: ${item.id}`;

          const content = document.createElement("div");
          content.append(name, id);
          article.append(content);
          list.append(article);
        });
      }

      setTest(3, "✅", `Daftar binaan berhasil dibaca (${binaan.length})`);
    } catch (error) {
      $("binaanList").textContent =
        "Gagal membaca binaan. Periksa Security Rules.";
      setTest(3, "❌", `Akses binaan gagal: ${errorText(error)}`);
    }

    renderSecurityTest();
  } catch (error) {
    $("welcomeTitle").textContent = "Pemeriksaan belum selesai";
    $("accountStatus").textContent = "Gagal diperiksa";
    $("upaName").textContent = "—";
    $("binaanList").textContent = "Periksa koneksi dan Security Rules.";

    showAlert(`Pemeriksaan gagal: ${errorText(error)}`);
    setTest(1, "❌", `Gagal membaca profil: ${errorText(error)}`);
    renderSecurityTest();
  }
}

// Buat panel pengujian tanpa mengubah index.html
function renderSecurityTest() {
  const dashboard = $("dashboardView");
  if (!dashboard) return;

  let panel = $("securityTestPanel");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "securityTestPanel";
    panel.className = "panel";

    const heading = document.createElement("h2");
    heading.textContent = "Pengujian Keamanan Tulis";

    const description = document.createElement("p");
    description.className = "muted";
    description.textContent =
      "Uji apakah akun ini dapat membuat dokumen di UPA lain. " +
      "Pengujian tidak mengubah dokumen anggota atau binaan.";

    const button = document.createElement("button");
    button.id = "runWriteTestBtn";
    button.textContent = "Uji Isolasi Tulis";
    button.addEventListener("click", runWriteIsolationTest);

    const result = document.createElement("div");
    result.id = "writeTestResult";
    result.setAttribute("role", "status");

    panel.append(heading, description, button, result);
    dashboard.append(panel);
  }

  const button = $("runWriteTestBtn");

  if (button) {
    button.disabled =
      !currentUser ||
      !currentProfile ||
      !currentUpaId ||
      currentProfile.role !== "admin_upa" ||
      testRunning;

    button.textContent = testRunning
      ? "Pengujian berlangsung..."
      : "Uji Isolasi Tulis";
  }

  if (currentProfile?.role === "admin_pusat") {
    $("writeTestResult").textContent =
      "Pengujian ini ditujukan untuk akun Admin UPA.";
  }
}

// Uji CREATE lintas-UPA dengan dokumen sementara
async function runWriteIsolationTest() {
  if (
    testRunning ||
    !currentUser ||
    !currentUpaId ||
    currentProfile?.role !== "admin_upa"
  ) {
    return;
  }

  const otherUpaId = UPA_IDS.find(id => id !== currentUpaId);

  if (!otherUpaId) {
    $("writeTestResult").textContent = "UPA pembanding tidak tersedia.";
    return;
  }

  testRunning = true;
  renderSecurityTest();

  const button = $("runWriteTestBtn");
  const result = $("writeTestResult");

  result.textContent =
    `Menguji pembuatan dokumen sementara pada ${otherUpaId}...`;

  const testId =
    `uji_keamanan_${currentUser.uid}_${Date.now()}`;

  const testRef = doc(
    db,
    "upas",
    otherUpaId,
    "__security_tests__",
    testId
  );

  try {
    await setDoc(testRef, {
      jenis: "uji_isolasi_tulis",
      uidPenguji: currentUser.uid,
      upaAsal: currentUpaId,
      dibuatPada: new Date().toISOString()
    });

    // Jika penulisan berhasil, keamanan gagal.
    // Coba bersihkan dokumen uji jika izin memungkinkan.
    let cleanupMessage = "";

    try {
      await deleteDoc(testRef);
      cleanupMessage = " Dokumen uji berhasil dibersihkan.";
    } catch {
      cleanupMessage =
        " PERHATIAN: dokumen uji mungkin masih ada; periksa Firestore.";
    }

    result.textContent =
      `❌ GAGAL: akun ${currentUpaId} berhasil membuat dokumen ` +
      `di ${otherUpaId}.${cleanupMessage} Jangan gunakan data nyata ` +
      `sebelum aturan diperiksa.`;
  } catch (error) {
    if (error.code === "permission-denied") {
      result.textContent =
        `✅ LULUS: Firestore menolak pembuatan dokumen uji ` +
        `oleh ${currentUpaId} di ${otherUpaId}.`;
    } else {
      result.textContent =
        `⚠️ BELUM DAPAT DINILAI: ${errorText(error)}. ` +
        `Periksa koneksi dan konfigurasi Firebase.`;
    }
  } finally {
    testRunning = false;
    if (button) button.disabled = false;
    renderSecurityTest();
  }
}
