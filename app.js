
import { auth, db } from "./firebase.js?v=013";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  limit,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ROOT_UID = "5L0w42CRcgVVvqk47dF5vVXOQOV2";

const UPA_IDS = ["UPA001", "UPA002"];

const KNOWN_ADMIN_UIDS = {
  UPA001: "Qo8huhew52eEOPHO9TAOZrzd8lI2",
  UPA002: "8tNL1G7bhjg9sUWrrtiM5YbB1tl1"
};

const $ = id => document.getElementById(id);

const show = el => {
  if (el) el.classList.remove("hidden");
};

const hide = el => {
  if (el) el.classList.add("hidden");
};

function setMessage(id, message, error = false) {
  const el = $(id);
  if (!el) return;

  el.textContent = message;
  el.className = error ? "error" : "";
}

function test(n, icon, message) {
  const li = $("testList")?.children[n];
  if (li) li.textContent = `${icon} ${message}`;
}

function errorText(error) {
  return error?.code || error?.message || "Kesalahan tidak diketahui";
}

let currentUser = null;
let currentProfile = null;
let currentUpaId = null;
let currentRole = null;
let loadSequence = 0;
let testRunning = false;

function ensureSecurityTestPanel() {
  if ($("securityTestPanel")) return;

  const panels = document.querySelectorAll("#dashboardView .panel");
  const anchor = [...panels].find(panel =>
    panel.querySelector("#testList")
  );

  if (!anchor) return;

  const section = document.createElement("section");
  section.id = "securityTestPanel";
  section.className = "panel";

  section.innerHTML = `
    <h2>Pengujian Keamanan Tulis</h2>
    <p class="muted">
      Uji apakah akun ini dapat membuat dokumen di UPA lain.
      Pengujian menggunakan dokumen sementara pada koleksi binaan.
    </p>
    <button id="writeTestBtn" type="button">
      Uji Isolasi Tulis
    </button>
    <p id="writeTestResult" role="status" aria-live="polite">
      Belum diuji
    </p>
  `;

  anchor.insertAdjacentElement("afterend", section);

  $("writeTestBtn").addEventListener("click", runWriteIsolationTest);
}

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  setMessage("loginMessage", "Memeriksa akun…");

  const button = $("loginBtn");
  if (button) button.disabled = true;

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
      "auth/wrong-password": "Kata sandi salah.",
      "auth/too-many-requests":
        "Terlalu banyak percobaan. Tunggu sebelum mencoba lagi.",
      "auth/network-request-failed":
        "Periksa koneksi internet."
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

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    alert("Gagal keluar: " + errorText(error));
  }
});

$("refreshBtn")?.addEventListener("click", () => {
  if (currentUser) load(currentUser);
});

onAuthStateChanged(auth, user => {
  currentUser = user;

  if (!user) {
    currentProfile = null;
    currentUpaId = null;
    currentRole = null;

    show($("loginView"));
    hide($("dashboardView"));
    hide($("logoutBtn"));

    return;
  }

  hide($("loginView"));
  show($("dashboardView"));
  show($("logoutBtn"));

  ensureSecurityTestPanel();
  load(user);
});

async function findProfile(user) {
  if (user.uid === ROOT_UID) {
    const snapshot = await getDoc(doc(db, "users", user.uid));

    return {
      profile: snapshot.exists() ? snapshot.data() : null,
      upaId: null,
      role: "admin_pusat",
      profilePath: `users/${user.uid}`
    };
  }

  // Periksa dokumen milik akun ini pada UPA yang dikenal.
  // Security Rules tetap menentukan apakah akses diizinkan.
  for (const upaId of UPA_IDS) {
    const path = `upas/${upaId}/anggota/${user.uid}`;
    const snapshot = await getDoc(doc(db, path));

    if (snapshot.exists()) {
      return {
        profile: snapshot.data(),
        upaId,
        role: snapshot.data().role || "",
        profilePath: path
      };
    }
  }

  return {
    profile: null,
    upaId: null,
    role: "",
    profilePath: ""
  };
}

