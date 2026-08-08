/* CliffordOS front-end (vanilla JS, no build step)
   M1: auth + My Files (upload / preview / download / trash)
   Later milestones extend the stub pages below. */
"use strict";

// ---------- setup ----------
const sb = window.supabase.createClient(window.CLIFFORD.url, window.CLIFFORD.anon);
const $ = (sel) => document.querySelector(sel);
const state = { user: null, profile: null, filesTab: "personal", refPrefix: "" };

const EMAIL_DOMAIN = "cliffordos.school"; // usernames map to <u>@this internally

// ---------- tiny helpers ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtSize(n) {
  if (n == null) return "";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}
function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function ficon(name) {
  const e = (name || "").split(".").pop().toLowerCase();
  if (["docx", "doc"].includes(e)) return "📄";
  if (["xlsx", "xls", "csv"].includes(e)) return "📊";
  if (["pptx", "ppt"].includes(e)) return "📽️";
  if (e === "pdf") return "📕";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(e)) return "🖼️";
  return "📎";
}
let toastTimer = null;
function toast(msg, isErr) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3500);
}

// ---------- auth ----------
// The embedded Control Centre borrows this app's login and identity.
window.sb = sb;
window.state = state;

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enterApp(session.user);
  else showLogin();

  sb.auth.onAuthStateChange((event, sess) => {
    if (event === "SIGNED_OUT") { state.user = null; showLogin(); }
  });
}

function showLogin() {
  $("#shell").classList.add("hidden");
  $("#login").classList.remove("hidden");
}

async function enterApp(user) {
  state.user = user;
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
  state.profile = profile || { display_name: user.email, role: "dean" };
  $("#who").innerHTML = `${esc(state.profile.display_name)}<small>${esc(state.profile.role)}</small>`;
  if (state.profile.role === "admin") $("#nav-admin").classList.remove("hidden");
  $("#login").classList.add("hidden");
  $("#shell").classList.remove("hidden");
  if (!location.hash || location.hash === "#/") location.hash = "#/dashboard";
  route();
  pollBadge();
  setInterval(pollBadge, 30000);
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#login-btn");
  btn.disabled = true;
  $("#login-err").textContent = "";
  const u = $("#login-user").value.trim().toLowerCase();
  const p = $("#login-pass").value;
  const email = u.includes("@") ? u : `${u}@${EMAIL_DOMAIN}`;
  const { data, error } = await sb.auth.signInWithPassword({ email, password: p });
  btn.disabled = false;
  if (error) { $("#login-err").textContent = "Wrong username or password."; return; }
  await enterApp(data.user);
});

$("#logout").addEventListener("click", async () => {
  await sb.auth.signOut();
});

// ---------- unread badges ----------
async function pollBadge() {
  if (!state.user) return;
  const [{ count: inbox }, { count: chat }] = await Promise.all([
    sb.from("shares").select("id", { count: "exact", head: true })
      .eq("to_user", state.user.id).is("read_at", null),
    sb.from("messages").select("id", { count: "exact", head: true })
      .eq("to_user", state.user.id).is("read_at", null),
  ]);
  const set = (el, n) => {
    if (!el) return;
    if (n > 0) { el.textContent = n; el.classList.remove("hidden"); }
    else el.classList.add("hidden");
  };
  set($("#badge-inbox"), inbox ?? 0);
  set($("#badge-chat"), chat ?? 0);
  const total = (inbox ?? 0) + (chat ?? 0);
  document.title = total > 0 ? `(${total}) CliffordOS` : "CliffordOS";
}
const pollBadges = pollBadge;   // chat code calls it by this name

// ---------- router ----------
const pages = {
  dashboard: pageDashboard,
  files: pageFiles,
  reference: pageReference,
  control: pageControl,
  chat: pageChat,
  inbox: pageInbox,
  sent: pageSent,
  archive: pageStub("Archive", "Full-text search across the whole school archive — coming soon."),
  luna: pageLuna,
  admin: pageAdmin,
};

