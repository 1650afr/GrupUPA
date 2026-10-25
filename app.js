
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
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const ROOT_UID = "5L0w42CRcgVVvqk47dF5vVXOQOV2";

const UPA_ADMINS = {
  "Qo8huhew52eEOPHO9TAOZrzd8lI2": "UPA001",
  "8tNL1G7bhjg9sUWrrtiM5YbB1tl1": "UPA002"
};

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let currentRole = "";
let currentUpaId = "";
let currentUpaData = null;

function formatError(error) {
  const code = error?.code || "";

  if (code.includes("permission-denied")) {
    return "Akses ditolak oleh Firestore Security Rules.";
  }

  if (code.includes("auth/invalid-credential")) {
    return "Email atau kata sandi salah.";
  }

  if (code.includes("auth/too-many-requests")) {
    return "Terlalu banyak percobaan login. Coba lagi nanti.";
  }

  if (code.includes("unavailable")) {
    return "Firebase tidak tersedia. Periksa koneksi internet.";
  }

  return error?.message || "Terjadi kesalahan yang tidak diketahui.";
}

function showMessage(message, type = "info", login = false) {
  const target = login ? $("loginMessage") : $("alertBox");

  if (!target) {
    console.log(message);
    return;
  }

  target.textContent = message;
  target.classList.remove("hidden");

  target.style.padding = "12px";
  target.style.borderRadius = "8px";

  if (type === "error") {
    target.style.background = "#fde8e8";
    target.style.color = "#9b1c1c";
  } else if (type === "success") {
    target.style.background = "#e6f4ea";
    target.style.color = "#166534";
  } else {
    target.style.background = "#e8f0fe";
    target.style.color = "#1e40af";
  }
}

function clearMessage() {
  const alert = $("alertBox");
  const login = $("loginMessage");

  if (alert) {
    alert.textContent = "";
    alert.classList.add("hidden");
  }

  if (login) {
    login.textContent = "";
  }
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value ?? "-";
}

function showLogin() {
  $("loginView")?.classList.remove("hidden");
  $("dashboardView")?.classList.add("hidden");
  $("logoutBtn")?.classList.add("hidden");
}

function showDashboard() {
  $("loginView")?.classList.add("hidden");
  $("dashboardView")?.classList.remove("hidden");
  $("logoutBtn")?.classList.remove("hidden");
}

function getName(profile, user) {
  return profile?.nama ||
    profile?.name ||
    profile?.displayName ||
    user?.displayName ||
    user?.email ||
    "Pengguna";
}

function getRole(profile, uid) {
  if (uid === ROOT_UID) return "admin_pusat";

  const role = String(profile?.role || profile?.peran || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (role.includes("admin_pusat")) return "admin_pusat";
  if (role.includes("admin_upa")) return "admin_upa";
  if (role.includes("pembina")) return "pembina";
  if (UPA_ADMINS[uid]) return "admin_upa";

  return role || "pengguna";
}

function roleLabel(role) {
  const labels = {
    admin_pusat: "Admin Pusat",
    admin_upa: "Admin UPA",
    pembina: "Pembina",
    murobby: "Murobby",
    murobbiyah: "Murobbiyah"
  };

  return labels[role] || role || "Pengguna";
}

function getStatus(profile) {
  if (profile?.aktif === false || profile?.status === "nonaktif") {
    return "Nonaktif";
  }

  return "Aktif";
}

async function loadProfile(user) {
  const snapshot = await getDoc(doc(db, "users", user.uid));

  if (!snapshot.exists()) {
    if (user.uid === ROOT_UID) {
      return {
        nama: user.displayName || "Admin Pusat",
        role: "admin_pusat"
      };
    }

    throw new Error(
      "Profil tidak ditemukan pada users/" + user.uid +
      ". Periksa dokumen profil di Firestore."
    );
  }

  const profile = snapshot.data();

  if (user.uid !== ROOT_UID && profile.aktif === false) {
    throw new Error("Akun berstatus nonaktif.");
  }

  return profile;
}

function ensureStyles() {
  if ($("grupupaExtraStyles")) return;

  const style = document.createElement("style");
  style.id = "grupupaExtraStyles";

  style.textContent = `
    .gu-panel {
      border: 1px solid #d9dee7;
      border-radius: 12px;
      padding: 16px;
      margin: 16px 0;
      background: white;
    }
    .gu-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit,minmax(220px,1fr));
      gap: 12px;
    }
    .gu-card {
      border: 1px solid #d9dee7;
      border-radius: 10px;
      padding: 14px;
      min-width: 0;
    }
    .gu-title {
      font-size: 18px;
      font-weight: 700;
      margin: 0 0 10px;
    }
    .gu-muted {
      color: #596579;
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .gu-button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      margin: 4px 4px 4px 0;
      cursor: pointer;
      background: #175cd3;
      color: white;
      font-weight: 600;
    }
    .gu-button.secondary {
      background: #475467;
    }
    .gu-button:disabled {
      opacity: .6;
      cursor: wait;
    }
    .gu-table-wrap {
      overflow-x: auto;
    }
    .gu-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    .gu-table th, .gu-table td {
      text-align: left;
      padding: 9px;
      border-bottom: 1px solid #e4e7ec;
      overflow-wrap: anywhere;
    }
    .gu-result {
      padding: 8px 10px;
      border-radius: 8px;
      margin: 6px 0;
      background: #f2f4f7;
      overflow-wrap: anywhere;
    }
    .gu-result.ok {
      background: #e6f4ea;
      color: #166534;
    }
    .gu-result.bad {
      background: #fde8e8;
      color: #9b1c1c;
    }
  `;

  document.head.appendChild(style);
}

function createSection(id, title, parent = $("dashboardView")) {
  let section = $(id);

  if (!section) {
    section = document.createElement("section");
    section.id = id;
    section.className = "gu-panel";
    parent?.appendChild(section);
  }

  section.replaceChildren();

  const heading = document.createElement("h3");
  heading.className = "gu-title";
  heading.textContent = title;
  section.appendChild(heading);

  return section;
}

function makeButton(label, callback, secondary = false) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "gu-button" + (secondary ? " secondary" : "");
  button.textContent = label;

  button.addEventListener("click", async () => {
    button.disabled = true;

    try {
      await callback(button);
    } catch (error) {
      showMessage(formatError(error), "error");
    } finally {
      button.disabled = false;
    }
  });

  return button;
}

