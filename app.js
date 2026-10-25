
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

function message(id, value, error = false) {
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

function statusResult(title, lines) {
  const panel = $("securityTestResults");
  if (!panel) return;

  panel.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = title;
  panel.append(heading);

  for (const line of lines) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    panel.append(paragraph);
  }
}

function ensureSecurityPanel() {
  if ($("securityTestPanel")) return;

  const panels = document.querySelectorAll("#dashboardView .panel");
  const anchor = [...panels].find(panel => panel.querySelector("#testList"));

  if (!anchor) return;

  const panel = document.createElement("section");
  panel.id = "securityTestPanel";
  panel.className = "panel";

  const heading = document.createElement("h2");
  heading.textContent = "Pengujian Keamanan GrupUPA";

  const description = document.createElement("p");
  description.className = "muted";
  description.textContent =
    "Pengujian baca, buat, ubah, dan hapus lintas-UPA. " +
    "Operasi tulis memakai ID dokumen uji khusus.";

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
  results.textContent = "Belum diuji.";

  panel.append(heading, description, readButton, writeButton, results);
  anchor.insertAdjacentElement("afterend", panel);

  readButton.addEventListener("click", runReadTests);
  writeButton.addEventListener("click", runWriteTests);
}

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  message("loginMessage", "Memeriksa akun…");

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
      "auth/too-many-requests": "Terlalu banyak percobaan. Tunggu dahulu.",
      "auth/network-request-failed": "Periksa koneksi internet."
    };

    message(
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
    let profile = null;
    let role = "";
    let upaId = null;

    if (user.uid === ROOT_UID) {
      const snapshot = await getDoc(doc(db, "users", user.uid));

      if (snapshot.exists()) {
        profile = snapshot.data();
        role = profile.role || "admin_pusat";
      } else {
        throw new Error("Dokumen Admin Pusat tidak ditemukan.");
      }
    } else {
      // Tentukan UPA berdasarkan UID yang sudah terdaftar.
      // Jangan membaca profil UPA lain untuk mencari akun ini.
      upaId = UPA_ADMINS[user.uid];

      if (!upaId) {
        throw new Error(
          "UID belum terdaftar dalam pemetaan aplikasi. " +
          "Hubungi Admin Pusat."
        );
      }

      const snapshot = await getDoc(
        doc(db, "upas", upaId, "anggota", user.uid)
      );

      if (!snapshot.exists()) {
        throw new Error(
          `Profil tidak ditemukan pada upas/${upaId}/anggota/${user.uid}`
        );
      }

      profile = snapshot.data();
      role = profile.role || "";
    }

    if (sequence !== loadSequence) return;

    if (
      profile.aktif !== true ||
      !["admin_pusat", "admin_upa", "pembina"].includes(role)
    ) {
      throw new Error(
        "Profil tidak valid. Pastikan role benar dan aktif bertipe boolean true."
      );
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
        "Admin Pusat. Pilih UPA melalui fitur administrasi setelah tersedia.";
      test(2, "✅", "Profil Admin Pusat berhasil dibaca");
      test(3, "—", "Daftar binaan belum dimuat");
      return;
    }

    const upaSnapshot = await getDoc(doc(db, "upas", upaId));

    if (sequence !== loadSequence) return;

    if (!upaSnapshot.exists()) {
      throw new Error("Dokumen " + upaId + " tidak ditemukan.");
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

    if (!items.length) {
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
        row.append(content);
        $("binaanList").append(row);
      }
    }

    test(3, "✅", `Daftar binaan berhasil dibaca (${items.length})`);

    ensureSecurityPanel();

    if ($("readIsolationBtn")) {
      $("readIsolationBtn").disabled = role !== "admin_upa";
    }

    if ($("writeIsolationBtn")) {
      $("writeIsolationBtn").disabled = role !== "admin_upa";
    }
  } catch (error) {
    if (sequence !== loadSequence) return;

    test(1, "❌", "Profil gagal diperiksa");

    $("welcomeTitle").textContent = "Akun belum memiliki akses";
    $("accountStatus").textContent = "Periksa profil";

    $("alertBox").textContent =
      "Pemeriksaan gagal: " + errorText(error);

    show($("alertBox"));
    $("binaanList").textContent = "Data belum dapat dimuat.";
  }
}

function otherUpa() {
  return currentUpaId === "UPA001" ? "UPA002" :
         currentUpaId === "UPA002" ? "UPA001" : null;
}

function canRunTest() {
  return currentUser &&
    currentRole === "admin_upa" &&
    currentUpaId &&
    otherUpa();
}

