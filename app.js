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
  $("alertBox").textContent = message;
  show($("alertBox"));
}

function errorMessage(err) {
  return `${err?.code || "error"}: ${err?.message || "Kesalahan tidak diketahui"}`;
}

// LOGIN
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  setMessage("loginMessage", "Sedang masuk...");
  $("loginBtn").disabled = true;

  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );
    setMessage("loginMessage", "Login berhasil. Memeriksa profil...");
  } catch (err) {
    const messages = {
      "auth/invalid-credential": "Email atau kata sandi salah.",
      "auth/user-not-found": "Akun belum terdaftar.",
      "auth/too-many-requests": "Terlalu banyak percobaan. Tunggu sebentar.",
      "auth/network-request-failed": "Periksa koneksi internet.",
      "auth/unauthorized-domain":
        "Domain belum diizinkan di Firebase Authentication."
    };

    setMessage(
      "loginMessage",
      messages[err.code] || `Login gagal: ${errorMessage(err)}`,
      true
    );
  } finally {
    $("loginBtn").disabled = false;
  }
});

// LOGOUT DAN PERIKSA ULANG
$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    setMessage("loginMessage", "Anda sudah keluar.");
  } catch (err) {
    showAlert("Gagal keluar: " + errorMessage(err));
  }
});

$("refreshBtn").addEventListener("click", () => {
  if (auth.currentUser) load(auth.currentUser);
});

// STATUS LOGIN
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

// PEMERIKSAAN PROFIL DAN DATA
async function load(user) {
  $("welcomeTitle").textContent = "Memeriksa profil...";
  $("welcomeSubtitle").textContent = user.email || user.uid;
  $("binaanList").textContent = "Memeriksa data...";
  $("alertBox").textContent = "";
  hide($("alertBox"));

  test(0, "✅", "Login Firebase berhasil");
  test(1, "🟡", "Memeriksa profil");
  test(2, "🟡", "Memeriksa data UPA");
  test(3, "🟡", "Memeriksa daftar binaan");

  try {
    let profile = null;
    let role = "";
    let profilePath = "";

    if (user.uid === ROOT_UID) {
      profilePath = `users/${user.uid}`;

      const snap = await getDoc(doc(db, "users", user.uid));

      if (snap.exists()) {
        profile = snap.data();
        role = "admin_pusat";
      }
    } else {
      profilePath =
        `upas/${UPA_ID}/anggota/${user.uid}`;

      const snap = await getDoc(
        doc(db, "upas", UPA_ID, "anggota", user.uid)
      );

      if (snap.exists()) {
        profile = snap.data();
        role = profile.role || "";
      }

      // Diagnostik ditampilkan di halaman, bukan hanya di konsol.
      console.info("Diagnostik profil GrupUPA", {
        uidLogin: user.uid,
        jalurProfil: profilePath,
        dokumenDitemukan: snap.exists(),
        role: profile?.role ?? null,
        aktif: profile?.aktif ?? null,
        tipeAktif: typeof profile?.aktif,
        upaId: profile?.upaId ?? null
      });
    }

    // Profil wajib ditemukan dan aktif.
    const valid =
      !!profile &&
      !!role &&
      profile.aktif === true;

    if (!valid) {
      test(1, "❌", "Profil tidak valid");

      $("welcomeTitle").textContent = "Akun belum memiliki akses";
      $("roleBadge").textContent = "Akses ditolak";
      $("accountStatus").textContent = "Profil tidak valid";

      const diagnostic = profile
        ? [
            `UID login: ${user.uid}`,
            `Jalur profil: ${profilePath}`,
            `Dokumen ditemukan: Ya`,
            `role: ${JSON.stringify(profile.role ?? null)}`,
            `aktif: ${JSON.stringify(profile.aktif ?? null)}`,
            `Tipe aktif: ${typeof profile.aktif}`,
            `upaId: ${JSON.stringify(profile.upaId ?? null)}`
          ].join("\n")
        : [
            `UID login: ${user.uid}`,
            `Jalur profil: ${profilePath}`,
            "Dokumen ditemukan: Tidak"
          ].join("\n");

      $("binaanList").textContent =
        "Pemeriksaan dihentikan. Tidak ada data lanjutan yang dibaca.";

      showAlert(
        "PROFIL TIDAK VALID\n\n" +
        diagnostic +
        "\n\nPeriksa hasil di atas. Jangan mengubah Security Rules."
      );

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

    // Baca dokumen UPA
    try {
      const upaSnap = await getDoc(doc(db, "upas", UPA_ID));

      if (upaSnap.exists()) {
        const upa = upaSnap.data();

        $("upaName").textContent = upa.nama || UPA_ID;
        $("upaIdLabel").textContent = "ID UPA: " + UPA_ID;

        test(2, "✅", "Data " + UPA_ID + " berhasil dibaca");
      } else {
        $("upaName").textContent = "Tidak ditemukan";
        $("upaIdLabel").textContent = "ID UPA: " + UPA_ID;

        test(2, "❌", "Dokumen UPA tidak ditemukan");
      }
    } catch (err) {
      test(2, "❌", "Gagal membaca data UPA");

      showAlert(
        "Profil valid, tetapi pembacaan dokumen UPA gagal.\n\n" +
        errorMessage(err)
      );
    }

    // Baca daftar binaan
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
                <b>${esc(d.data().nama || "Tanpa nama")}</b>
                <small>ID: ${esc(d.id)}</small>
              </div>
            </article>
          `).join("")
        : "Belum ada data binaan atau belum ada binaan yang ditugaskan.";

      test(3, "✅", `Daftar binaan berhasil dibaca (${docs.length})`);
    } catch (err) {
      $("binaanList").textContent =
        "Gagal membaca binaan. Periksa izin akses.";

      test(3, "❌", "Pembacaan binaan gagal");

      showAlert(
        "Pembacaan binaan gagal.\n\n" + errorMessage(err)
      );
    }
  } catch (err) {
    test(1, "❌", "Pemeriksaan profil gagal");

    $("welcomeTitle").textContent = "Pemeriksaan belum selesai";
    $("accountStatus").textContent = "Gagal memeriksa profil";
    $("binaanList").textContent = "Pemeriksaan dihentikan.";

    showAlert(
      "Gagal memeriksa profil atau membaca Firestore.\n\n" +
      errorMessage(err)
    );
  }
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}