function route() {
  if (!state.user) return;
  const name = (location.hash.replace(/^#\//, "") || "dashboard").split("/")[0];
  document.querySelectorAll(".side a").forEach((a) =>
    a.classList.toggle("active", a.dataset.nav === name));
  (pages[name] || pages.dashboard)();
}
window.addEventListener("hashchange", route);

// ---------- pages ----------
function pageStub(title, text) {
  return () => {
    $("#main").innerHTML = `
      <div class="page-head"><h2>${esc(title)}</h2></div>
      <div class="card empty">${esc(text)}</div>`;
  };
}

async function pageDashboard() {
  $("#main").innerHTML = `
    <div class="page-head"><h2>Welcome, ${esc(state.profile.display_name.split(" ")[0])} 👋</h2></div>
    <div class="stat-row">
      <div class="stat"><b id="st-files">—</b><span>files in My Files</span></div>
      <div class="stat"><b id="st-unread">—</b><span>unread in Inbox</span></div>
      <div class="stat"><b id="st-users">—</b><span>people on CliffordOS</span></div>
    </div>
    <div class="card">
      <b>Getting started</b>
      <p class="muted" style="margin-bottom:0">
        🧭 <a href="control.html">Control Centre</a> — your whole 2026-27 page, now on any device: every document opens in place, and the search box reaches all 14,866 archive documents.<br>
        📁 <a href="#/files">My Files</a> — upload documents, open them right in the browser, and keep them with you anywhere.<br>
        📚 <a href="#/reference">Reference</a> — browse the 2026-27 working folder file by file.<br>
        Sharing and Luna are switched on in the coming updates.</p>
    </div>`;
  const uid = state.user.id;
  const [f, s, u] = await Promise.all([
    sb.from("files").select("id", { count: "exact", head: true }).eq("owner_id", uid).neq("area", "trash"),
    sb.from("shares").select("id", { count: "exact", head: true }).eq("to_user", uid).is("read_at", null),
    sb.from("profiles").select("id", { count: "exact", head: true }),
  ]);
  $("#st-files").textContent = f.count ?? 0;
  $("#st-unread").textContent = s.count ?? 0;
  $("#st-users").textContent = u.count ?? 0;
}

// ----- My Files -----
async function pageFiles() {
  $("#main").innerHTML = `
    <div class="page-head">
      <h2>My Files</h2>
      <span>
        <input type="file" id="up-input" multiple class="hidden">
        <button class="btn" id="up-btn">⬆ Upload files</button>
      </span>
    </div>
    <div class="drop" id="drop">Drag files here to upload</div>
    <div class="tabs">
      <button data-tab="personal">Personal</button>
      <button data-tab="luna">Made by Luna</button>
      <button data-tab="trash">Trash</button>
    </div>
    <div id="file-list"></div>`;

  $("#up-btn").onclick = () => $("#up-input").click();
  $("#up-input").onchange = (e) => uploadFiles([...e.target.files]);
  const drop = $("#drop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("hover"); };
  drop.ondragleave = () => drop.classList.remove("hover");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("hover"); uploadFiles([...e.dataTransfer.files]); };

  document.querySelectorAll(".tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === state.filesTab);
    b.onclick = () => { state.filesTab = b.dataset.tab; pageFiles(); };
  });

  await renderFileList();
}

async function renderFileList() {
  const box = $("#file-list");
  const { data: rows, error } = await sb.from("files")
    .select("*")
    .eq("owner_id", state.user.id)
    .eq("area", state.filesTab)
    .order("updated_at", { ascending: false });
  if (error) { box.innerHTML = `<div class="card empty">Could not load files.</div>`; return; }
  if (!rows.length) {
    box.innerHTML = `<div class="card empty">${state.filesTab === "trash" ? "Trash is empty." :
      state.filesTab === "luna" ? "Documents Luna creates for you will appear here." :
      "No files yet — upload your first document above."}</div>`;
    return;
  }
  box.innerHTML = `
    <table class="ftable">
      <thead><tr><th>Name</th><th>Size</th><th>Updated</th><th></th></tr></thead>
      <tbody>${rows.map((f) => `
        <tr class="clickable" data-id="${f.id}">
          <td class="fname"><span class="ficon">${ficon(f.orig_name)}</span>${esc(f.orig_name)}</td>
          <td>${fmtSize(f.size)}</td>
          <td class="muted">${fmtDate(f.updated_at)}</td>
          <td class="rowbtns">
            <button class="btn small ghost" data-act="dl">⬇</button>
            ${state.filesTab === "trash"
              ? `<button class="btn small" data-act="restore">↩ Restore</button>
                 <button class="btn small danger" data-act="purge">✕ Delete forever</button>`
              : `<button class="btn small" data-act="send">📤 Send</button>
                 <button class="btn small danger" data-act="trash">🗑</button>`}
          </td>
        </tr>`).join("")}
      </tbody>
    </table>`;

  box.querySelectorAll("tr.clickable").forEach((tr) => {
    const file = rows.find((r) => r.id === Number(tr.dataset.id));
    tr.onclick = (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (!act) return openViewer(file);
      e.stopPropagation();
      if (act === "dl") downloadFile(file);
      if (act === "send") openSendDialog(file);
      if (act === "trash") trashFile(file);
      if (act === "restore") restoreFile(file);
      if (act === "purge") purgeFile(file);
    };
  });
}

async function uploadFiles(files) {
  if (!files.length) return;
  for (const f of files) {
    if (f.size > 50 * 1048576) { toast(`${f.name}: over the 50 MB limit`, true); continue; }
    const safe = f.name.replace(/[^\w.\- ()一-鿿]/g, "_");
    const path = `${state.user.id}/personal/${crypto.randomUUID()}_${safe}`;
    toast(`Uploading ${f.name}…`);
    const { error: upErr } = await sb.storage.from("files").upload(path, f, { contentType: f.type || undefined });
    if (upErr) { toast(`${f.name}: upload failed`, true); continue; }
    const digest = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
    const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error: dbErr } = await sb.from("files").insert({
      owner_id: state.user.id, orig_name: f.name, storage_path: path,
      area: "personal", mime: f.type || null, size: f.size, sha256: sha,
    });
    if (dbErr) { toast(`${f.name}: could not register`, true); continue; }
  }
  toast("Upload complete ✓");
  state.filesTab = "personal";
  pageFiles();
}

async function downloadFile(file) {
  const { data, error } = await sb.storage.from(file.bucket || "files")
    .createSignedUrl(file.storage_path, 300, { download: file.orig_name });
  if (error) return toast("Download failed", true);
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = file.orig_name;
  document.body.appendChild(a); a.click(); a.remove();
}

async function trashFile(file) {
  await sb.from("files").update({ area: "trash", prev_area: file.area, deleted_at: new Date().toISOString() }).eq("id", file.id);
  toast("Moved to Trash");
  renderFileList();
}
async function restoreFile(file) {
  await sb.from("files").update({ area: file.prev_area || "personal", prev_area: null, deleted_at: null }).eq("id", file.id);
  toast("Restored ✓");
  renderFileList();
}
async function purgeFile(file) {
  if (!confirm(`Delete "${file.orig_name}" forever? This cannot be undone.`)) return;
  await sb.storage.from("files").remove([file.storage_path]);
  await sb.from("files").delete().eq("id", file.id);
  toast("Deleted forever");
  renderFileList();
}

