
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

const $ = id => document.getElementById(id);

const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");

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
  $("loginBtn").disabled = true;

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
    $("loginBtn").disabled = false;
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
});

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

async function loadDashboard(user) {
  $("welcomeTitle").textContent = "Memuat profil…";
  $("welcomeSubtitle").textContent = user.email || user.uid;
  $("upaName").textContent = "Memeriksa akses…";
  $("upaIdLabel").textContent = "";
  $("accountStatus").textContent = "Memeriksa…";
  $("binaanList").textContent = "Memuat data…";

  hide($("alertBox"));

  setTest(0, "✅", "Login Firebase berhasil");
  setTest(1, "🟡", "Mencari profil anggota");
  setTest(2, "🟡", "Memeriksa data UPA");
  setTest(3, "🟡", "Memeriksa daftar binaan");

  try {
    let profile = null;
    let role = "";
    let upaId = "";

    if (user.uid === ROOT_UID) {
      const rootDoc = await getDoc(doc(db, "users", user.uid));

      if (!rootDoc.exists()) {
        throw new Error("Profil Admin Pusat tidak ditemukan di users.");
      }

      profile = rootDoc.data();
      role = "admin_pusat";
    } else {
      /*
       * Daftar UPA yang diizinkan untuk dicoba.
       * Penambahan UPA baru di sini bukan pemberian izin:
       * Firestore Security Rules tetap menentukan akses.
       */
      const knownUpaIds = ["UPA001", "UPA002"];

      for (const candidateUpaId of knownUpaIds) {
        try {
          const memberDoc = await getDoc(
            doc(db, "upas", candidateUpaId, "anggota", user.uid)
          );

          if (memberDoc.exists()) {
            const candidateProfile = memberDoc.data();

            if (candidateProfile.aktif === true) {
              profile = candidateProfile;
              role = candidateProfile.role || "";
              upaId = candidateUpaId;
              break;
            }
          }
        } catch (error) {
          if (error.code !== "permission-denied") throw error;
        }
      }

      if (!profile) {
        throw new Error(
          "Profil aktif tidak ditemukan pada UPA yang dikonfigurasi. " +
          "Periksa ID dokumen anggota, nama koleksi, dan Security Rules."
        );
      }
    }

    if (role !== "admin_pusat" && role !== "admin_upa" && role !== "pembina") {
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

      setTest(2, "✅", "Profil Admin Pusat ditemukan");
      $("binaanList").textContent =
        "Pilih UPA tertentu untuk melihat data binaannya.";
      setTest(3, "ℹ️", "Data binaan belum dipilih");
      return;
    }

    const upaDoc = await getDoc(doc(db, "upas", upaId));

    if (!upaDoc.exists()) {
      throw new Error(`Dokumen upas/${upaId} tidak ditemukan.`);
    }

    const upaData = upaDoc.data();

    $("upaName").textContent = upaData.nama || upaId;
    $("upaIdLabel").textContent = `ID UPA: ${upaId}`;

    setTest(2, "✅", `Data ${upaId} berhasil dibaca`);

    try {
      const binaanQuery = query(
        collection(db, "upas", upaId, "binaan"),
        limit(50)
      );

      const binaanSnapshot = await getDocs(binaanQuery);

      let binaanDocs = binaanSnapshot.docs;

      if (role === "pembina") {
        binaanDocs = binaanDocs.filter(
          item => item.data().pembinaUid === user.uid
        );
      }

      if (binaanDocs.length === 0) {
        $("binaanList").textContent =
          "Belum ada data binaan atau belum ada binaan yang ditugaskan.";
      } else {
        $("binaanList").innerHTML = binaanDocs.map(item => {
          const data = item.data();

          return `
            <article class="data-row">
              <div>
                <b>${escapeHTML(data.nama || "Tanpa nama")}</b>
                <small>ID: ${escapeHTML(item.id)}</small>
              </div>
            </article>
          `;
        }).join("");
      }

      setTest(
        3,
        "✅",
        `Daftar binaan ${upaId} berhasil dibaca (${binaanDocs.length})`
      );
    } catch (error) {
      $("binaanList").textContent =
        "Belum dapat membaca daftar binaan. Periksa izin akses.";

      setTest(
        3,
        "❌",
        `Akses binaan gagal: ${error.code || error.message}`
      );

      show($("alertBox"));
      $("alertBox").textContent =
        `Pembacaan binaan ${upaId} gagal: ${error.code || error.message}`;
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
