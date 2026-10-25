
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
  limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ROOT_UID = "5L0w42CRcgVVvqk47dF5vVXOQOV2";
const UPA001_ADMIN_UID = "Qo8huhew52eEOPHO9TAOZrzd8lI2";
const UPA002_ADMIN_UID = "8tNL1G7bhjg9sUWrrtiM5YbB1tl1";
const KNOWN_UPAS = ["UPA001", "UPA002"];

const $ = id => document.getElementById(id);
const show = el => el?.classList.remove("hidden");
const hide = el => el?.classList.add("hidden");

let currentLoadId = 0;

function setMessage(id, message, error = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.className = error ? "error" : "";
}

function setTest(index, icon, message) {
  const el = $("testList")?.children[index];
  if (el) el.textContent = `${icon} ${message}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
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

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage("loginMessage", "Memeriksa akun…");

  if ($("loginBtn")) $("loginBtn").disabled = true;

  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );
    setMessage("loginMessage", "Login berhasil. Memuat profil…");
  } catch (error) {
    const messages = {
      "auth/invalid-credential": "Email atau kata sandi salah.",
      "auth/user-not-found": "Akun belum terdaftar.",
      "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
      "auth/network-request-failed": "Periksa koneksi internet."
    };

    setMessage(
      "loginMessage",
      messages[error.code] || `Login gagal: ${error.code || error.message}`,
      true
    );
  } finally {
    if ($("loginBtn")) $("loginBtn").disabled = false;
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    showAlert(`Gagal keluar: ${error.code || error.message}`);
  }
});

$("refreshBtn")?.addEventListener("click", () => {
  if (auth.currentUser) loadDashboard(auth.currentUser);
});

onAuthStateChanged(auth, user => {
  currentLoadId++;

  if (!user) {
    show($("loginView"));
    hide($("dashboardView"));
    hide($("logoutBtn"));
    removeIsolationPanel();
    return;
  }

  hide($("loginView"));
  show($("dashboardView"));
  show($("logoutBtn"));

  loadDashboard(user);
});

async function findMemberProfile(user) {
  let permissionDeniedCount = 0;

  for (const upaId of KNOWN_UPAS) {
    try {
      const snap = await getDoc(
        doc(db, "upas", upaId, "anggota", user.uid)
      );

      if (!snap.exists()) continue;

      const profile = snap.data();

      if (profile.aktif !== true) {
        return {
          error: `Akun pada ${upaId} ditemukan tetapi tidak aktif.`
        };
      }

      return { profile, upaId };
    } catch (error) {
      if (error.code === "permission-denied") {
        permissionDeniedCount++;
        continue;
      }

      throw error;
    }
  }

  return {
    error: permissionDeniedCount === KNOWN_UPAS.length
      ? "Profil tidak dapat dibaca pada UPA yang dikonfigurasi. " +
        "Periksa jalur dokumen dan Security Rules."
      : "Profil anggota tidak ditemukan. Periksa UID, nama koleksi, " +
        "dan ID UPA."
  };
}

async function loadDashboard(user) {
  const loadId = ++currentLoadId;

  $("welcomeTitle").textContent = "Memuat profil…";
  $("welcomeSubtitle").textContent = user.email || user.uid;
  $("upaName").textContent = "—";
  $("upaIdLabel").textContent = "";
  $("accountStatus").textContent = "Memeriksa…";
  $("binaanList").textContent = "Memuat data…";

  clearAlert();
  removeIsolationPanel();

  setTest(0, "✅", "Login Firebase berhasil");
  setTest(1, "🟡", "Memeriksa profil dan peran");
  setTest(2, "🟡", "Memeriksa data UPA");
  setTest(3, "🟡", "Memeriksa daftar binaan");

  try {
    let profile;
    let role;
    let upaId = "";

    if (user.uid === ROOT_UID) {
      const snap = await getDoc(doc(db, "users", user.uid));

      if (loadId !== currentLoadId) return;

      if (!snap.exists()) {
        throw new Error("Profil Admin Pusat tidak ditemukan.");
      }

      profile = snap.data();
      role = "admin_pusat";
    } else {
      const result = await findMemberProfile(user);

      if (loadId !== currentLoadId) return;

      if (!result.profile) {
        throw new Error(result.error);
      }

      profile = result.profile;
      role = profile.role || "";
      upaId = result.upaId;
    }

    if (
      role !== "admin_pusat" &&
      role !== "admin_upa" &&
      role !== "pembina"
    ) {
      throw new Error("Peran akun tidak dikenal atau tidak diizinkan.");
    }

    setTest(1, "✅", `Profil ditemukan: ${role}`);

    $("welcomeTitle").textContent =
      "Selamat datang" + (profile.nama ? `, ${profile.nama}` : "");

    $("roleBadge").textContent =
      role === "admin_pusat"
        ? "Admin Pusat"
        : role === "admin_upa"
          ? "Admin UPA"
          : "Pembina";

    $("accountStatus").textContent = "Aktif";

    if (role === "admin_pusat") {
      $("upaName").textContent = "Admin Pusat";
      $("upaIdLabel").textContent = "Akses tingkat pusat";
      $("binaanList").textContent =
        "Dashboard Admin Pusat. Fitur pemilihan UPA akan dibuat pada tahap berikutnya.";

      setTest(2, "ℹ️", "Profil pusat berhasil dibaca");
      setTest(3, "ℹ️", "Daftar binaan belum dimuat");
      return;
    }

    const upaSnap = await getDoc(doc(db, "upas", upaId));

    if (loadId !== currentLoadId) return;

    if (!upaSnap.exists()) {
      throw new Error(`Dokumen upas/${upaId} tidak ditemukan.`);
    }

    const upaData = upaSnap.data();
    $("upaName").textContent = upaData.nama || upaId;
    $("upaIdLabel").textContent = `ID UPA: ${upaId}`;

    setTest(2, "✅", `Data ${upaId} berhasil dibaca`);

    try {
      const binaanSnap = await getDocs(
        query(collection(db, "upas", upaId, "binaan"), limit(50))
      );

      if (loadId !== currentLoadId) return;

      let items = binaanSnap.docs;

      if (role === "pembina") {
        items = items.filter(
          item => item.data().pembinaUid === user.uid
        );
      }

      $("binaanList").innerHTML = items.length
        ? items.map(item => `
            <article class="data-row">
              <div>
                <b>${escapeHTML(item.data().nama || "Tanpa nama")}</b>
                <small>ID: ${escapeHTML(item.id)}</small>
              </div>
            </article>
          `).join("")
        : "Belum ada data binaan atau belum ada binaan yang ditugaskan.";

      setTest(3, "✅", `Daftar binaan berhasil dibaca (${items.length})`);
    } catch (error) {
      $("binaanList").textContent =
        "Pembacaan binaan gagal. Periksa izin akses.";

      setTest(3, "❌", `Akses binaan gagal: ${error.code || error.message}`);
      showAlert(`Pembacaan binaan gagal: ${error.code || error.message}`);
    }

    if (
      user.uid === UPA001_ADMIN_UID ||
      user.uid === UPA002_ADMIN_UID
    ) {
      await runIsolationTest(user, upaId, loadId);
    }
  } catch (error) {
    if (loadId !== currentLoadId) return;

    $("welcomeTitle").textContent = "Akun belum memiliki akses";
    $("roleBadge").textContent = "Akses ditolak";
    $("accountStatus").textContent = "Periksa profil";
    $("upaName").textContent = "—";
    $("upaIdLabel").textContent = "";
    $("binaanList").textContent = error.message;

    setTest(1, "❌", "Profil tidak valid atau tidak dapat dibaca");
    setTest(2, "—", "Belum berhasil diuji");
    setTest(3, "—", "Belum berhasil diuji");

    showAlert(error.message);
  }
}

function removeIsolationPanel() {
  document.getElementById("isolationTestResult")?.remove();
}

async function runIsolationTest(user, ownUpaId, loadId) {
  const targetUPA = ownUpaId === "UPA001" ? "UPA002" : "UPA001";

  const targetAdminUID = targetUPA === "UPA001"
    ? UPA001_ADMIN_UID
    : UPA002_ADMIN_UID;

  const results = [];

  async function check(label, operation) {
    try {
      await operation();

      results.push({
        status: "GAGAL",
        label,
        detail: "Akses berhasil. Periksa apakah aturan mengizinkan akses ini."
      });
    } catch (error) {
      if (error.code === "permission-denied") {
        results.push({
          status: "LULUS",
          label,
          detail: "Firestore menolak akses."
        });
      } else {
        results.push({
          status: "BELUM PASTI",
          label,
          detail: error.code || error.message
        });
      }
    }
  }

  await check(`Membaca dokumen ${targetUPA}`, async () => {
    await getDoc(doc(db, "upas", targetUPA));
  });

  if (loadId !== currentLoadId || auth.currentUser?.uid !== user.uid) return;

  await check(`Membaca profil Admin ${targetUPA}`, async () => {
    await getDoc(
      doc(db, "upas", targetUPA, "anggota", targetAdminUID)
    );
  });

  if (loadId !== currentLoadId || auth.currentUser?.uid !== user.uid) return;

  await check(`Membaca daftar anggota ${targetUPA}`, async () => {
    await getDocs(
      query(
        collection(db, "upas", targetUPA, "anggota"),
        limit(1)
      )
    );
  });

  if (loadId !== currentLoadId || auth.currentUser?.uid !== user.uid) return;

  let panel = document.getElementById("isolationTestResult");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "isolationTestResult";
    panel.className = "panel";
    $("dashboardView").appendChild(panel);
  }

  panel.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = `Pengujian Isolasi ${ownUpaId} → ${targetUPA}`;
  panel.appendChild(heading);

  const intro = document.createElement("p");
  intro.textContent =
    "Pemeriksaan baca-saja. Tidak ada dokumen yang dibuat, diubah, atau dihapus.";
  panel.appendChild(intro);

  results.forEach(result => {
    const p = document.createElement("p");
    p.textContent = `${result.status} — ${result.label}: ${result.detail}`;
    panel.appendChild(p);
  });

  const summary = document.createElement("p");
  summary.textContent = results.every(item => item.status === "LULUS")
    ? "Ketiga percobaan akses lintas-UPA ditolak."
    : "Pengujian belum seluruhnya lulus. Periksa hasil setiap baris.";

  panel.appendChild(summary);
}
