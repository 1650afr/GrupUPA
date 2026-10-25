
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const loginView = $("loginView");
const dashboardView = $("dashboardView");
const alertBox = $("alertBox");

function showMessage(message, type = "info") {
  if (!alertBox) {
    alert(message);
    return;
  }

  alertBox.textContent = message;
  alertBox.style.display = "block";
  alertBox.style.padding = "12px";
  alertBox.style.margin = "12px 0";
  alertBox.style.borderRadius = "8px";
  alertBox.style.background =
    type === "error" ? "#fde8e8" :
    type === "success" ? "#e6f4ea" : "#e8f0fe";
  alertBox.style.color =
    type === "error" ? "#9b1c1c" :
    type === "success" ? "#166534" : "#1e40af";
}

function clearMessage() {
  if (alertBox) {
    alertBox.textContent = "";
    alertBox.style.display = "none";
  }
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "-";
}

function showLogin() {
  if (loginView) loginView.style.display = "";
  if (dashboardView) dashboardView.style.display = "none";
}

function showDashboard() {
  if (loginView) loginView.style.display = "none";
  if (dashboardView) dashboardView.style.display = "";
}

function getName(profile, user) {
  return profile?.nama ||
    profile?.name ||
    profile?.displayName ||
    user?.displayName ||
    user?.email ||
    "Pengguna";
}

function getStatus(profile) {
  if (profile?.aktif === false || profile?.status === "nonaktif") {
    return "Nonaktif";
  }
  return "Aktif";
}

function getRole(profile, uid) {
  if (uid === ROOT_UID) return "admin_pusat";

  const role = String(profile?.role || profile?.peran || "").toLowerCase();

  if (role.includes("admin_pusat") || role.includes("admin pusat")) {
    return "admin_pusat";
  }

  if (role.includes("admin_upa") || role.includes("admin upa")) {
    return "admin_upa";
  }

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

function ensureExtraStyles() {
  if ($("grupupaExtraStyles")) return;

  const style = document.createElement("style");
  style.id = "grupupaExtraStyles";
  style.textContent = `
    .gu-panel { border:1px solid #d9dee7; border-radius:12px; padding:16px; margin:16px 0; background:#fff; }
    .gu-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
    .gu-card { border:1px solid #d9dee7; border-radius:10px; padding:14px; min-width:0; }
    .gu-title { font-size:18px; font-weight:700; margin:0 0 10px; }
    .gu-muted { color:#596579; font-size:13px; overflow-wrap:anywhere; }
    .gu-button { border:0; border-radius:8px; padding:10px 14px; margin:4px 4px 4px 0; cursor:pointer; background:#175cd3; color:white; font-weight:600; }
    .gu-button.secondary { background:#475467; }
    .gu-button:disabled { opacity:.6; cursor:wait; }
    .gu-table-wrap { overflow-x:auto; }
    .gu-table { width:100%; border-collapse:collapse; margin-top:10px; }
    .gu-table th,.gu-table td { text-align:left; padding:9px; border-bottom:1px solid #e4e7ec; overflow-wrap:anywhere; }
    .gu-result { padding:8px 10px; border-radius:8px; margin:6px 0; background:#f2f4f7; overflow-wrap:anywhere; }
    .gu-result.ok { background:#e6f4ea; color:#166534; }
    .gu-result.bad { background:#fde8e8; color:#9b1c1c; }
  `;
  document.head.appendChild(style);
}

function createSection(id, title, parent = dashboardView) {
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
  button.addEventListener("click", callback);
  return button;
}

function addLine(parent, text, className = "gu-muted") {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function formatError(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) {
    return "Akses ditolak oleh Firestore Security Rules.";
  }
  if (code.includes("unavailable")) {
    return "Firebase tidak tersedia. Periksa koneksi internet.";
  }
  return error?.message || "Terjadi kesalahan yang tidak diketahui.";
}

async function loadProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    if (user.uid === ROOT_UID) {
      return {
        nama: user.displayName || "Admin Pusat",
        role: "admin_pusat"
      };
    }

    throw new Error(
      "Profil akun tidak ditemukan pada users/" + user.uid +
      ". Periksa data profil di Firestore."
    );
  }

  const profile = snapshot.data();

  if (user.uid !== ROOT_UID && profile.aktif === false) {
    throw new Error("Akun ini berstatus nonaktif.");
  }

  return profile;
}