async function load(user) {
  const sequence = ++loadSequence;

  currentProfile = null;
  currentUpaId = null;
  currentRole = null;

  $("welcomeTitle").textContent = "Memuat profil…";
  $("welcomeSubtitle").textContent = user.email || user.uid;
  $("upaName").textContent = "—";
  $("upaIdLabel").textContent = "";
  $("accountStatus").textContent = "Memeriksa profil";
  $("binaanList").textContent = "Memuat data…";

  hide($("alertBox"));

  test(0, "✅", "Login Firebase berhasil");
  test(1, "🟡", "Memeriksa profil dan peran");
  test(2, "🟡", "Memeriksa data UPA");
  test(3, "🟡", "Memeriksa daftar binaan");

  if ($("writeTestResult")) {
    $("writeTestResult").textContent = "Belum diuji";
  }

  if ($("writeTestBtn")) {
    $("writeTestBtn").disabled = true;
  }

  try {
    const result = await findProfile(user);

    if (sequence !== loadSequence) return;

    const { profile, upaId, role, profilePath } = result;

    if (
      !profile ||
      profile.aktif !== true ||
      !["admin_pusat", "admin_upa", "pembina"].includes(role)
    ) {
      test(1, "❌", "Profil tidak ditemukan atau tidak valid");

      $("welcomeTitle").textContent = "Akun belum memiliki akses";
      $("roleBadge").textContent = "Akses ditolak";
      $("accountStatus").textContent = "Profil tidak valid";
      $("binaanList").textContent =
        "Periksa lokasi dokumen profil, nilai role, dan field aktif bertipe boolean true.";

      $("alertBox").textContent =
        "Profil tidak valid. UID login: " + user.uid +
        ". Jalur profil yang diperiksa: " +
        (profilePath || "tidak ditemukan") +
        ". Periksa dokumen Firestore tanpa melonggarkan Security Rules.";

      show($("alertBox"));
      test(2, "—", "Belum diuji");
      test(3, "—", "Belum diuji");

      return;
    }

    if (role !== "admin_pusat" && !upaId) {
      test(1, "❌", "UPA akun tidak diketahui");

      $("welcomeTitle").textContent = "UPA tidak ditemukan";
      $("accountStatus").textContent = "Periksa profil";
      $("alertBox").textContent =
        "Akun tidak terhubung ke UPA yang dikenal aplikasi.";

      show($("alertBox"));
      return;
    }

    currentProfile = profile;
    currentUpaId = upaId;
    currentRole = role;

    test(1, "✅", "Profil ditemukan: " + role);

    $("welcomeTitle").textContent =
      "Selamat datang" + (profile.nama ? ", " + profile.nama : "");

    $("roleBadge").textContent =
      role === "admin_pusat" ? "Admin Pusat" :
      role === "admin_upa" ? "Admin UPA" : "Pembina";

    $("accountStatus").textContent = "Aktif";

    if (role === "admin_pusat") {
      $("upaName").textContent = "Seluruh UPA";
      $("upaIdLabel").textContent = "Admin Pusat";
      test(2, "✅", "Profil Admin Pusat berhasil dibaca");

      $("binaanList").textContent =
        "Pilih UPA tertentu untuk pemeriksaan data. Pengujian isolasi lintas-UPA hanya tersedia untuk Admin UPA.";

      return;
    }

    const upaSnapshot = await getDoc(doc(db, "upas", upaId));

    if (sequence !== loadSequence) return;

    if (!upaSnapshot.exists()) {
      $("upaName").textContent = "UPA tidak ditemukan";
      test(2, "❌", "Dokumen UPA tidak ditemukan");
      $("binaanList").textContent = "Dokumen UPA tidak tersedia.";
      return;
    }

    $("upaName").textContent = upaSnapshot.data().nama || upaId;
    $("upaIdLabel").textContent = "ID UPA: " + upaId;

    test(2, "✅", "Data " + upaId + " berhasil dibaca");

    try {
      const snapshot = await getDocs(
        query(collection(db, "upas", upaId, "binaan"), limit(50))
      );

      if (sequence !== loadSequence) return;

      let binaanDocs = snapshot.docs;

      if (role === "pembina") {
        binaanDocs = binaanDocs.filter(
          item => item.data().pembinaUid === user.uid
        );
      }

      $("binaanList").replaceChildren();

      if (binaanDocs.length === 0) {
        $("binaanList").textContent =
          "Belum ada data binaan atau belum ada binaan yang ditugaskan.";
      } else {
        for (const item of binaanDocs) {
          const row = document.createElement("article");
          row.className = "data-row";

          const content = document.createElement("div");
          const name = document.createElement("b");
          const id = document.createElement("small");

          name.textContent = item.data().nama || "Tanpa nama";
          id.textContent = "ID: " + item.id;

          content.append(name, id);
          row.append(content);
          $("binaanList").append(row);
        }
      }

      test(3, "✅", `Daftar binaan berhasil dibaca (${binaanDocs.length})`);
    } catch (error) {
      $("binaanList").textContent =
        "Gagal membaca binaan. Periksa Security Rules.";

      test(3, "❌", "Akses binaan gagal: " + errorText(error));
    }

    if (sequence === loadSequence) {
      ensureSecurityTestPanel();

      if ($("writeTestBtn")) {
        $("writeTestBtn").disabled = role !== "admin_upa";
      }

      if (role === "admin_upa") {
        renderSecurityTest();
      }
    }
  } catch (error) {
    if (sequence !== loadSequence) return;

    test(1, "❌", "Gagal membaca profil: " + errorText(error));

    $("welcomeTitle").textContent = "Pemeriksaan belum selesai";
    $("accountStatus").textContent = "Terjadi kesalahan";

    $("alertBox").textContent =
      "Firestore gagal membaca profil. Detail: " + errorText(error);

    show($("alertBox"));
    $("binaanList").textContent = "Data belum dapat dimuat.";
  }
}

