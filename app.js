import { auth, db } from "./firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, limit } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const ROOT_UID = "5L0w42CRcgVVvqk47dF5vVXOQOV2";
const $ = id => document.getElementById(id);
const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");
function setMessage(id, text, error=false) { $(id).textContent=text; $(id).className=error?"error":""; }
function test(n, icon, text) { const li=$("testList").children[n]; if(li) li.textContent=icon+" "+text; }
$("loginForm").addEventListener("submit", async e => {
 e.preventDefault(); setMessage("loginMessage","Memeriksa akun…"); $("loginBtn").disabled=true;
 try { await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value); }
 catch(err) { const msg={"auth/invalid-credential":"Email atau kata sandi salah.","auth/user-not-found":"Akun belum terdaftar.","auth/too-many-requests":"Terlalu banyak percobaan. Tunggu sebentar.","auth/network-request-failed":"Periksa koneksi internet."}; setMessage("loginMessage",msg[err.code]||`Login gagal: ${err.code||err.message}`,true); }
 finally { $("loginBtn").disabled=false; }
});
$("logoutBtn").addEventListener("click",()=>signOut(auth));
$("refreshBtn").addEventListener("click",()=>auth.currentUser&&load(auth.currentUser));
onAuthStateChanged(auth,user=>{if(!user){show($("loginView"));hide($("dashboardView"));hide($("logoutBtn"));return;}hide($("loginView"));show($("dashboardView"));show($("logoutBtn"));load(user);});
async function load(user) {
 $("welcomeTitle").textContent="Memuat profil…"; $("welcomeSubtitle").textContent=user.email||user.uid; $("binaanList").textContent="Memuat data…"; $("alertBox").textContent=""; hide($("alertBox"));
 test(0,"✅","Login Firebase berhasil"); test(1,"🟡","Memeriksa profil"); test(2,"🟡","Memeriksa data UPA"); test(3,"🟡","Memeriksa daftar binaan");
 try {
   let role="", profile=null, upaId="UPA001";
   if(user.uid===ROOT_UID){role="admin_pusat";const s=await getDoc(doc(db,"users",user.uid));if(s.exists())profile=s.data();}
   else {const s=await getDoc(doc(db,"upas",upaId,"anggota",user.uid));if(s.exists())profile=s.data();role=profile?.role||"";}
   if(!role || (profile && profile.aktif!==true)){test(1,"❌","Profil tidak ditemukan atau akun tidak aktif");$("welcomeTitle").textContent="Akun belum memiliki akses";$("roleBadge").textContent="Akses ditolak";$("accountStatus").textContent="Periksa profil";$("binaanList").textContent="Pastikan dokumen anggota memiliki role yang benar dan aktif bertipe boolean true."; $("alertBox").textContent=`Login berhasil, tetapi profil/izin belum valid. Periksa dokumen users/${user.uid} untuk Admin Pusat atau upas/UPA001/anggota/${user.uid} untuk Admin UPA.`;show($("alertBox"));test(2,"—","Belum diuji");test(3,"—","Belum diuji");return;}
   test(1,"✅","Profil ditemukan: "+role); $("welcomeTitle").textContent="Selamat datang"+(profile?.nama?", "+profile.nama:"");$("roleBadge").textContent=role==="admin_pusat"?"Admin Pusat":role==="admin_upa"?"Admin UPA":role;$("accountStatus").textContent="Aktif";
   const u=await getDoc(doc(db,"upas",upaId)); if(u.exists()){$("upaName").textContent=u.data().nama||upaId;$("upaIdLabel").textContent="ID UPA: "+upaId;test(2,"✅","Data "+upaId+" berhasil dibaca");}else{test(2,"❌","Dokumen UPA tidak ditemukan");$("upaName").textContent="Tidak ditemukan";}
   try {const snap=await getDocs(query(collection(db,"upas",upaId,"binaan"),limit(50)));let docs=snap.docs;if(role==="pembina")docs=docs.filter(d=>d.data().pembinaUid===user.uid);$("binaanList").innerHTML=docs.length?docs.map(d=>`<article class="data-row"><div><b>${esc(d.data().nama||"Tanpa nama")}</b><small>ID: ${esc(d.id)}</small></div></article>`).join(""):"Belum ada data binaan atau belum ada binaan yang ditugaskan.";test(3,"✅",`Daftar binaan berhasil dibaca (${docs.length})`);}
   catch(err){$("binaanList").textContent="Gagal membaca binaan. Periksa Security Rules.";test(3,"❌","Akses binaan gagal: "+(err.code||"error"));$("alertBox").textContent="Pembacaan binaan gagal: "+(err.code||err.message);show($("alertBox"));}
 } catch(err){test(1,"❌","Gagal membaca profil: "+(err.code||"error"));$("welcomeTitle").textContent="Pemeriksaan belum selesai";$("alertBox").textContent="Firestore menolak atau gagal membaca data: "+(err.code||err.message);show($("alertBox"));}
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