function renderBaseDashboard() {
  ensureExtraStyles();

  const name = getName(currentProfile, currentUser);

  setText("welcomeTitle", "Assalamu'alaikum, " + name);
  setText("welcomeSubtitle", "Selamat datang di aplikasi GrupUPA.");
  setText("roleBadge", roleLabel(currentRole));
  setText("accountStatus", getStatus(currentProfile));

  if ($("upaName")) {
    $("upaName").textContent = currentRole === "admin_pusat"
      ? "Admin Pusat"
      : (currentUpaData?.nama || currentUpaData?.name || currentUpaId || "-");
  }

  setText("upaIdLabel", currentRole === "admin_pusat" ? "Pusat" : currentUpaId);

  const binaanList = $("binaanList");
  if (binaanList) {
    binaanList.replaceChildren();
    const li = document.createElement("li");
    li.textContent = currentRole === "admin_pusat"
      ? "Pilih UPA untuk melihat data anggota."
      : "Data binaan akan ditampilkan jika tersedia.";
    binaanList.appendChild(li);
  }

  const testList = $("testList");
  if (testList) {
    testList.replaceChildren();

    const checks = [
      "Login berhasil",
      "Profil dan peran berhasil dibaca",
      currentRole === "admin_pusat"
        ? "Akun Admin Pusat dikenali"
        : "Data UPA berhasil dibaca",
      "Dashboard siap digunakan"
    ];

    for (const item of checks) {
      const li = document.createElement("li");
      li.textContent = "✅ " + item;
      testList.appendChild(li);
    }
  }
}

async function loadAdminUpaDashboard() {
  currentUpaId = UPA_ADMINS[currentUser.uid] || currentProfile.upaId || "";

  if (!currentUpaId) {
    showMessage(
      "ID UPA akun ini belum ditentukan. Periksa field upaId pada profil atau daftar UPA_ADMINS.",
      "error"
    );
    return;
  }

  const upaSnap = await getDoc(doc(db, "upas", currentUpaId));

  if (!upaSnap.exists()) {
    throw new Error("Data " + currentUpaId + " tidak ditemukan di Firestore.");
  }

  currentUpaData = upaSnap.data();
  renderBaseDashboard();

  const section = createSection("guUpaDashboard", "Dashboard UPA");
  addLine(section, "Nama UPA: " + (currentUpaData.nama || currentUpaData.name || currentUpaId));
  addLine(section, "ID UPA: " + currentUpaId);
  addLine(section, "Akun: " + (currentUser.email || currentUser.uid));
  section.appendChild(makeButton("Muat ulang data UPA", async () => {
    try {
      clearMessage();
      await loadAdminUpaDashboard();
      showMessage("Data UPA berhasil dimuat ulang.", "success");
    } catch (error) {
      showMessage(formatError(error), "error");
    }
  }, true));

  await loadBinaanForAdmin(currentUpaId);
  renderIsolationTests();
}

async function loadBinaanForAdmin(upaId) {
  const section = createSection("guBinaanSection", "Data Binaan");
  const list = document.createElement("div");
  section.appendChild(list);

  try {
    const snapshot = await getDocs(collection(db, "upas", upaId, "binaan"));

    if (snapshot.empty) {
      addLine(list, "Belum ada data binaan.");
      return;
    }

    for (const item of snapshot.docs) {
      const data = item.data();
      const card = document.createElement("div");
      card.className = "gu-result";
      card.textContent =
        (data.nama || data.name || "Binaan") +
        " · ID: " + item.id +
        (data.status ? " · Status: " + data.status : "");
      list.appendChild(card);
    }
  } catch (error) {
    addLine(list, "Data binaan belum dapat dibaca: " + formatError(error), "gu-result bad");
  }
}

async function loadUpaList() {
  const section = createSection("guUpaListSection", "Daftar UPA");
  addLine(section, "Pilih UPA untuk melihat detail dan daftar anggotanya.");

  const list = document.createElement("div");
  list.className = "gu-grid";
  section.appendChild(list);

  try {
    const snapshot = await getDocs(collection(db, "upas"));

    if (snapshot.empty) {
      addLine(list, "Belum ada data UPA di Firestore.");
      return;
    }

    const upas = snapshot.docs.map((item) => ({
      id: item.id,
      data: item.data()
    })).sort((a, b) => a.id.localeCompare(b.id));

    for (const upa of upas) {
      const card = document.createElement("div");
      card.className = "gu-card";

      const title = document.createElement("div");
      title.className = "gu-title";
      title.textContent = upa.data.nama || upa.data.name || upa.id;
      card.appendChild(title);

      addLine(card, "ID UPA: " + upa.id);
      if (upa.data.status) addLine(card, "Status: " + upa.data.status);

      card.appendChild(makeButton("Buka UPA", async () => {
        try {
          clearMessage();
          await openSelectedUpa(upa.id);
        } catch (error) {
          showMessage(formatError(error), "error");
        }
      }));

      list.appendChild(card);
    }
  } catch (error) {
    addLine(
      section,
      "Daftar UPA tidak dapat dimuat: " + formatError(error),
      "gu-result bad"
    );
  }
}