async function runReadTests() {
  if (testRunning || !canRunTest()) return;

  testRunning = true;
  setButtonsDisabled(true);

  const targetUpa = otherUpa();
  const results = [];

  try {
    const checks = [
      {
        label: "Dokumen UPA",
        action: () => getDoc(doc(db, "upas", targetUpa))
      },
      {
        label: "Profil Admin UPA",
        action: () => getDoc(
          doc(db, "upas", targetUpa, "anggota", UPA_ADMINS[
            Object.keys(UPA_ADMINS).find(
              uid => UPA_ADMINS[uid] === targetUpa
            )
          ])
        )
      },
      {
        label: "Daftar anggota",
        action: () => getDocs(
          query(collection(db, "upas", targetUpa, "anggota"), limit(1))
        )
      },
      {
        label: "Daftar binaan",
        action: () => getDocs(
          query(collection(db, "upas", targetUpa, "binaan"), limit(1))
        )
      },
      {
        label: "Daftar mutabaah",
        action: () => getDocs(
          query(collection(db, "upas", targetUpa, "mutabaah"), limit(1))
        )
      },
      {
        label: "Daftar kegiatan",
        action: () => getDocs(
          query(collection(db, "upas", targetUpa, "kegiatan"), limit(1))
        )
      },
      {
        label: "Daftar absensi",
        action: () => getDocs(
          query(collection(db, "upas", targetUpa, "absensi"), limit(1))
        )
      }
    ];

    for (const check of checks) {
      try {
        await check.action();
        results.push(
          "❌ GAGAL — " + check.label +
          ": Firestore mengizinkan pembacaan lintas-UPA."
        );
      } catch (error) {
        if (error.code === "permission-denied") {
          results.push("✅ LULUS — " + check.label + ": akses ditolak.");
        } else {
          results.push(
            "⚠️ BELUM DAPAT DINILAI — " +
            check.label + ": " + errorText(error)
          );
        }
      }
    }

    statusResult("Hasil Pengujian Isolasi Baca", results);
  } finally {
    testRunning = false;
    setButtonsDisabled(false);
  }
}

async function runWriteTests() {
  if (testRunning || !canRunTest()) return;

  testRunning = true;
  setButtonsDisabled(true);

  const targetUpa = otherUpa();
  const results = [];

  // ID tetap ini khusus pengujian. Pastikan belum ada dokumen
  // dengan ID tersebut sebelum menjalankan tes.
  const sentinelId = "__grupupa_security_test__";
  const targetRef = doc(
    db,
    "upas", targetUpa,
    "binaan", sentinelId
  );

  try {
    // Jangan pernah menyentuh dokumen anggota/binaan sebenarnya.
    const existing = await getDoc(targetRef);

    if (existing.exists()) {
      statusResult("Pengujian Dihentikan", [
        "Dokumen dengan ID pengujian sudah ada.",
        "Tidak ada perubahan yang dilakukan. Periksa dokumen tersebut secara manual."
      ]);
      return;
    }

    // Uji pembuatan menggunakan ID khusus.
    try {
      await setDoc(targetRef, {
        nama: "DOKUMEN UJI GRUPUPA",
        jenis: "grupupa_security_test",
        uidPenguji: currentUser.uid,
        upaAsal: currentUpaId
      });

      results.push(
        "❌ GAGAL — Pembuatan dokumen lintas-UPA diizinkan."
      );

      // Bersihkan hanya dokumen yang baru dibuat oleh tes ini.
      try {
        await deleteDoc(targetRef);
        results.push("Dokumen uji berhasil dibersihkan.");
      } catch (error) {
        results.push(
          "⚠️ Dokumen uji belum terhapus. Periksa: " +
          targetRef.path + " (" + errorText(error) + ")"
        );
      }
    } catch (error) {
      if (error.code === "permission-denied") {
        results.push("✅ LULUS — Pembuatan lintas-UPA ditolak.");
      } else {
        results.push(
          "⚠️ BELUM DAPAT DINILAI — Pembuatan: " +
          errorText(error)
        );
      }
    }

    // Uji update pada ID sentinel yang dipastikan belum ada.
    // Tidak mengubah dokumen nyata.
    try {
      await updateDoc(targetRef, {
        nama: "PERUBAHAN UJI"
      });

      results.push(
        "❌ GAGAL — Update lintas-UPA diizinkan."
      );
    } catch (error) {
      if (error.code === "permission-denied") {
        results.push("✅ LULUS — Update lintas-UPA ditolak.");
      } else {
        results.push(
          "⚠️ BELUM DAPAT DINILAI — Update: " +
          errorText(error)
        );
      }
    }

    // Uji delete pada ID sentinel, bukan data sebenarnya.
    try {
      await deleteDoc(targetRef);

      results.push(
        "⚠️ Operasi hapus selesai tanpa penolakan. " +
        "Perlu pemeriksaan lanjutan atas aturan dan keberadaan dokumen."
      );
    } catch (error) {
      if (error.code === "permission-denied") {
        results.push("✅ LULUS — Delete lintas-UPA ditolak.");
      } else {
        results.push(
          "⚠️ BELUM DAPAT DINILAI — Delete: " +
          errorText(error)
        );
      }
    }

    statusResult("Hasil Pengujian Isolasi Tulis", results);
  } finally {
    testRunning = false;
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  if ($("readIsolationBtn")) {
    $("readIsolationBtn").disabled =
      disabled || currentRole !== "admin_upa";
  }

  if ($("writeIsolationBtn")) {
    $("writeIsolationBtn").disabled =
      disabled || currentRole !== "admin_upa";
  }
}
