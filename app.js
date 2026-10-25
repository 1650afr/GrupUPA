
import { auth, db } from "./firebase.js";

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
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ROOT_UID = "5L0w42CRcgVVvqk47dF5vVXOQOV2";

const UPA_ADMINS = {
  "Qo8huhew52eEOPHO9TAOZrzd8lI2": "UPA001",
  "8tNL1G7bhjg9sUWrrtiM5YbB1tl1": "UPA002"
};

const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let currentUpaId = null;
let currentRole = null;
let loadSequence = 0;
let testRunning = false;

function show(el) {
  if (el) el.classList.remove("hidden");
}

function hide(el) {
  if (el) el.classList.add("hidden");
}

function setMessage(id, value, error = false) {
  const el = $(id);
  if (!el) return;

  el.textContent = value;
  el.className = error ? "error" : "";
}

function errorText(error) {
  return error?.code || error?.message || "Kesalahan tidak diketahui";
}

function test(index, icon, value) {
  const item = $("testList")?.children[index];
  if (item) item.textContent = `${icon} ${value}`;
}

function showResults(title, lines) {
  const panel = $("securityTestResults");
  if (!panel) {
    alert(title + "\n\n" + lines.join("\n\n"));
    return;
  }

  panel.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = title;
  panel.appendChild(heading);

  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    panel.appendChild(p);
  }
}

function ensureSecurityPanel() {
  if ($("securityTestPanel")) return;

  const panels = document.querySelectorAll("#dashboardView .panel");
  const anchor = [...panels].find(p => p.querySelector("#testList"));

  if (!anchor) return;

  const panel = document.createElement("section");
  panel.id = "securityTestPanel";
  panel.className = "panel";

  const heading = document.createElement("h2");
  heading.textContent = "Pengujian Keamanan GrupUPA";

  const description = document.createElement("p");
  description.className = "muted";
  description.textContent =
    "Uji baca dan tulis lintas-UPA menggunakan dokumen uji khusus.";

  const readButton = document.createElement("button");
  readButton.id = "readIsolationBtn";
  readButton.type = "button";
  readButton.textContent = "Uji Isolasi Baca";

  const writeButton = document.createElement("button");
  writeButton.id = "writeIsolationBtn";
  writeButton.type = "button";
  writeButton.className = "secondary";
  writeButton.textContent = "Uji Isolasi Tulis";

  const results = document.createElement("div");
  results.id = "securityTestResults";
  results.setAttribute("aria-live", "polite");
  results.textContent = "Pengujian belum dijalankan.";

  panel.append(heading, description, readButton, writeButton, results);
  anchor.insertAdjacentElement("afterend", panel);

  readButton.addEventListener("click", runReadTests);
  writeButton.addEventListener("click", runWriteTests);
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
      "auth/too-many-requests": "Terlalu banyak percobaan. Tunggu dahulu.",
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
    ++loadSequence;
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

  ensureSecurityPanel();
  load(user);
});

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
  test(1, "🟡", "Memeriksa profil");
  test(2, "🟡", "Memeriksa data UPA");
  test(3, "🟡", "Memeriksa daftar binaan");

  try {
    let profile;
    let role;
    let upaId = null;

    if (user.uid === ROOT_UID) {
      const snapshot = await getDoc(doc(db, "users", user.uid));

      if (!snapshot.exists()) {
        throw new Error("Profil Admin Pusat tidak ditemukan.");
      }

      profile = snapshot.data();
      role = profile.role || "admin_pusat";
    } else {
      upaId = UPA_ADMINS[user.uid];

      if (!upaId) {
        throw new Error("UID belum terdaftar dalam pemetaan aplikasi.");
      }

      const snapshot = await getDoc(
        doc(db, "upas", upaId, "anggota", user.uid)
      );

      if (!snapshot.exists()) {
        throw new Error("Dokumen profil anggota tidak ditemukan.");
      }

      profile = snapshot.data();
      role = profile.role || "";
    }

    if (sequence !== loadSequence) return;

    if (
      profile.aktif !== true ||
      !["admin_pusat", "admin_upa", "pembina"].includes(role)
    ) {
      throw new Error("Periksa role dan field aktif pada dokumen profil.");
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
      $("binaanList").textContent =
        "Admin Pusat. Data binaan per UPA belum ditampilkan di panel ini.";
      test(2, "✅", "Profil Admin Pusat berhasil dibaca");
      test(3, "—", "Daftar binaan belum dimuat");
      return;
    }

    const upaSnapshot = await getDoc(doc(db, "upas", upaId));

    if (sequence !== loadSequence) return;

    if (!upaSnapshot.exists()) {
      throw new Error("Dokumen UPA tidak ditemukan: " + upaId);
    }

    $("upaName").textContent = upaSnapshot.data().nama || upaId;
    $("upaIdLabel").textContent = "ID UPA: " + upaId;

    test(2, "✅", "Data " + upaId + " berhasil dibaca");

    const binaanSnapshot = await getDocs(
      query(collection(db, "upas", upaId, "binaan"), limit(50))
    );

    if (sequence !== loadSequence) return;

    let items = binaanSnapshot.docs;

    if (role === "pembina") {
      items = items.filter(
        item => item.data().pembinaUid === user.uid
      );
    }

    $("binaanList").replaceChildren();

    if (items.length === 0) {
      $("binaanList").textContent =
        "Belum ada data binaan atau belum ada binaan yang ditugaskan.";
    } else {
      for (const item of items) {
        const row = document.createElement("article");
        row.className = "data-row";

        const name = document.createElement("b");
        name.textContent = item.data().nama || "Tanpa nama";

        const id = document.createElement("small");
        id.textContent = "ID: " + item.id;

        const content = document.createElement("div");
        content.append(name, id);
        row.appendChild(content);
        $("binaanList").appendChild(row);
      }
    }

    test(3, "✅", `Daftar binaan berhasil dibaca (${items.length})`);

    ensureSecurityPanel();
    setButtonsDisabled(false);
  } catch (error) {
    if (sequence !== loadSequence) return;

    test(1, "❌", "Profil gagal diperiksa");

    $("welcomeTitle").textContent = "Akun belum memiliki akses";
    $("accountStatus").textContent = "Periksa profil";
    $("binaanList").textContent = "Data belum dapat dimuat.";

    $("alertBox").textContent = "Pemeriksaan gagal: " + errorText(error);
    show($("alertBox"));
  }
}