// ----- change your own password -----
$("#pw-change").onclick = () => {
  const wrap = document.createElement("div");
  wrap.className = "viewer";
  wrap.innerHTML = `
    <div class="viewer-box" style="max-width:400px;height:auto">
      <div class="viewer-head"><span>Change your password</span>
        <span class="viewer-actions"><button class="btn small ghost" id="pw-cancel">✕</button></span></div>
      <div class="viewer-body" style="padding:18px 22px">
        <label style="display:block;margin-bottom:12px"><b>New password</b> (at least 8 characters)
          <input type="password" id="pw-new" style="width:100%;margin-top:6px" autocomplete="new-password">
        </label>
        <label style="display:block;margin-bottom:14px"><b>Type it again</b>
          <input type="password" id="pw-again" style="width:100%;margin-top:6px" autocomplete="new-password">
        </label>
        <div id="pw-err" class="login-err"></div>
        <button class="btn" id="pw-save" style="width:100%">Save new password</button>
        <p class="muted" style="font-size:12px;margin:10px 0 0">
          You stay signed in here. Use the new password next time you log in on any device.</p>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector("#pw-cancel").onclick = close;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector("#pw-save").onclick = async () => {
    const a = wrap.querySelector("#pw-new").value;
    const b = wrap.querySelector("#pw-again").value;
    const err = wrap.querySelector("#pw-err");
    if (a.length < 8) { err.textContent = "Use at least 8 characters."; return; }
    if (a !== b) { err.textContent = "The two boxes don't match."; return; }
    wrap.querySelector("#pw-save").disabled = true;
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) {
      err.textContent = error.message;
      wrap.querySelector("#pw-save").disabled = false;
      return;
    }
    close();
    toast("Password changed ✓");
  };
};

// ----- sending files + inbox / sent -----
async function openSendDialog(file) {
  const { data: people } = await sb.from("profiles")
    .select("id,display_name").neq("id", state.user.id).order("display_name");
  if (!people?.length) return toast("No one to send to", true);

  const wrap = document.createElement("div");
  wrap.className = "viewer";                    // reuse the overlay styling
  wrap.innerHTML = `
    <div class="viewer-box" style="max-width:430px;height:auto">
      <div class="viewer-head"><span>Send “${esc(file.orig_name)}”</span>
        <span class="viewer-actions"><button class="btn small ghost" id="send-cancel">✕</button></span></div>
      <div class="viewer-body" style="padding:18px 22px">
        <b>To</b>
        ${people.map((p) => `
          <label style="display:block;margin:8px 0">
            <input type="checkbox" value="${p.id}" class="send-to"> ${esc(p.display_name)}
          </label>`).join("")}
        <label style="display:block;margin:12px 0">
          <input type="checkbox" id="send-imp"> ❗ Mark as IMPORTANT
        </label>
        <label style="display:block;margin:12px 0 6px"><b>Note</b> (optional)</label>
        <input id="send-note" style="width:100%" placeholder="e.g. Please review before Friday">
        <button class="btn" id="send-go" style="margin-top:16px;width:100%">📤 Send</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector("#send-cancel").onclick = close;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });

  wrap.querySelector("#send-go").onclick = async () => {
    const to = [...wrap.querySelectorAll(".send-to:checked")].map((c) => c.value);
    if (!to.length) return toast("Tick at least one person", true);
    wrap.querySelector("#send-go").disabled = true;
    const { data: sess } = await sb.auth.getSession();
    try {
      const res = await fetch(`${window.CLIFFORD.url}/functions/v1/share-file`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sess.session.access_token}`,
          apikey: window.CLIFFORD.anon,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          file_id: file.id,
          to,
          important: wrap.querySelector("#send-imp").checked,
          note: wrap.querySelector("#send-note").value,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error);
      toast(`Sent to ${data.sent.length} ${data.sent.length === 1 ? "person" : "people"} ✓`);
      close();
    } catch (err) {
      toast(err.message || "Could not send", true);
      wrap.querySelector("#send-go").disabled = false;
    }
  };
}

async function pageInbox() {
  $("#main").innerHTML = `<div class="page-head"><h2>📥 Inbox</h2></div><div id="share-list"><div class="card empty">Loading…</div></div>`;
  const { data: rows } = await sb.from("shares")
    .select("*, from:profiles!shares_from_user_fkey(display_name), file:files!shares_delivered_file_id_fkey(*)")
    .eq("to_user", state.user.id).order("sent_at", { ascending: false });
  renderShares(rows, "inbox");
}

async function pageSent() {
  $("#main").innerHTML = `<div class="page-head"><h2>📤 Sent</h2></div><div id="share-list"><div class="card empty">Loading…</div></div>`;
  const { data: rows } = await sb.from("shares")
    .select("*, to:profiles!shares_to_user_fkey(display_name), file:files!shares_delivered_file_id_fkey(orig_name)")
    .eq("from_user", state.user.id).order("sent_at", { ascending: false });
  renderShares(rows, "sent");
}

function renderShares(rows, kind) {
  const box = $("#share-list");
  if (!rows || !rows.length) {
    box.innerHTML = `<div class="card empty">${kind === "inbox"
      ? "Nothing in your inbox. Files Jon or Ross send you will appear here."
      : "You haven't sent any files yet — use 📤 on any of your files."}</div>`;
    return;
  }
  box.innerHTML = `
    <table class="ftable"><thead><tr>
      <th>File</th><th>${kind === "inbox" ? "From" : "To"}</th><th>Note</th><th>When</th><th>${kind === "inbox" ? "" : "Read"}</th>
    </tr></thead><tbody>
    ${rows.map((s) => `
      <tr class="clickable ${kind === "inbox" && !s.read_at ? "unread" : ""}" data-sid="${s.id}">
        <td class="fname">${s.important ? "❗ " : ""}${esc(s.file?.orig_name ?? "(deleted)")}</td>
        <td>${esc(kind === "inbox" ? s.from?.display_name : s.to?.display_name)}</td>
        <td class="muted">${esc(s.note ?? "")}</td>
        <td class="muted">${fmtDate(s.sent_at)}</td>
        <td>${kind === "inbox" ? "" : (s.read_at ? "✓ " + fmtDate(s.read_at) : "—")}</td>
      </tr>`).join("")}
    </tbody></table>`;

  if (kind !== "inbox") return;
  box.querySelectorAll("tr.clickable").forEach((tr) => {
    const share = rows.find((r) => r.id === Number(tr.dataset.sid));
    tr.onclick = async () => {
      if (!share.read_at) {
        await sb.from("shares").update({ read_at: new Date().toISOString() }).eq("id", share.id);
        share.read_at = "now";
        tr.classList.remove("unread");
        pollBadge();
      }
      if (share.file) openViewer(share.file);
    };
  });
}

// ----- Control Centre -----
// The page itself is school content, so it lives in the PRIVATE reference
// bucket (never in the public code repo) and renders here behind the login.
let controlHtml = null;

async function pageControl() {
  $("#main").innerHTML = `<div class="card empty">Opening the Control Centre…</div>`;
  if (!controlHtml) {
    const { data, error } = await sb.storage.from("reference").download("_app/control.html");
    if (error) {
      $("#main").innerHTML = `<div class="card empty">Could not load the Control Centre.</div>`;
      return;
    }
    controlHtml = await data.text();
  }
  $("#main").innerHTML = "";
  const frame = document.createElement("iframe");
  frame.className = "control-frame";
  // Our own generated page, full same-origin. It borrows this app's login for
  // every request (see the builder), so no session ever lives inside the frame.
  frame.srcdoc = controlHtml;
  $("#main").appendChild(frame);
}

// ----- Chat (instant messages between the three of you) -----
let chatWith = null;          // profile we're talking to; null = the group thread
let chatPeople = [];
let chatChannel = null;

function initials(name) {
  return name.split(/[\s(]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

async function pageChat() {
  const { data: people } = await sb.from("profiles")
    .select("id,display_name,username").neq("id", state.user.id).order("display_name");
  chatPeople = people || [];
  const me = state.user.id;

  // Sidebar needs a last-line + unread count per conversation.
  const { data: recent } = await sb.from("messages")
    .select("from_user,to_user,body,file_name,ts,read_at")
    .order("ts", { ascending: false }).limit(200);
  const convs = [{ id: null, name: "Everyone", group: true }]
    .concat(chatPeople.map((p) => ({ id: p.id, name: p.display_name, group: false })));
  convs.forEach((c) => {
    const msgs = (recent || []).filter((m) => c.group
      ? m.to_user === null
      : (m.from_user === c.id && m.to_user === me) || (m.from_user === me && m.to_user === c.id));
    const last = msgs[0];
    c.last = last ? (last.file_name ? `📎 ${last.file_name}` : last.body) : "";
    c.when = last ? last.ts : null;
    c.unread = c.group ? 0
      : msgs.filter((m) => m.from_user === c.id && m.to_user === me && !m.read_at).length;
  });

  const active = (c) => (chatWith ? chatWith.id === c.id : c.id === null);
  $("#main").innerHTML = `
    <div class="chat-app">
      <aside class="chat-side">
        <div class="chat-side-head">Conversations</div>
        ${convs.map((c) => `
          <div class="conv ${active(c) ? "active" : ""}" data-cid="${c.id ?? ""}">
            <span class="avatar ${c.group ? "grp" : ""}">${c.group ? "👥" : esc(initials(c.name))}</span>
            <span class="conv-main">
              <span class="conv-name">${esc(c.name)}</span>
              <span class="conv-last">${esc((c.last || "No messages yet").slice(0, 34))}</span>
            </span>
            <span class="conv-meta">
              ${c.when ? `<span class="conv-when">${fmtDate(c.when).split(" ")[1] ?? ""}</span>` : ""}
              ${c.unread ? `<span class="badge">${c.unread}</span>` : ""}
            </span>
          </div>`).join("")}
      </aside>
      <section class="chat-pane">
        <div class="chat-head">
          <span class="avatar ${chatWith ? "" : "grp"}">${chatWith ? esc(initials(chatWith.display_name)) : "👥"}</span>
          <b>${esc(chatWith ? chatWith.display_name : "Everyone")}</b>
          <span class="muted">${chatWith ? "private conversation" : "all three of you"}</span>
        </div>
        <div id="chat-log"><div class="empty">Loading…</div></div>
        <form id="chat-form" class="chat-composer">
          <button type="button" class="btn ghost" id="chat-attach" title="Send a file">📎</button>
          <input type="file" id="chat-file" class="hidden">
          <textarea id="chat-input" rows="1"
            placeholder="Message ${esc(chatWith ? chatWith.display_name : "everyone")}…  (Enter to send)"></textarea>
          <button class="btn" id="chat-send" type="submit">➤</button>
        </form>
      </section>
    </div>`;

  document.querySelectorAll(".conv").forEach((el) => {
    el.onclick = () => {
      chatWith = chatPeople.find((p) => p.id === el.dataset.cid) ?? null;
      pageChat();
    };
  });
  const input = $("#chat-input");
  input.oninput = () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 130) + "px";
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  };
  $("#chat-form").onsubmit = (e) => { e.preventDefault(); sendChat(); };
  $("#chat-attach").onclick = () => $("#chat-file").click();
  $("#chat-file").onchange = (e) => sendChatFile(e.target.files[0]);

  await renderChat();
  subscribeChat();
  markChatRead();
  input.focus();
}

function chatName(id) {
  if (id === state.user.id) return "You";
  return chatPeople.find((p) => p.id === id)?.display_name ?? "?";
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = (today - that) / 86400000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function chatFileChip(m) {
  return `<a href="#" class="filechip" data-fpath="${esc(m.file_path)}" data-fname="${esc(m.file_name)}">
    ${ficon(m.file_name)} <span>${esc(m.file_name)}</span>
    <small>${fmtSize(m.file_size)}</small></a>`;
}

async function renderChat() {
  const me = state.user.id;
  let q = sb.from("messages").select("*").order("ts", { ascending: true }).limit(300);
  q = chatWith
    ? q.or(`and(from_user.eq.${me},to_user.eq.${chatWith.id}),and(from_user.eq.${chatWith.id},to_user.eq.${me})`)
    : q.is("to_user", null);
  const { data: msgs } = await q;
  const log = $("#chat-log");
  if (!log) return;
  if (!msgs || !msgs.length) {
    log.innerHTML = `<div class="empty">${chatWith
      ? `No messages with ${esc(chatWith.display_name)} yet — say hello.`
      : "Nothing in the group chat yet — everyone sees what you write here."}</div>`;
    return;
  }

  let html = "", lastDay = "", lastFrom = null;
  msgs.forEach((m) => {
    const day = dayLabel(m.ts);
    if (day !== lastDay) {
      html += `<div class="day-sep"><span>${esc(day)}</span></div>`;
      lastDay = day; lastFrom = null;
    }
    const mine = m.from_user === me;
    const first = m.from_user !== lastFrom;
    lastFrom = m.from_user;
    const time = new Date(m.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    html += `
      <div class="msg ${mine ? "mine" : ""} ${first ? "first" : ""}">
        ${!mine && !chatWith && first
          ? `<div class="msg-sender">${esc(chatName(m.from_user))}</div>` : ""}
        <div class="msg-bubble">
          ${m.file_path ? chatFileChip(m) : ""}
          ${m.body ? `<span>${esc(m.body)}</span>` : ""}
          <span class="msg-time">${time}${mine && chatWith ? (m.read_at ? " ✓✓" : " ✓") : ""}</span>
        </div>
      </div>`;
  });
  log.innerHTML = html;
  log.scrollTop = log.scrollHeight;

  log.querySelectorAll(".filechip").forEach((a) => {
    a.onclick = async (e) => {
      e.preventDefault();
      const { data, error } = await sb.storage.from("chat").download(a.dataset.fpath);
      if (error) return toast("Could not open the file", true);
      const url = URL.createObjectURL(data);
      const dl = document.createElement("a");
      dl.href = url; dl.download = a.dataset.fname;
      document.body.appendChild(dl); dl.click(); dl.remove();
    };
  });
}

async function sendChat() {
  const box = $("#chat-input");
  const body = box.value.trim();
  if (!body) return;
  box.value = "";
  box.style.height = "auto";
  const { error } = await sb.from("messages")
    .insert({ from_user: state.user.id, to_user: chatWith ? chatWith.id : null, body });
  if (error) { toast("Could not send", true); box.value = body; return; }
  renderChat();
}

async function sendChatFile(f) {
  if (!f) return;
  if (f.size > 50 * 1048576) return toast(`${f.name}: over the 50 MB limit`, true);
  toast(`Sending ${f.name}…`);
  const safe = f.name.replace(/[^\w.\- ()一-鿿]/g, "_");
  const path = `${state.user.id}/${crypto.randomUUID()}_${safe}`;
  const { error: upErr } = await sb.storage.from("chat")
    .upload(path, f, { contentType: f.type || undefined });
  if (upErr) return toast("Upload failed", true);
  const { error } = await sb.from("messages").insert({
    from_user: state.user.id,
    to_user: chatWith ? chatWith.id : null,
    body: "",
    file_path: path, file_name: f.name, file_size: f.size,
  });
  if (error) return toast("Could not send the file", true);
  renderChat();
}

function subscribeChat() {
  if (chatChannel) sb.removeChannel(chatChannel);
  chatChannel = sb.channel("chat")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      () => { renderChat(); markChatRead(); })
    .subscribe();
}

async function markChatRead() {
  if (!chatWith) return;   // the group thread has no per-person read receipts
  await sb.from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("to_user", state.user.id).eq("from_user", chatWith.id).is("read_at", null);
  pollBadges();
}

// ----- Luna -----
// The conversation lives in memory for now; each turn posts the recent history
// to the luna-chat function, which does the searching and answers.
let lunaChat = [];
let lunaConversationId = null;
let lunaHistoryLoaded = false;

// Luna remembers: reopen the latest saved conversation and carry on.
async function loadLunaHistory() {
  if (lunaHistoryLoaded) return;
  lunaHistoryLoaded = true;
  const { data: convs } = await sb.from("luna_conversations")
    .select("id").order("updated_at", { ascending: false }).limit(1);
  if (!convs || !convs.length) return;
  lunaConversationId = convs[0].id;
  const { data: msgs } = await sb.from("luna_messages")
    .select("role,content").eq("conversation_id", lunaConversationId)
    .order("ts", { ascending: true }).limit(40);
  lunaChat = (msgs || []).map((m) => ({
    role: m.role,
    content: m.content?.text ?? "",
    tools: m.content?.tools ?? [],
    docs: m.content?.docs ?? [],
  }));
}

async function pageLuna() {
  await loadLunaHistory();
  $("#main").innerHTML = `
    <div class="page-head"><h2>🌙 Luna</h2>
      ${lunaChat.length ? `<button class="btn small ghost" id="luna-new">✨ New conversation</button>` : ""}</div>
    <div class="card" id="luna-log">
      ${lunaChat.length ? "" : `<div class="empty" style="text-align:left">
        Ask me about anything in the archive — 14,866 documents, going back years.<br><br>
        <span class="muted">For example:</span>
        <div class="chips" style="margin-top:8px">
          <button class="btn small ghost luna-eg">When are the ELS placement tests?</button>
          <button class="btn small ghost luna-eg">What do I need for report cards?</button>
          <button class="btn small ghost luna-eg">Find the behaviour management policy</button>
        </div></div>`}
    </div>
    <form id="luna-form" class="luna-bar">
      <input id="luna-input" placeholder="Ask Luna…" autocomplete="off">
      <button class="btn" id="luna-send" type="submit">Send</button>
    </form>`;

  lunaChat.forEach(paintLunaMsg);
  const newBtn = $("#luna-new");
  if (newBtn) newBtn.onclick = () => { lunaChat = []; lunaConversationId = null; pageLuna(); };
  $("#luna-form").onsubmit = (e) => { e.preventDefault(); sendToLuna($("#luna-input").value); };
  document.querySelectorAll(".luna-eg").forEach((b) => {
    b.onclick = () => sendToLuna(b.textContent);
  });
  $("#luna-input").focus();
}

function paintLunaMsg(m) {
  const log = $("#luna-log");
  if (!log) return;
  const empty = log.querySelector(".empty");
  if (empty) empty.remove();
  const row = document.createElement("div");
  row.className = `luna-msg ${m.role}`;
  row.innerHTML = m.role === "user"
    ? `<div class="bubble">${esc(m.content)}</div>`
    : `<div class="bubble">${lunaFormat(m.content, m.docs)}</div>` +
      lunaDocChips(m.docs) +
      (m.tools && m.tools.length
        ? `<div class="luna-tools">🔎 ${esc(lunaToolWords(m.tools))}</div>` : "");
  log.appendChild(row);
  row.querySelectorAll(".doclink").forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); openDocPath(a.dataset.path); };
  });
  log.scrollTop = log.scrollHeight;
  return row;
}

// Say what Luna did in plain words rather than function names.
function lunaToolWords(tools) {
  const words = {
    search_archive: "searched the archive",
    search_folders: "looked through the folders",
    read_document: "read a document",
    list_my_files: "checked your files",
    get_blockers: "checked your blockers",
    list_reference: "looked in the reference library",
  };
  return [...new Set(tools.map((t) => words[t] || t))].join(", ");
}

// Luna writes markdown-ish text; render the little that matters, escape the rest,
// and turn every document she names into something you can click open.
function lunaFormat(text, docs) {
  const parked = [];
  // Park finished HTML behind a placeholder so later passes can't chew through it.
  const park = (html) => `\u0000${parked.push(html) - 1}\u0000`;

  let html = esc(text);

  // `some/path/file.docx` — a path in backticks is almost always a document.
  html = html.replace(/`([^`]+)`/g, (_m, inner) => {
    const path = inner.trim();
    return /\.(docx?|xlsx?|pptx?|pdf|txt|csv|html?)$/i.test(path)
      ? park(docLink(path))
      : park(`<code>${inner}</code>`);
  });

  // Bare mentions of a document she opened. Matching is deliberately loose:
  // she rewrites "- 2022-23.pptx" as "– 2022–23", so dashes and runs of
  // whitespace are treated as interchangeable and the extension is optional.
  (docs || []).forEach((d) => {
    const stem = esc(d.name).replace(/\.[a-z0-9]+$/i, "");
    if (stem.length < 6) return;
    const pattern = stem
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/[-–—]/g, "[-–—]")
      .replace(/\s+/g, "\\s+");
    html = html.replace(
      new RegExp(pattern + "(\\.[a-z0-9]{2,5})?", "i"),
      () => park(docLink(d.path, d.name)),
    );
  });

  html = html
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^#{1,4} (.+)$/gm, "<b>$1</b>")
    .replace(/^[-*] (.+)$/gm, "• $1")
    .replace(/\n/g, "<br>");

  return html.replace(/\u0000(\d+)\u0000/g, (_m, i) => parked[Number(i)]);
}

// A row of openable documents under Luna's answer — the safety net for when she
// paraphrases a filename closely enough that the text match above misses it.
function lunaDocChips(docs) {
  if (!docs || !docs.length) return "";
  // The same filename often exists under several year folders — one chip is enough.
  const seen = new Set();
  docs = docs.filter((d) => !seen.has(d.name) && seen.add(d.name));
  const top = docs.slice(0, 6);
  return `<div class="luna-docs">${top.map((d) => docLink(d.path, d.name)).join("")}` +
    (docs.length > top.length
      ? `<span class="luna-tools">+${docs.length - top.length} more found</span>` : "") +
    `</div>`;
}

function docLink(path, label) {
  const name = label || path.split("/").pop();
  return `<a href="#" class="doclink" data-path="${esc(path)}">${ficon(name)} ${esc(name)}</a>`;
}

// Open a document Luna referred to. The real file wins whenever a cloud copy
// exists (working folder or Command Centre uploads); extracted text is the
// fallback for archive originals that live only on the office PC.
async function walkReference(prefix) {
  const { data } = await sb.storage.from("reference").list(prefix, { limit: 1000 });
  let out = [];
  for (const e of data || []) {
    if (!e.id) {
      if (e.name === "_app") continue;      // the app's own page, not a document
      out = out.concat(await walkReference(prefix ? `${prefix}/${e.name}` : e.name));
    } else {
      out.push({ orig_name: e.name, storage_path: prefix ? `${prefix}/${e.name}` : e.name });
    }
  }
  return out;
}

let refIndexCache = null;
async function findInReference(name) {
  if (!refIndexCache) refIndexCache = await walkReference("");
  const lower = name.toLowerCase();
  const stem = lower.replace(/\.[a-z0-9]+$/, "");
  return refIndexCache.find((f) => f.orig_name.toLowerCase() === lower) ??
    refIndexCache.find((f) => f.orig_name.toLowerCase().replace(/\.[a-z0-9]+$/, "") === stem);
}

async function openDocPath(path) {
  const name = path.split("/").pop();
  if (path.startsWith("John 2026-27/") || path.startsWith("cc/")) {
    return openViewer({ orig_name: name, storage_path: path, bucket: "reference" });
  }

  const { data: cc } = await sb.from("cc_docs")
    .select("name,storage_path").ilike("name", name).limit(1);
  if (cc && cc.length) {
    return openViewer({ orig_name: cc[0].name, storage_path: cc[0].storage_path, bucket: "reference" });
  }
  const hit = await findInReference(name);
  if (hit) return openViewer({ ...hit, bucket: "reference" });

  let { data } = await sb.from("archive_docs")
    .select("name,year,category,body,path").eq("path", path).limit(1);
  if (!data || !data.length) {
    // Luna may quote a slightly different path — fall back to the file name.
    const name = path.split("/").pop();
    ({ data } = await sb.from("archive_docs")
      .select("name,year,category,body,path").eq("name", name).limit(1));
  }
  if (!data || !data.length) return toast("Could not find that document", true);

  const doc = data[0];
  const winPath = "E:\\Dean old folders\\" + doc.path.replace(/\//g, "\\");
  openTextViewer(
    doc.name,
    doc.body || "(No text could be extracted from this document.)",
    `Text of an archive document${doc.year ? ` from ${doc.year}` : ""}. ` +
    `The original file is on the office PC at:  ${winPath}`,
  );
}

// Many files here also exist in the archive, where their text was extracted.
async function archiveTextFor(name) {
  const { data } = await sb.from("archive_docs").select("body").eq("name", name).limit(1);
  const body = data && data.length ? data[0].body : "";
  return body && body.trim().length > 40 ? body : "";
}

function openTextViewer(title, text, note) {
  viewerFile = null;
  $("#viewer-title").textContent = title;
  $("#viewer-dl").style.display = "none";
  const body = $("#viewer-body");
  body.style.padding = "";
  body.innerHTML =
    (note ? `<div class="doc-note">${esc(note)}</div>` : "") + `<pre>${esc(text)}</pre>`;
  $("#viewer").classList.remove("hidden");
}

async function sendToLuna(text) {
  const q = (text || "").trim();
  if (!q || state.lunaBusy) return;
  const input = $("#luna-input");
  if (input) input.value = "";

  lunaChat.push({ role: "user", content: q });
  paintLunaMsg(lunaChat[lunaChat.length - 1]);

  state.lunaBusy = true;
  $("#luna-send").disabled = true;
  const thinking = paintLunaMsg({ role: "assistant", content: "…thinking" });

  try {
    const { data: sess } = await sb.auth.getSession();
    const res = await fetch(`${window.CLIFFORD.url}/functions/v1/luna-chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sess.session.access_token}`,
        apikey: window.CLIFFORD.anon,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: lunaChat.filter((m) => m.content !== "…thinking"),
        conversation_id: lunaConversationId,
      }),
    });
    const data = await res.json();
    thinking.remove();

    if (!res.ok || data.error) {
      paintLunaMsg({ role: "assistant", content: data.error || "Luna could not answer just now." });
    } else {
      if (data.conversation_id) lunaConversationId = data.conversation_id;
      const msg = {
        role: "assistant",
        content: data.reply,
        tools: data.tools_used || [],
        docs: data.docs || [],
      };
      lunaChat.push(msg);
      paintLunaMsg(msg);
    }
  } catch {
    thinking.remove();
    paintLunaMsg({ role: "assistant", content: "Luna could not be reached — check your connection." });
  } finally {
    state.lunaBusy = false;
    const send = $("#luna-send");
    if (send) send.disabled = false;
    const box = $("#luna-input");
    if (box) box.focus();
  }
}