async function openSelectedUpa(upaId) {
  if (currentRole !== "admin_pusat") {
    throw new Error("Hanya Admin Pusat yang dapat memilih UPA dari daftar.");
  }

  const section = createSection("guSelectedUpaSection", "Detail UPA " + upaId);
  section.appendChild(makeButton("← Kembali ke daftar UPA", async () => {
    await loadUpaList();
  }, true));

  const upaSnap = await getDoc(doc(db, "upas", upaId));

  if (!upaSnap.exists()) {
    addLine(section, "Data UPA tidak ditemukan.", "gu-result bad");
    return;
  }

  const data = upaSnap.data();
  addLine(section, "Nama UPA: " + (data.nama || data.name || upaId));
  addLine(section, "ID UPA: " + upaId);
  if (data.status) addLine(section, "Status: " + data.status);

  const memberHeading = document.createElement("h4");
  memberHeading.className = "gu-title";
  memberHeading.textContent = "Daftar Anggota";
  memberHeading.style.marginTop = "18px";
  section.appendChild(memberHeading);

  const tableWrap = document.createElement("div");
  tableWrap.className = "gu-table-wrap";
  section.appendChild(tableWrap);

  try {
    const membersSnap = await getDocs(collection(db, "upas", upaId, "anggota"));

    if (membersSnap.empty) {
      addLine(tableWrap, "Belum ada data anggota untuk UPA ini.");
      return;
    }

    const table = document.createElement("table");
    table.className = "gu-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    for (const label of ["Nama", "Email", "Peran", "Status"]) {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    const members = membersSnap.docs.map((item) => ({
      id: item.id,
      data: item.data()
    })).sort((a, b) =>
      String(a.data.nama || a.data.name || a.id)
        .localeCompare(String(b.data.nama || b.data.name || b.id))
    );

    for (const member of members) {
      const row = document.createElement("tr");
      const values = [
        member.data.nama || member.data.name || member.id,
        member.data.email || "-",
        member.data.role || member.data.peran || "-",
        member.data.aktif === false || member.data.status === "nonaktif"
          ? "Nonaktif"
          : (member.data.status || "Aktif")
      ];

      for (const value of values) {
        const td = document.createElement("td");
        td.textContent = String(value);
        row.appendChild(td);
      }

      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  } catch (error) {
    addLine(
      tableWrap,
      "Daftar anggota tidak dapat dibaca: " + formatError(error),
      "gu-result bad"
    );
  }
}

async function runReadIsolationTest() {
  const otherUpaId = currentUpaId === "UPA001" ? "UPA002" : "UPA001";
  const results = [];

  async function expectDenied(label, operation) {
    try {
      await operation();
      results.push({ label, passed: false, detail: "Akses berhasil, padahal seharusnya ditolak." });
    } catch (error) {
      const denied = error?.code === "permission-denied" ||
        String(error?.message || "").toLowerCase().includes("permission");
      results.push({
        label,
        passed: denied,
        detail: denied ? "Akses ditolak sesuai aturan." : formatError(error)
      });
    }
  }

  await expectDenied("Dokumen UPA", () =>
    getDoc(doc(db, "upas", otherUpaId))
  );

  await expectDenied("Profil admin UPA lain", () => {
    const otherUid = otherUpaId === "UPA001"
      ? "Qo8huhew52eEOPHO9TAOZrzd8lI2"
      : "8tNL1G7bhjg9sUWrrtiM5YbB1tl1";
    return getDoc(doc(db, "users", otherUid));
  });

  await expectDenied("Daftar anggota", () =>
    getDocs(collection(db, "upas", otherUpaId, "anggota"))
  );

  await expectDenied("Daftar binaan", () =>
    getDocs(collection(db, "upas", otherUpaId, "binaan"))
  );

  await expectDenied("Daftar mutabaah", () =>
    getDocs(collection(db, "upas", otherUpaId, "mutabaah"))
  );

  await expectDenied("Daftar kegiatan", () =>
    getDocs(collection(db, "upas", otherUpaId, "kegiatan"))
  );

  await expectDenied("Daftar absensi", () =>
    getDocs(collection(db, "upas", otherUpaId, "absensi"))
  );

  renderTestResults("guReadTestResults", "Hasil Uji Isolasi Baca", results);
}