function renderSecurityTest() {
  const button = $("writeTestBtn");
  const result = $("writeTestResult");

  if (!button || !result) return;

  button.disabled =
    testRunning ||
    !currentUser ||
    currentRole !== "admin_upa" ||
    !currentUpaId;

  if (currentRole !== "admin_upa" || !currentUpaId) {
    result.textContent =
      "Masuk menggunakan akun Admin UPA untuk menjalankan pengujian.";
  }
}

async function runWriteIsolationTest() {
  if (
    testRunning ||
    !currentUser ||
    currentRole !== "admin_upa" ||
    !currentUpaId
  ) {
    return;
  }

  const otherUpaId = UPA_IDS.find(id => id !== currentUpaId);

  if (!otherUpaId) {
    $("writeTestResult").textContent =
      "Belum dapat diuji: UPA pembanding tidak ditemukan.";
    return;
  }

  testRunning = true;
  renderSecurityTest();

  const result = $("writeTestResult");
  result.textContent = "Sedang menguji izin tulis lintas-UPA…";

  let testRef = null;
  let writeSucceeded = false;

  try {
    // Gunakan ID dokumen otomatis agar tidak menimpa data yang ada.
    testRef = doc(collection(db, "upas", otherUpaId, "binaan"));

    await setDoc(testRef, {
      nama: "DOKUMEN UJI KEAMANAN",
      jenis: "grupupa_security_test",
      uidPenguji: currentUser.uid,
      upaAsal: currentUpaId,
      dibuatUntukPengujian: true
    });

    writeSucceeded = true;

    result.textContent =
      "❌ GAGAL: Firestore mengizinkan pembuatan dokumen pada " +
      otherUpaId + ". Mencoba membersihkan dokumen uji.";

    try {
      await deleteDoc(testRef);

      result.textContent =
        "❌ GAGAL: Penulisan lintas-UPA diizinkan. " +
        "Dokumen uji sementara sudah dihapus. Periksa Security Rules.";
    } catch (cleanupError) {
      result.textContent =
        "❌ GAGAL: Penulisan lintas-UPA diizinkan, dan penghapusan " +
        "dokumen uji gagal. Periksa dokumen " + testRef.path +
        ". Detail: " + errorText(cleanupError);
    }
  } catch (error) {
    if (error.code === "permission-denied") {
      result.textContent =
        "✅ LULUS: Firestore menolak penulisan dari " +
        currentUpaId + " ke " + otherUpaId +
        ". Tidak ada dokumen uji yang berhasil dibuat.";
    } else {
      result.textContent =
        "⚠️ BELUM DAPAT DINILAI: " + errorText(error) +
        ". Periksa koneksi dan konfigurasi Firebase.";
    }
  } finally {
    testRunning = false;
    renderSecurityTest();
  }
}