// ----- Reference library (read-only, shared by everyone) -----
// Files live in the `reference` bucket under folder prefixes; we walk it lazily
// one folder at a time so the whole tree never has to load at once.
async function pageReference() {
  $("#main").innerHTML = `
    <div class="page-head"><h2>📚 Reference</h2></div>
    <div class="card empty">Loading…</div>`;
  await renderReference(state.refPrefix || "");
}

async function renderReference(prefix) {
  state.refPrefix = prefix;
  const { data: entries, error } = await sb.storage.from("reference")
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) {
    $("#main").innerHTML = `<div class="card empty">Could not open the reference library.</div>`;
    return;
  }
  // Storage marks folders by having no id.
  const folders = entries.filter((e) => !e.id);
  const files = entries.filter((e) => e.id);

  const crumbs = prefix ? prefix.split("/") : [];
  const trail = [`<a href="#" data-go="">Reference</a>`].concat(
    crumbs.map((c, i) => `<a href="#" data-go="${esc(crumbs.slice(0, i + 1).join("/"))}">${esc(c)}</a>`),
  ).join(" › ");

  $("#main").innerHTML = `
    <div class="page-head"><h2>📚 Reference</h2></div>
    <div class="card" style="padding:10px 14px">${trail}</div>
    ${!folders.length && !files.length ? `<div class="card empty">This folder is empty.</div>` : `
    <table class="ftable">
      <thead><tr><th>Name</th><th>Size</th><th></th></tr></thead>
      <tbody>
        ${folders.map((f) => `
          <tr class="clickable" data-folder="${esc(f.name)}">
            <td class="fname"><span class="ficon">📁</span>${esc(f.name)}</td>
            <td class="muted">folder</td><td></td>
          </tr>`).join("")}
        ${files.map((f) => `
          <tr class="clickable" data-file="${esc(f.name)}">
            <td class="fname"><span class="ficon">${ficon(f.name)}</span>${esc(f.name)}</td>
            <td>${fmtSize(f.metadata?.size ?? 0)}</td>
            <td class="rowbtns"><button class="btn small ghost" data-act="dl">⬇</button></td>
          </tr>`).join("")}
      </tbody>
    </table>`}`;

  $("#main").querySelectorAll("[data-go]").forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); renderReference(a.dataset.go); };
  });
  $("#main").querySelectorAll("tr[data-folder]").forEach((tr) => {
    tr.onclick = () => renderReference(prefix ? `${prefix}/${tr.dataset.folder}` : tr.dataset.folder);
  });
  $("#main").querySelectorAll("tr[data-file]").forEach((tr) => {
    const name = tr.dataset.file;
    const path = prefix ? `${prefix}/${name}` : name;
    tr.onclick = (e) => {
      const file = { orig_name: name, storage_path: path, bucket: "reference" };
      if (e.target.closest("button")?.dataset.act === "dl") { e.stopPropagation(); downloadFile(file); }
      else openViewer(file);
    };
  });
}