async function runWriteIsolationTest() {
  const otherUpaId = currentUpaId === "UPA001" ? "UPA002" : "UPA001";
  const testId = "uji_keamanan_" + Date.now();
  const testRef = doc(db, "upas", otherUpaId, "binaan", testId);
  const results = [];

  try {
    await setDoc(testRef, {
      nama: "DATA UJI KEAMANAN - HAPUS",
      dibuatOleh: currentUser.uid,
      dibuatPada: new Date().toISOString()
    });

    results.push({
      label: "Membuat data di UPA lain",
      passed: false,
      detail: "Pembuatan berhasil. Periksa Security Rules segera."
    });

    try {
      await deleteDoc(testRef);
      results.push({
        label: "Membersihkan data uji",
        passed: true,
        detail: "Data uji berhasil dihapus."
      });
    } catch {
      results.push({
        label: "Membersihkan data uji",
        passed: false,
        detail: "Data uji mungkin masih tersimpan. Hapus secara manual setelah memeriksa akses."
      });
    }
  } catch (error) {
    const denied = error?.code === "permission-denied" ||
      String(error?.message || "").toLowerCase().includes("permission");

    results.push({
      label: "Membuat data di UPA lain",
      passed: denied,
      detail: denied
        ? "Pembuatan ditolak oleh Firestore Security Rules."
        : formatError(error)
    });
  }

  renderTestResults("guWriteTestResults", "Hasil Uji Isolasi Tulis", results);
}

function renderTestResults(id, title, results) {
  let section = $(id);
  if (!section) {
    section = createSection(id, title);
  } else {
    section.replaceChildren();
    const heading = document.createElement("h3");
    heading.className = "gu-title";
    heading.textContent = title;
    section.appendChild(heading);
  }

  let passedCount = 0;

  for (const result of results) {
    if (result.passed) passedCount++;

    const item = document.createElement("div");
    item.className = "gu-result " + (result.passed ? "ok" : "bad");
    item.textContent =
      (result.passed ? "✅ " : "❌ ") +
      result.label + ": " + result.detail;
    section.appendChild(item);
  }

  addLine(
    section,
    "Lulus " + passedCount + " dari " + results.length + " pengujian.",
    "gu-muted"
  );
}

function renderIsolationTests() {
  const section = createSection("guIsolationTests", "Pengujian Keamanan GrupUPA");
  addLine(
    section,
    "Pengujian ini menggunakan akun Admin UPA yang sedang login dan mencoba membaca atau membuat data pada UPA lain."
  );

  section.appendChild(makeButton("Uji Isolasi Baca", async (button) => {
    try {
      clearMessage();
      button.disabled = true;
      await runReadIsolationTest();
    } catch (error) {
      showMessage(formatError(error), "error");
    } finally {
      button.disabled = false;
    }
  }));

  section.appendChild(makeButton("Uji Isolasi Tulis", async (button) => {
    try {
      clearMessage();
      button.disabled = true;
      await runWriteIsolationTest();
    } catch (error) {
      showMessage(formatError(error), "error");
    } finally {
      button.disabled = false;
    }
  }, true));

  addLine(
    section,
    "Catatan: uji tulis ini menguji pembuatan dokumen. Uji ini tidak membuktikan keamanan operasi ubah dan hapus.",
    "gu-muted"
  );
}

async function renderAdminPusatDashboard() {
  renderBaseDashboard();

  const section = createSection("guAdminPusatSection", "Panel Admin Pusat");
  addLine(section, "Anda dapat melihat daftar UPA dan membuka data anggotanya.");
  section.appendChild(makeButton("Muat Daftar UPA", async () => {
    try {
      clearMessage();
      await loadUpaList();
    } catch (error) {
      showMessage(formatError(error), "error");
    }
  }));

  await loadUpaList();
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
    "Dashboard untuk peran ini belum diaktifkan. Minta Admin Pusat memeriksa profil dan hak akses akun."
  );
}

const loginForm = $("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const emailInput = $("email");
    const passwordInput = $("password");

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showMessage("Masukkan email dan kata sandi.", "error");
      return;
    }

    const submitButton = loginForm.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      showMessage("Login gagal: " + formatError(error), "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

const logoutBtn = $("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      showMessage("Gagal keluar: " + formatError(error), "error");
    }
  });
}

const refreshBtn = $("refreshBtn");

if (refreshBtn) {
  refreshBtn.addEventListener("click", async () => {
    try {
      clearMessage();
      if (currentRole === "admin_pusat") {
        await renderAdminPusatDashboard();
      } else if (currentRole === "admin_upa") {
        await loadAdminUpaDashboard();
      }
      showMessage("Data berhasil dimuat ulang.", "success");
    } catch (error) {
      showMessage(formatError(error), "error");
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  currentProfile = null;
  currentRole = "";
  currentUpaId = "";
  currentUpaData = null;

  if (!user) {
    showLogin();
    clearMessage();
    return;
  }

  showDashboard();

  try {
    currentProfile = await loadProfile(user);
    currentRole = getRole(currentProfile, user.uid);
    await renderDashboard();
  } catch (error) {
    showMessage("Dashboard gagal dimuat: " + formatError(error), "error");
  }
});
