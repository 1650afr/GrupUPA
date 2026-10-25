import { auth, db, firebaseConfig } from "./firebase.js";

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
  limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ROOT_UID = "5L0w42CRcgVVvqk47dF5vVXOQOV2";
const UPA_ID = "UPA001";

const $ = id => document.getElementById(id);
const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");

function setMessage(id, text, error = false) {
  const el = $(id);
  el.textContent = text;
  el.className = error ? "error" : "";
}

function test(n, icon, text) {
  const li = $("testList").children[n];
  if (li) li.textContent = icon + " " + text;
}

function showAlert(message) {
  const el = $("alertBox");
  el.textContent = message;
  el.style.whiteSpace = "pre-wrap";
  show(el);
}

function errorText(err) {
  return `${err?.code || "unknown"}: ${err?.message || "Kesalahan tidak diketahui"}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

// LOGIN
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  setMessage("loginMessage", "Sedang memeriksa akun...");
  $("loginBtn").disabled = true;

  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );
  } catch (err) {
    const messages = {
      "auth/invalid-credential": "Email atau kata sandi salah.",
      "auth/user-not-found": "Akun belum terdaftar.",
      "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
      "auth/network-request-failed": "Periksa koneksi internet.",
      "auth/unauthorized-domain": "Domain belum diizinkan di Firebase."
    };

    setMessage(
      "loginMessage",
      messages[err.code] || `Login gagal: ${errorText(err)}`,
      true
    );
  } finally {
    $("loginBtn").disabled = false;
  }
});

// LOGOUT
$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    setMessage("loginMessage", "Anda telah keluar.");
  } catch (err) {
    showAlert("Gagal keluar:\n" + errorText(err));
  }
});

// MUAT ULANG
$("refreshBtn").addEventListener("click", () => {
  if (auth.currentUser) load(auth.currentUser);
});

// STATUS AUTENTIKASI
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
  load(user);
});

async function load(user) {
  $("welcomeTitle").textContent = "Memeriksa profil...";
  $("welcomeSubtitle").textContent = user.email || user.uid;
  $("accountStatus").textContent = "Memeriksa...";
  $("upaName").textContent = "—";
  $("upaIdLabel").textContent = "";
  $("binaanList").textContent = "Menunggu pemeriksaan profil...";
  $("roleBadge").textContent = "";
  hide($("alertBox"));

  test(0, "✅", "Login Firebase berhasil");
  test(1, "🟡", "Memeriksa profil");
  test(2, "🟡", "Memeriksa data UPA");
  test(3, "🟡", "Memeriksa daftar binaan");

  const projectId = firebaseConfig.projectId;
  let profile = null;
  let role = "";
  let profilePath = "";

  try {
    if (user.uid === ROOT_UID) {
      profilePath = `users/${user.uid}`;

      const snap = await getDoc(doc(db, "users", user.uid));

      if (snap.exists()) {
        profile = snap.data();
        role = "admin_pusat";
      }
    } else {
      profilePath = `upas/${UPA_ID}/anggota/${user.uid}`;

      const snap = await getDoc(
        doc(db, "upas", UPA_ID, "anggota", user.uid)
      );

      if (snap.exists()) {
        profile = snap.data();
        role = profile.role || "";
      }
    }
  } catch (err) {
    test(1, "❌", "Pembacaan profil gagal");

    $("welcomeTitle").textContent = "Pemeriksaan profil gagal";
    $("roleBadge").textContent = "Belum terverifikasi";
    $("accountStatus").textContent = "Gagal membaca profil";
    $("binaanList").textContent = "Data tidak dimuat karena profil belum terverifikasi.";

    showAlert(
      "PEMBACAAN PROFIL GAGAL\n\n" +
      `Proyek Firebase: ${projectId}\n` +
      `UID login: ${user.uid}\n` +
      `Jalur profil: ${profilePath || "(belum ditentukan)"}\n` +
      `Error: ${errorText(err)}\n\n` +
      "Periksa izin baca dan konfigurasi. Jangan melonggarkan Security Rules."
    );

    test(2, "—", "Belum diuji");
    test(3, "—", "Belum diuji");
    return;
  }

  const validProfile =
    profile !== null &&
    role !== "" &&
    profile.aktif === true;

  if (!validProfile) {
    test(1, "❌", "Profil tidak valid atau tidak ditemukan");

    $("welcomeTitle").textContent = "Akun belum memiliki akses";
    $("roleBadge").textContent = "Akses ditolak";
    $("accountStatus").textContent = "Profil tidak valid";
    $("binaanList").textContent =
      "Data tidak dimuat karena profil belum terverifikasi.";

    const details = [
      "DIAGNOSTIK PROFIL",
      "",
      `Proyek Firebase: ${projectId}`,
      `UID login: ${user.uid}`,
      `Jalur profil: ${profilePath}`,
      `Dokumen ditemukan: ${profile !== null ? "Ya" : "Tidak"}`,
      `role: ${JSON.stringify(profile?.role ?? null)}`,
      `aktif: ${JSON.stringify(profile?.aktif ?? null)}`,
      `Tipe aktif: ${typeof profile?.aktif}`,
      `upaId: ${JSON.stringify(profile?.upaId ?? null)}`,
      "",
      "Tidak ada akses lanjutan diberikan."
    ].join("\n");

    showAlert(details);

    // Upaya diagnostik baca daftar ID anggota.
    // Jika Security Rules menolak operasi list, error ditampilkan.
    if (user.uid !== ROOT_UID) {
      try {
        const members = await getDocs(
          query(
            collection(db, "upas", UPA_ID, "anggota"),
            limit(50)
          )
        );

        const ids = members.docs.map(d => d.id);
        const found = ids.includes(user.uid);

        showAlert(
          details +
          "\n\nHASIL PEMERIKSAAN DAFTAR ANGGOTA" +
          `\nDaftar anggota dapat dibaca: Ya` +
          `\nJumlah dokumen dalam 50 hasil pertama: ${ids.length}` +
          `\nUID login ditemukan dalam hasil daftar: ${found ? "Ya" : "Tidak"}` +
          (ids.length
            ? "\nID dokumen yang terbaca:\n" + ids.join("\n")
            : "")
        );
      } catch (err) {
        showAlert(
          details +
          "\n\nPEMERIKSAAN DAFTAR ANGGOTA" +
          "\nTidak dapat membaca daftar anggota." +
          "\nError: " + errorText(err) +
          "\nOperasi daftar bisa memiliki izin berbeda dari pembacaan satu dokumen."
        );
      }
    }

    test(2, "—", "Belum diuji");
    test(3, "—", "Belum diuji");
    return;
  }

  test(1, "✅", "Profil ditemukan: " + role);

  $("welcomeTitle").textContent =
    "Selamat datang" + (profile.nama ? ", " + profile.nama : "");

  $("roleBadge").textContent =
    role === "admin_pusat"
      ? "Admin Pusat"
      : role === "admin_upa"
        ? "Admin UPA"
        : role;

  $("accountStatus").textContent = "Aktif";

  // BACA DATA UPA
  try {
    const upaSnap = await getDoc(doc(db, "upas", UPA_ID));

    if (upaSnap.exists()) {
      const upa = upaSnap.data();
      $("upaName").textContent = upa.nama || UPA_ID;
      $("upaIdLabel").textContent = "ID UPA: " + UPA_ID;
      test(2, "✅", `Data ${UPA_ID} berhasil dibaca`);
    } else {
      $("upaName").textContent = "Tidak ditemukan";
      test(2, "❌", "Dokumen UPA tidak ditemukan");
    }
  } catch (err) {
    test(2, "❌", "Pembacaan UPA gagal");
    showAlert(
      "Profil berhasil diverifikasi, tetapi data UPA gagal dibaca.\n" +
      errorText(err)
    );
  }

  // BACA DAFTAR BINAAN
  try {
    const snap = await getDocs(
      query(
        collection(db, "upas", UPA_ID, "binaan"),
        limit(50)
      )
    );

    let docs = snap.docs;

    if (role === "pembina") {
      docs = docs.filter(
        d => d.data().pembinaUid === user.uid
      );
    }

    $("binaanList").innerHTML = docs.length
      ? docs.map(d => `
          <article class="data-row">
            <div>
              <b>${escapeHTML(d.data().nama || "Tanpa nama")}</b>
              <small>ID: ${escapeHTML(d.id)}</small>
            </div>
          </article>
        `).join("")
      : "Belum ada data binaan atau belum ada binaan yang ditugaskan.";

    test(3, "✅", `Daftar binaan berhasil dibaca (${docs.length})`);
  } catch (err) {
    $("binaanList").textContent = "Gagal membaca binaan.";
    test(3, "❌", "Pembacaan binaan gagal");

    showAlert(
      "Pembacaan binaan gagal.\n" +
      errorText(err)
    );
  }
}