function addLine(parent, text, className = "gu-muted") {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = String(text);
  parent.appendChild(element);
  return element;
}

function renderBaseDashboard() {
  ensureStyles();

  setText(
    "welcomeTitle",
    "Assalamu'alaikum, " + getName(currentProfile, currentUser)
  );

  setText("welcomeSubtitle", "Selamat datang di aplikasi GrupUPA.");
  setText("roleBadge", roleLabel(currentRole));
  setText("accountStatus", getStatus(currentProfile));

  setText(
    "upaName",
    currentRole === "admin_pusat"
      ? "Admin Pusat"
      : (currentUpaData?.nama || currentUpaData?.name || currentUpaId || "-")
  );

  setText(
    "upaIdLabel",
    currentRole === "admin_pusat" ? "Pilih UPA di bawah" : currentUpaId
  );

  const binaan = $("binaanList");

  if (binaan) {
    binaan.replaceChildren();
    binaan.textContent = currentRole === "admin_pusat"
      ? "Pilih UPA untuk melihat anggota dan data binaannya."
      : "Memuat data binaan...";
  }

  const testList = $("testList");

  if (testList) {
    testList.replaceChildren();

    [
      "Login Firebase berhasil",
      "Profil dan peran berhasil dibaca",
      "Akun: " + roleLabel(currentRole),
      "Dashboard berhasil dibuka"
    ].forEach((text) => {
      const li = document.createElement("li");
      li.textContent = "✅ " + text;
      testList.appendChild(li);
    });
  }
}

async function renderAdminPusatDashboard() {
  const section = createSection("guAdminPusatSection", "Panel Admin Pusat");

  addLine(
    section,
    "Pilih UPA untuk melihat informasi dan daftar anggota."
  );

  section.appendChild(makeButton("Muat ulang daftar UPA", loadUpaList, true));

  await loadUpaList();
}

async function loadUpaList() {
  const section = createSection("guUpaListSection", "Daftar UPA");
  addLine(section, "Pilih UPA yang ingin dibuka.");

  const list = document.createElement("div");
  list.className = "gu-grid";
  section.appendChild(list);

  try {
    const snapshot = await getDocs(collection(db, "upas"));

    if (snapshot.empty) {
      addLine(list, "Belum ada dokumen UPA di Firestore.");
      return;
    }

    const upas = snapshot.docs
      .map((item) => ({ id: item.id, data: item.data() }))
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const upa of upas) {
      const card = document.createElement("article");
      card.className = "gu-card";

      const title = document.createElement("h4");
      title.className = "gu-title";
      title.textContent = upa.data.nama || upa.data.name || upa.id;
      card.appendChild(title);

      addLine(card, "ID UPA: " + upa.id);

      if (upa.data.status) {
        addLine(card, "Status: " + upa.data.status);
      }

      card.appendChild(makeButton("Buka UPA", () => openSelectedUpa(upa.id)));
      list.appendChild(card);
    }
  } catch (error) {
    addLine(
      section,
      "Gagal memuat daftar UPA: " + formatError(error),
      "gu-result bad"
    );
  }
}

