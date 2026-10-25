
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
const UPA_TEST_UID = "8tNL1G7bhjg9sUWrrtiM5YbB1tl1";
const KNOWN_UPAS = ["UPA001", "UPA002"];

const $ = id => document.getElementById(id);
const show = el => el?.classList.remove("hidden");
const hide = el => el?.classList.add("hidden");

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

$("logoutBtn")?.addEventListener("click", () => signOut(auth));

$("refreshBtn")?.addEventListener("click", () => {
  if (auth.currentUser) loadDashboard(auth.currentUser);
});

onAuthStateChanged(auth, user => {
  if (!user) {
    show($("loginView"));
    hide($("dashboardView"));
    hide($("logoutBtn"));
    return;
  }

  hide($("loginView"));
  show($("dashboardView"));
  show($("logoutBtn"));
  loadDashboard(user);
});

async function findMemberProfile(user) {
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
      if (error.code === "permission-denied") continue;
      throw error;
    }
  }

  return {
    error:
      "Profil tidak ditemukan pada UPA yang dikonfigurasi. " +
      "Periksa ID dokumen, nama koleksi, dan Security Rules."
  };
}

async function loadDashboard(user) {
  $("welcomeTitle").textContent = "Memuat profil…";
  $("welcomeSubtitle").textContent = user.email || user.uid;
  $("upaName").textContent = "—";
  $("upaIdLabel").textContent = "";
  $("accountStatus").textContent = "Memeriksa…";
  $("binaanList").textContent = "Memuat data…";

  hide($("alertBox"));
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

      if (!snap.exists()) {
        throw new Error("Profil Admin Pusat tidak ditemukan.");
      }

      profile = snap.data();
      role = "admin_pusat";
    } else {
      const result = await findMemberProfile(user);

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
      setTest(2, "✅", "Profil Admin Pusat berhasil dibaca");
      $("binaanList").textContent =
        "Dashboard awal. Pilih UPA setelah fitur administrasi pusat tersedia.";
      setTest(3, "ℹ️", "Daftar binaan belum dimuat");
      return;
    }

    const upaSnap = await getDoc(doc(db, "upas", upaId));

    if (!upaSnap.exists()) {
      throw new Error(`Dokumen upas/${upaId} tidak ditemukan.`);
    }

    const upaData = upaSnap.data();
    $("upaName").textContent = upaData.nama || upaId;
    $("upaIdLabel").textContent = `ID UPA: ${upaId}`;

    setTest(2, "✅", `Data ${upaId} berhasil dibaca`);

    try {
      const snap = await getDocs(
        query(collection(db, "upas", upaId, "binaan"), limit(50))
      );

      let items = snap.docs;

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
    }

    if (user.uid === UPA_TEST_UID) {
      await runIsolationTest();
    }
  } catch (error) {
    $("welcomeTitle").textContent = "Akun belum memiliki akses";
    $("roleBadge").textContent = "Akses ditolak";
    $("accountStatus").textContent = "Periksa profil";
    $("upaName").textContent = "—";
    $("upaIdLabel").textContent = "";
    $("binaanList").textContent = error.message;

    setTest(1, "❌", "Profil tidak valid atau tidak dapat dibaca");
    setTest(2, "—", "Belum berhasil diuji");
    setTest(3, "—", "Belum berhasil diuji");

    show($("alertBox"));
    $("alertBox").textContent = error.message;
  }
}

function removeIsolationPanel() {
  document.getElementById("isolationTestResult")?.remove();
}

async function runIsolationTest() {
  const results = [];

  async function check(label, operation) {
    try {
      await operation();
      results.push({
        label,
        status: "GAGAL",
        detail: "Akses berhasil, padahal seharusnya ditolak."
      });
    } catch (error) {
      if (error.code === "permission-denied") {
        results.push({
          label,
          status: "LULUS",
          detail: "Firestore menolak akses."
        });
      } else {
        results.push({
          label,
          status: "BELUM PASTI",
          detail: error.code || error.message
        });
      }
    }
  }

  await check("Membaca dokumen UPA001", async () => {
    await getDoc(doc(db, "upas", "UPA001"));
  });

  await check("Membaca profil Admin UPA001", async () => {
    await getDoc(
      doc(db, "upas", "UPA001", "anggota",
        "Qo8huhew52eEOPHO9TAOZrzd8lI2")
    );
  });

  await check("Membaca daftar anggota UPA001", async () => {
    await getDocs(
      query(collection(db, "upas", "UPA001", "anggota"), limit(1))
    );
  });

  let panel = document.getElementById("isolationTestResult");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "isolationTestResult";
    panel.className = "panel";
    $("dashboardView").appendChild(panel);
  }

  panel.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Pengujian Isolasi UPA002";
  panel.appendChild(heading);

  const intro = document.createElement("p");
  intro.textContent =
    "Pengujian baca-saja. Tidak ada dokumen yang diubah atau dihapus.";
  panel.appendChild(intro);

  results.forEach(result => {
    const p = document.createElement("p");
    p.textContent = `${result.status} — ${result.label}: ${result.detail}`;
    panel.appendChild(p);
  });

  const allPassed = results.every(item => item.status === "LULUS");
  const summary = document.createElement("p");
  summary.textContent = allPassed
    ? "Ketiga percobaan akses lintas-UPA ditolak."
    : "Pengujian belum seluruhnya lulus. Periksa hasil setiap baris.";
  panel.appendChild(summary);
}