function otherUpa() {
  if (currentUpaId === "UPA001") return "UPA002";
  if (currentUpaId === "UPA002") return "UPA001";
  return null;
}

function canRunTest() {
  return Boolean(
    currentUser &&
    currentRole === "admin_upa" &&
    currentUpaId &&
    otherUpa()
  );
}

function setButtonsDisabled(disabled) {
  const unavailable = !canRunTest();

  if ($("readIsolationBtn")) {
    $("readIsolationBtn").disabled = disabled || unavailable;
  }

  if ($("writeIsolationBtn")) {
    $("writeIsolationBtn").disabled = disabled || unavailable;
  }
}

async function runReadTests() {
  if (testRunning) return;

  if (!canRunTest()) {
    showResults("Pengujian Tidak Dapat Dimulai", [
      "Login sebagai Admin UPA001 atau Admin UPA002 terlebih dahulu."
    ]);
    return;
  }

  testRunning = true;
  setButtonsDisabled(true);

  const targetUpa = otherUpa();
  const results = [];

  try {
    const checks = [
      ["Dokumen UPA", () =>
        getDoc(doc(db, "upas", targetUpa))],

      ["Daftar anggota", () =>
        getDocs(query(
          collection(db, "upas", targetUpa, "anggota"),
          limit(1)
        ))],

      ["Daftar binaan", () =>
        getDocs(query(
          collection(db, "upas", targetUpa, "binaan"),
          limit(1)
        ))],

      ["Daftar mutabaah", () =>
        getDocs(query(
          collection(db, "upas", targetUpa, "mutabaah"),
          limit(1)
        ))],

      ["Daftar kegiatan", () =>
        getDocs(query(
          collection(db, "upas", targetUpa, "kegiatan"),
          limit(1)
        ))],

      ["Daftar absensi", () =>
        getDocs(query(
          collection(db, "upas", targetUpa, "absensi"),
          limit(1)
        ))]
    ];

    const targetAdminUid = Object.keys(UPA_ADMINS).find(
      uid => UPA_ADMINS[uid] === targetUpa
    );

    checks.splice(1, 0, [
      "Profil Admin UPA",
      () => getDoc(doc(
        db, "upas", targetUpa, "anggota", targetAdminUid
      ))
    ]);

    for (const [label, action] of checks) {
      try {
        await action();
        results.push("❌ GAGAL — " + label + ": akses diizinkan.");
      } catch (error) {
        results.push(
          error.code === "permission-denied"
            ? "✅ LULUS — " + label + ": akses ditolak."
            : "⚠️ BELUM DINILAI — " + label + ": " + errorText(error)
        );
      }
    }

    showResults("Hasil Pengujian Isolasi Baca", results);
  } catch (error) {
    showResults("Pengujian Baca Gagal", [errorText(error)]);
  } finally {
    testRunning = false;
    setButtonsDisabled(false);
  }
}