async function openSelectedUpa(upaId) {
  if (currentRole !== "admin_pusat") {
    throw new Error("Hanya Admin Pusat yang dapat memilih UPA.");
  }

  const section = createSection("guSelectedUpaSection", "Detail " + upaId);

  section.appendChild(
    makeButton("← Kembali ke daftar UPA", loadUpaList, true)
  );

  const snapshot = await getDoc(doc(db, "upas", upaId));

  if (!snapshot.exists()) {
    addLine(section, "Dokumen UPA tidak ditemukan.", "gu-result bad");
    return;
  }

  const data = snapshot.data();

  addLine(section, "Nama UPA: " + (data.nama || data.name || upaId));
  addLine(section, "ID UPA: " + upaId);

  if (data.status) addLine(section, "Status: " + data.status);

  const heading = document.createElement("h4");
  heading.className = "gu-title";
  heading.style.marginTop = "20px";
  heading.textContent = "Daftar Anggota";
  section.appendChild(heading);

  const wrap = document.createElement("div");
  wrap.className = "gu-table-wrap";
  section.appendChild(wrap);

  try {
    const members = await getDocs(
      collection(db, "upas", upaId, "anggota")
    );

    if (members.empty) {
      addLine(wrap, "Belum ada data anggota.");
    } else {
      const table = document.createElement("table");
      table.className = "gu-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");

      ["Nama", "Email", "Peran", "Status"].forEach((label) => {
        const th = document.createElement("th");
        th.textContent = label;
        headRow.appendChild(th);
      });

      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      members.docs
        .map((item) => ({ id: item.id, data: item.data() }))
        .sort((a, b) =>
          String(a.data.nama || a.data.name || a.id).localeCompare(
            String(b.data.nama || b.data.name || b.id)
          )
        )
        .forEach((member) => {
          const row = document.createElement("tr");

          const values = [
            member.data.nama || member.data.name || member.id,
            member.data.email || "-",
            member.data.role || member.data.peran || "-",
            member.data.aktif === false || member.data.status === "nonaktif"
              ? "Nonaktif"
              : (member.data.status || "Aktif")
          ];

          values.forEach((value) => {
            const td = document.createElement("td");
            td.textContent = String(value);
            row.appendChild(td);
          });

          tbody.appendChild(row);
        });

      table.appendChild(tbody);
      wrap.appendChild(table);
    }
  } catch (error) {
    addLine(
      wrap,
      "Gagal membaca anggota: " + formatError(error),
      "gu-result bad"
    );
  }

  await loadSelectedUpaBinaan(upaId);
}

async function loadSelectedUpaBinaan(upaId) {
  const section = createSection(
    "guSelectedBinaanSection",
    "Data Binaan " + upaId
  );

  try {
    const snapshot = await getDocs(
      collection(db, "upas", upaId, "binaan")
    );

    if (snapshot.empty) {
      addLine(section, "Belum ada data binaan.");
      return;
    }

    snapshot.docs.forEach((item) => {
      const data = item.data();

      addLine(
        section,
        (data.nama || data.name || "Binaan") + " · ID: " + item.id,
        "gu-result"
      );
    });
  } catch (error) {
    addLine(
      section,
      "Data binaan tidak dapat dibaca: " + formatError(error),
      "gu-result bad"
    );
  }
}

async function loadAdminUpaDashboard() {
  currentUpaId = UPA_ADMINS[currentUser.uid] || currentProfile.upaId || "";

  if (!currentUpaId) {
    throw new Error("ID UPA akun ini belum ditentukan.");
  }

  const snapshot = await getDoc(doc(db, "upas", currentUpaId));

  if (!snapshot.exists()) {
    throw new Error("Data " + currentUpaId + " tidak ditemukan.");
  }

  currentUpaData = snapshot.data();
  renderBaseDashboard();

  const section = createSection("guUpaDashboard", "Dashboard UPA");

  addLine(section, "Nama UPA: " + (currentUpaData.nama || currentUpaId));
  addLine(section, "ID UPA: " + currentUpaId);
  addLine(section, "Akun: " + (currentUser.email || currentUser.uid));

  section.appendChild(makeButton("Uji isolasi baca", runReadIsolationTest));
  section.appendChild(
    makeButton("Uji isolasi tulis", runWriteIsolationTest, true)
  );

  const binaanSection = createSection("guBinaanSection", "Data Binaan");

  try {
    const binaan = await getDocs(
      collection(db, "upas", currentUpaId, "binaan")
    );

    if (binaan.empty) {
      addLine(binaanSection, "Belum ada data binaan.");
    } else {
      binaan.docs.forEach((item) => {
        const data = item.data();
        addLine(
          binaanSection,
          (data.nama || data.name || "Binaan") + " · ID: " + item.id,
          "gu-result"
        );
      });
    }
  } catch (error) {
    addLine(
      binaanSection,
      "Gagal membaca binaan: " + formatError(error),
      "gu-result bad"
    );
  }
}