// ---------- viewer / preview ----------
let viewerFile = null;
function closeViewer() { $("#viewer").classList.add("hidden"); $("#viewer-body").innerHTML = ""; viewerFile = null; }
$("#viewer-close").onclick = closeViewer;
$("#viewer").addEventListener("click", (e) => { if (e.target === $("#viewer")) closeViewer(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeViewer(); });
$("#viewer-dl").onclick = () => viewerFile && downloadFile(viewerFile);

async function openViewer(file) {
  viewerFile = file;
  $("#viewer-title").textContent = file.orig_name;
  $("#viewer-dl").style.display = "";   // openTextViewer hides it
  const body = $("#viewer-body");
  body.innerHTML = `<div class="empty">Opening…</div>`;
  $("#viewer").classList.remove("hidden");

  const bucket = file.bucket || "files";
  const ext = file.orig_name.split(".").pop().toLowerCase();
  try {
    if (ext === "pdf") {
      const { data } = await sb.storage.from(bucket).createSignedUrl(file.storage_path, 600);
      body.innerHTML = `<iframe src="${data.signedUrl}"></iframe>`;
      body.style.padding = "0";
      return;
    }
    body.style.padding = "";
    const { data: blob, error } = await sb.storage.from(bucket).download(file.storage_path);
    if (error) throw error;

    if (["html", "htm"].includes(ext)) {
      // Sandboxed: the page renders and its own scripts run, but it cannot
      // reach this app's session or storage.
      const frame = document.createElement("iframe");
      frame.sandbox = "allow-scripts";
      frame.srcdoc = await blob.text();
      body.innerHTML = "";
      body.style.padding = "0";
      body.appendChild(frame);
      return;
    }

    if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
      body.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`;
    } else if (ext === "docx") {
      const res = await window.mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
      body.innerHTML = res.value || "<div class='empty'>Empty document</div>";
    } else if (["xlsx", "xls", "csv"].includes(ext)) {
      const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" });
      let html = "";
      wb.SheetNames.slice(0, 5).forEach((n) => {
        html += `<div class="sheet-name">${esc(n)}</div>` +
          XLSX.utils.sheet_to_html(wb.Sheets[n], { header: "", footer: "" });
      });
      body.innerHTML = html || "<div class='empty'>Empty workbook</div>";
    } else if (["txt", "md", "log", "json"].includes(ext)) {
      body.innerHTML = `<pre>${esc(await blob.text())}</pre>`;
    } else {
      // Legacy .doc/.xls/.ppt can't be rendered in a browser, but the archive
      // holds their extracted text — show that rather than a dead end.
      const text = await archiveTextFor(file.orig_name);
      body.innerHTML = text
        ? `<div class="doc-note">Text of this document. Formatting, images and layout are
             only in the original — use Download to open it in Word.</div><pre>${esc(text)}</pre>`
        : `<div class="empty">No preview for .${esc(ext)} files — use Download to open it in its own app.</div>`;
    }
  } catch (err) {
    console.error(err);
    body.innerHTML = `<div class="empty">Could not preview this file — use Download instead.</div>`;
  }
}

// ---------- admin (read-only in M1) ----------
async function pageAdmin() {
  if (state.profile.role !== "admin") { location.hash = "#/dashboard"; return; }
  $("#main").innerHTML = `<div class="page-head"><h2>Admin</h2></div><div id="admin-users" class="card">Loading…</div>`;
  const { data: users } = await sb.from("profiles").select("*").order("created_at");
  $("#admin-users").innerHTML = `
    <b>People</b>
    <table class="ftable" style="margin-top:10px">
      <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Joined</th></tr></thead>
      <tbody>${(users || []).map((u) => `
        <tr><td>${esc(u.display_name)}</td><td>${esc(u.username)}</td>
        <td>${esc(u.role)}</td><td class="muted">${fmtDate(u.created_at)}</td></tr>`).join("")}
      </tbody>
    </table>
    <p class="muted" style="margin-bottom:0">Password resets and new accounts are done from the setup computer for now.</p>`;
}

// ---------- go ----------
boot();