async function runWriteTests() {
  if (testRunning) return;

  if (!canRunTest()) {
    showResults("Pengujian Tidak Dapat Dimulai", [
      "Login sebagai Admin UPA001 atau Admin UPA002 terlebih dahulu."
    ]);
    return;
  }

  testRunning = true;
  setButtonsDisabled(true);

  const targetUpa = otherUpa();
  const results = [];

  // ID unik menghindari benturan dengan dokumen pengujian sebelumnya.
  const safeUid = currentUser.uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const sentinelId = "__uji_isolasi_" + safeUid + "_" + Date.now();

  const targetRef = doc(
    db, "upas", targetUpa, "binaan", sentinelId
  );

  try {
    // Jangan membaca dokumen target terlebih dahulu.
    // Pembacaan lintas-UPA memang seharusnya ditolak.
    try {
      await setDoc(targetRef, {
        nama: "DOKUMEN UJI KEAMANAN",
        jenis: "grupupa_security_test",
        uidPenguji: currentUser.uid,
        upaAsal: currentUpaId,
        dibuatPadaUji: true
      });

      results.push(
        "❌ GAGAL — Pembuatan dokumen lintas-UPA berhasil. " +
        "Periksa Security Rules segera."
      );

      // Jika pembuatan diizinkan, uji update pada dokumen uji ini saja.
      try {
        await updateDoc(targetRef, {
          nama: "DOKUMEN UJI DIUBAH"
        });
        results.push("❌ GAGAL — Update lintas-UPA berhasil.");
      } catch (error) {
        results.push(
          error.code === "permission-denied"
            ? "✅ LULUS — Update ditolak."
            : "⚠️ Update belum dapat dinilai: " + errorText(error)
        );
      }

      // Hanya mencoba menghapus dokumen uji yang baru dibuat oleh tes ini.
      try {
        await deleteDoc(targetRef);
        results.push(
          "⚠️ Penghapusan dokumen uji diizinkan. " +
          "Dokumen uji sudah dibersihkan."
        );
      } catch (error) {
        results.push(
          error.code === "permission-denied"
            ? "✅ LULUS — Penghapusan ditolak."
            : "⚠️ Penghapusan belum dapat dinilai: " + errorText(error)
        );
      }
    } catch (error) {
      if (error.code === "permission-denied") {
        results.push(
          "✅ LULUS — Firestore menolak pembuatan dokumen lintas-UPA."
        );
        results.push(
          "Update dan hapus belum diuji karena dokumen uji tidak berhasil dibuat."
        );
      } else {
        results.push(
          "⚠️ BELUM DAPAT DINILAI — " + errorText(error)
        );
      }
    }

    showResults("Hasil Pengujian Isolasi Tulis", results);
  } catch (error) {
    showResults("Pengujian Tulis Gagal", [errorText(error)]);
  } finally {
    testRunning = false;
    setButtonsDisabled(false);
  }
}