async function runReadIsolationTest() {
  const otherUpaId = currentUpaId === "UPA001" ? "UPA002" : "UPA001";
  const section = createSection("guReadTestResults", "Hasil Uji Isolasi Baca");
  let passed = 0;
  let total = 0;

  async function test(label, operation) {
    total++;

    try {
      await operation();
      addLine(
        section,
        "❌ " + label + ": akses berhasil, seharusnya ditolak.",
        "gu-result bad"
      );
    } catch (error) {
      if (error?.code === "permission-denied") {
        passed++;
        addLine(section, "✅ " + label + ": akses ditolak.", "gu-result ok");
      } else {
        addLine(
          section,
          "⚠️ " + label + ": " + formatError(error),
          "gu-result"
        );
      }
    }
  }

  await test("Dokumen UPA lain", () =>
    getDoc(doc(db, "upas", otherUpaId))
  );

  await test("Daftar anggota UPA lain", () =>
    getDocs(collection(db, "upas", otherUpaId, "anggota"))
  );

  await test("Daftar binaan UPA lain", () =>
    getDocs(collection(db, "upas", otherUpaId, "binaan"))
  );

  addLine(section, "Ditolak sesuai aturan: " + passed + " dari " + total);
}

async function runWriteIsolationTest() {
  const otherUpaId = currentUpaId === "UPA001" ? "UPA002" : "UPA001";
  const testRef = doc(
    db,
    "upas",
    otherUpaId,
    "binaan",
    "uji_keamanan_" + Date.now()
  );

  const section = createSection("guWriteTestResults", "Hasil Uji Isolasi Tulis");

  try {
    await setDoc(testRef, {
      nama: "DATA UJI KEAMANAN",
      dibuatOleh: currentUser.uid,
      dibuatPada: new Date().toISOString()
    });

    addLine(
      section,
      "❌ Pembuatan dokumen berhasil di UPA lain. Periksa Security Rules segera.",
      "gu-result bad"
    );

    try {
      await deleteDoc(testRef);
      addLine(section, "Data uji berhasil dibersihkan.", "gu-result");
    } catch {
      addLine(
        section,
        "PERHATIAN: data uji mungkin masih ada. Periksa Firestore.",
        "gu-result bad"
      );
    }
  } catch (error) {
    if (error?.code === "permission-denied") {
      addLine(
        section,
        "✅ Pembuatan dokumen di UPA lain ditolak.",
        "gu-result ok"
      );
    } else {
      addLine(
        section,
        "⚠️ Hasil tidak konklusif: " + formatError(error),
        "gu-result"
      );
    }
  }

  addLine(
    section,
    "Pengujian ini hanya menguji pembuatan dokumen, bukan semua operasi tulis."
  );
}

async function renderDashboard() {
  clearMessage();
  renderBaseDashboard();

  if (currentRole === "admin_pusat") {
    await renderAdminPusatDashboard();
    return;
  }

  if (currentRole === "admin_upa") {
    await loadAdminUpaDashboard();
    return;
  }

  const section = createSection("guRoleInfo", "Informasi Akun");

  addLine(section, "Peran akun: " + roleLabel(currentRole));
  addLine(
    section,
    "Dashboard untuk peran ini belum diaktifkan. Hubungi Admin Pusat."
  );
}

$("loginForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  const email = $("email")?.value?.trim();
  const password = $("password")?.value;
  const button = $("loginBtn");

  if (!email || !password) {
    showMessage("Masukkan email dan kata sandi.", "error", true);
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Memeriksa...";
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showMessage("Login gagal: " + formatError(error), "error", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Masuk";
    }
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    showMessage("Gagal keluar: " + formatError(error), "error");
  }
});

$("refreshBtn")?.addEventListener("click", async () => {
  try {
    clearMessage();

    if (currentRole === "admin_pusat") {
      await renderAdminPusatDashboard();
    } else if (currentRole === "admin_upa") {
      await loadAdminUpaDashboard();
    }

    showMessage("Permintaan muat ulang selesai.", "success");
  } catch (error) {
    showMessage("Gagal memuat ulang: " + formatError(error), "error");
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  currentProfile = null;
  currentRole = "";
  currentUpaId = "";
  currentUpaData = null;

  if (!user) {
    showLogin();
    clearMessage();

    const button = $("loginBtn");
    if (button) {
      button.disabled = false;
      button.textContent = "Masuk";
    }

    return;
  }

  showDashboard();
  clearMessage();

  try {
    currentProfile = await loadProfile(user);
    currentRole = getRole(currentProfile, user.uid);

    await renderDashboard();
  } catch (error) {
    showMessage(
      "Dashboard gagal dimuat: " + formatError(error),
      "error"
    );
  }
});
