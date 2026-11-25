// CampusERP (Sample Institute of Technology) - single-page client (vanilla JS, no build step).
const API = "/api";
const app = document.getElementById("app");
const shell = document.getElementById("shell");
const loginScreen = document.getElementById("login-screen");
const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("sidebar-backdrop");

const PERIOD_TIMES = {
  1: "09:00 AM",
  2: "10:00 AM",
  3: "11:30 AM",
  4: "02:00 PM",
  5: "03:00 PM",
  6: "04:00 PM",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n === null || n === undefined ? "-" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const dt = (s) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-");
const shortDate = (s) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-");

async function api(path, opts = {}) {
  const init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API + path, init);
  if (opts.raw) return res;
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.detail || `Request failed (${res.status})`);
  return data;
}

function toast(text, ok = true) {
  const el = document.createElement("div");
  el.className = `msg ${ok ? "ok" : "err"}`;
  el.textContent = text;
  document.getElementById("toast-area").prepend(el);
  setTimeout(() => el.remove(), 4000);
}

function table(headers, rows) {
  if (!rows.length) return `<p class="muted">Nothing to show yet.</p>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function tabsFor(role) {
  if (role === "student") {
    return [
      ["dashboard", "▦", "Dashboard"],
      ["profile", "👤", "My Profile"],
      ["attendance", "📊", "Attendance"],
      ["timetable", "📅", "Timetable"],
      ["assignments", "📝", "Assignments"],
      ["marks", "📈", "Marks"],
      ["results", "📚", "Results"],
      ["exams", "🗓️", "Exams"],
      ["materials", "📁", "Materials"],
      ["fees", "💳", "Fee Details"],
      ["notices", "🔔", "Notices"],
    ];
  }
  if (role === "faculty") {
    return [
      ["courses", "▦", "My Courses"],
      ["attendance", "📊", "Attendance"],
      ["marks", "📈", "Marks"],
      ["assignments", "📝", "Assignments"],
      ["materials", "📁", "Materials"],
      ["notices", "🔔", "Send Notice"],
    ];
  }
  return [
    ["admin-dash", "▦", "Dashboard"],
    ["admin-students", "🎓", "Students"],
    ["admin-faculty", "👩‍🏫", "Faculty"],
    ["admin-courses", "📚", "Courses"],
    ["admin-tools", "📤", "Import / Export"],
    ["admin-audit", "🛡️", "Audit Log"],
  ];
}

function openMobileMenu() {
  sidebar.classList.add("open");
  backdrop.hidden = false;
}

function closeMobileMenu() {
  sidebar.classList.remove("open");
  backdrop.hidden = true;
}

document.getElementById("menu-open").onclick = openMobileMenu;
document.getElementById("menu-close").onclick = closeMobileMenu;
backdrop.onclick = closeMobileMenu;

let me = null;

async function boot() {
  try {
    me = await api("/auth/me");
  } catch {
    return showLogin();
  }
  renderShell();
}

function updateDateSubtitle() {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  document.getElementById("date").textContent = formatted;
}

function setBellCount(unread) {
  const bell = document.getElementById("bell-btn");
  const badgeEl = document.getElementById("bell-badge");
  if (me?.role !== "student") {
    bell.hidden = true;
    return;
  }
  bell.hidden = false;
  if (unread > 0) {
    badgeEl.hidden = false;
    badgeEl.textContent = unread > 99 ? "99+" : String(unread);
  } else {
    badgeEl.hidden = true;
  }
}

function renderShell() {
  loginScreen.hidden = true;
  shell.hidden = false;
  updateDateSubtitle();

  const roleLabel = me.role.charAt(0).toUpperCase() + me.role.slice(1);
  document.getElementById("user-name").textContent = me.name;
  document.getElementById("user-role").textContent = `${roleLabel} · ${me.login_id}`;
  document.getElementById("user-avatar").textContent = (me.name || me.login_id || "U").trim().charAt(0).toUpperCase();

  const bell = document.getElementById("bell-btn");
  bell.hidden = me.role !== "student";
  bell.onclick = () => go("notices");

  const tabs = document.getElementById("tabs");
  const items = tabsFor(me.role);
  tabs.innerHTML = items.map(([k, icon, label]) => `<a href="#" data-tab="${k}">${icon} ${esc(label)}</a>`).join("");
  tabs.onclick = (e) => {
    const a = e.target.closest("a[data-tab]");
    if (!a) return;
    e.preventDefault();
    go(a.dataset.tab);
  };

  document.getElementById("nav-settings").onclick = (e) => {
    e.preventDefault();
    go("settings");
  };

  go(items[0][0]);
}

function go(tab) {
  closeMobileMenu();
  document.querySelectorAll(".sidebar a[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));

  const allTabs = [...tabsFor(me.role), ["settings", "⚙", "Settings"]];
  const found = allTabs.find(([k]) => k === tab);
  document.getElementById("page-title").textContent = found ? found[2] : "Dashboard";

  const views = {
    dashboard: studentDashboard,
    profile: studentProfile,
    attendance: me.role === "student" ? studentAttendance : facultyAttendance,
    marks: me.role === "student" ? studentMarks : facultyMarks,
    results: studentResults,
    timetable: studentTimetable,
    exams: studentExams,
    assignments: me.role === "student" ? studentAssignments : facultyAssignments,
    materials: materialsView,
    fees: studentFees,
    notices: me.role === "student" ? studentNotices : facultyNotice,
    courses: facultyCourses,
    "admin-dash": adminDashboard,
    "admin-students": adminStudents,
    "admin-faculty": adminFaculty,
    "admin-courses": adminCourses,
    "admin-tools": adminTools,
    "admin-audit": adminAudit,
    settings: settingsView,
  };

  app.innerHTML = `<div class="card"><p class="muted">Loading...</p></div>`;
  Promise.resolve(views[tab]()).catch((err) => {
    app.innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
  });
}

function showLogin() {
  shell.hidden = true;
  loginScreen.hidden = false;
  loginScreen.innerHTML = `
    <div class="login-card">
      <h2 class="logo">Campus<span>ERP</span></h2>
      <p class="subtitle">Sample Institute of Technology · Sign in with your USN, Faculty ID or email.</p>
      <form id="loginForm">
        <label>Login ID or email<input name="login" required autocomplete="username" placeholder="e.g. 1SI24CS026 or ADMIN01"></label>
        <label>Password<input name="password" type="password" required autocomplete="current-password" placeholder="Enter your password"></label>
        <button type="submit">Sign in</button>
        <div id="loginErr" style="margin-top:12px"></div>
      </form>
    </div>`;
  document.getElementById("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      me = await api("/auth/login", { method: "POST", body: { login: f.get("login"), password: f.get("password") } });
      renderShell();
    } catch (err) {
      document.getElementById("loginErr").innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
    }
  };
}

document.getElementById("logout").onclick = async (e) => {
  e.preventDefault();
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    // Ignore logout network error and clear local session view
  }
  me = null;
  showLogin();
};

// ---------- helpers ----------
function courseSelect(courses, id = "course") {
  return `<label>Course<select id="${id}">${courses.map((c) => `<option value="${c.id}">${esc(c.code)} - ${esc(c.name)}</option>`).join("")}</select></label>`;
}

function passwordCard(title = "Change password") {
  return `<div class="card"><h2>${title}</h2><form id="pwForm" class="row">
    <label>Current password<input name="current" type="password" required></label>
    <label>New password (min 8)<input name="new" type="password" required minlength="8"></label>
    <button>Update password</button></form></div>`;
}

function bindPassword() {
  const f = document.getElementById("pwForm");
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(f);
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: d.get("current"), new_password: d.get("new") } });
      toast("Password updated");
      f.reset();
    } catch (err) {
      toast(err.message, false);
    }
  };
}

async function settingsView() {
  app.innerHTML =
    `<div class="card"><h2>Account details</h2>
      ${table(["Field", "Value"], [
        ["Name", esc(me.name)],
        ["Login ID", esc(me.login_id)],
        ["Email", esc(me.email)],
        ["Role", esc(me.role.toUpperCase())],
      ])}
    </div>` + passwordCard("Security & Password");
  bindPassword();
}

function badge(s) {
  const map = { paid: "ok", success: "ok", partial: "warn", pending: "warn", overdue: "bad", failed: "bad" };
  return `<span class="badge ${map[s] ?? ""}">${esc(s)}</span>`;
}

// ---------- student ----------
async function studentDashboard() {
  const [profile, att, res, fees, asg, notes, tt] = await Promise.all([
    api("/students/me"),
    api("/attendance/me"),
    api("/results/me"),
    api("/fees/me"),
    api("/assignments"),
    api("/notifications/me"),
    api("/timetable"),
  ]);

  setBellCount(notes.unread || 0);

  const firstName = (profile.name || me.name || "Student").split(" ")[0];
  const pendingCount = asg.filter((a) => !a.my_submission).length;
  const attPct = att.overall_percent;
  const attGood = attPct === null || attPct >= 75;

  // Pick today's weekday (1=Mon..6=Sat); fall back to Monday on Sunday.
  const jsDay = new Date().getDay();
  const todayIdx = jsDay >= 1 && jsDay <= 6 ? jsDay : 1;
  const todaySlots = tt.filter((s) => s.day === todayIdx).sort((a, b) => a.period - b.period);
  const ttLabel = jsDay === 0 ? "Monday's Timetable" : "Today's Timetable";

  const dotColors = ["", "orange-dot", "purple-dot"];
  const recentNotices = (notes.items || []).slice(0, 4);
  const upcomingAsg = asg.slice(0, 6);
  const lowAtt = att.courses.filter((c) => c.warning);

  app.innerHTML = `
    <section class="welcome">
      <div>
        <h1>Hello, ${esc(firstName)}! 👋</h1>
        <p>${esc(profile.dept)} · Semester ${profile.semester} (Section ${esc(profile.section)}) — Here's what's happening with your academics today.</p>
      </div>
      <div class="welcome-icon">🎓</div>
    </section>

    <section class="stats">
      <div class="card stat-card">
        <div class="stat-icon blue">📚</div>
        <p>Total Subjects</p>
        <h2>${att.courses.length}</h2>
        <small>Semester ${profile.semester}</small>
      </div>

      <div class="card stat-card">
        <div class="stat-icon ${attGood ? "green" : "red"}">📊</div>
        <p>Attendance</p>
        <h2>${attPct ?? "-"}%</h2>
        <small class="${attGood ? "positive" : "negative"}">${attGood ? "Good standing" : "Below 75% warning"}</small>
      </div>

      <div class="card stat-card">
        <div class="stat-icon orange">📝</div>
        <p>Assignments</p>
        <h2>${pendingCount}</h2>
        <small>Pending submissions</small>
      </div>

      <div class="card stat-card">
        <div class="stat-icon purple">🏆</div>
        <p>CGPA</p>
        <h2>${res.cgpa ?? "-"}</h2>
        <small>${fees.total_balance > 0 ? `Fee due: Rs. ${fmt(fees.total_balance)}` : "All fees paid"}</small>
      </div>
    </section>

    ${lowAtt.length ? `
    <div class="msg err">
      <strong>Low Attendance Alert (&lt;75%):</strong>
      ${lowAtt.map((c) => `${esc(c.course)} (${c.percent}%)`).join(" · ")}
    </div>` : ""}

    <section class="content-grid">
      <div class="card">
        <div class="section-heading">
          <h3>${ttLabel}</h3>
          <button class="view-all" data-jump="timetable">View all →</button>
        </div>
        ${todaySlots.length
          ? todaySlots.map((s) => {
              const isLab = /lab/i.test(s.room || "") || /lab/i.test(s.course || "");
              return `<div class="class-item">
                <div class="time">${PERIOD_TIMES[s.period] || `Period ${s.period}`}</div>
                <div class="class-info">
                  <strong>${esc(s.course)}</strong>
                  <small>${esc(s.room)} · Section ${esc(s.section)}</small>
                </div>
                <span class="class-tag ${isLab ? "lab" : ""}">${isLab ? "Lab" : "Lecture"}</span>
              </div>`;
            }).join("")
          : `<p class="muted">No classes scheduled for ${DAY_NAMES[todayIdx - 1]}.</p>`}
      </div>

      <div class="card">
        <div class="section-heading">
          <h3>Announcements</h3>
          <button class="view-all" data-jump="notices">View all →</button>
        </div>
        ${recentNotices.length
          ? recentNotices.map((n, idx) => `
            <div class="announcement">
              <div class="announcement-dot ${dotColors[idx % dotColors.length]}"></div>
              <div>
                <strong>${esc(n.title)}</strong>
                <p>${esc(n.body)}</p>
                <small>${dt(n.created_at)}</small>
              </div>
            </div>`).join("")
          : `<p class="muted">No announcements right now.</p>`}
      </div>
    </section>

    <section class="card assignments">
      <div class="section-heading">
        <h3>Upcoming Assignments</h3>
        <button class="view-all" data-jump="assignments">View all →</button>
      </div>
      ${table(
        ["Subject", "Assignment", "Due Date", "Status"],
        upcomingAsg.map((a) => {
          const s = a.my_submission;
          const pill = s
            ? `<span class="status submitted">${s.is_late ? "Late" : "Submitted"}</span>`
            : a.overdue
              ? `<span class="status overdue">Overdue</span>`
              : `<span class="status pending">Pending</span>`;
          return [esc(a.course), esc(a.title), shortDate(a.deadline), pill];
        })
      )}
    </section>
  `;

  app.querySelectorAll("[data-jump]").forEach((btn) => {
    btn.onclick = () => go(btn.dataset.jump);
  });
}

async function studentProfile() {
  const p = await api("/students/me");
  app.innerHTML = `<div class="card"><h2>My profile</h2>
    ${table(["Field", "Value"], [
      ["Name", esc(p.name)],
      ["USN", esc(p.usn)],
      ["Email", esc(p.email)],
      ["Branch", esc(p.dept)],
      ["Semester / Section", `${p.semester} / ${esc(p.section)}`],
      ["Batch", p.batch_year],
      ["DOB", esc(p.dob)],
      ["Blood group", esc(p.blood_group)],
      ["Address", esc(p.address)],
      ["Guardian", `${esc(p.guardian_name)} (${esc(p.guardian_phone)})`],
      ["Phone", esc(p.phone)],
    ])}
  </div>
  <div class="card"><h2>Update contact details</h2><form id="profForm" class="row">
    <label>Phone<input name="phone" value="${esc(p.phone)}"></label>
    <label>Address<input name="address" value="${esc(p.address)}"></label>
    <label>Blood group<input name="blood_group" value="${esc(p.blood_group)}"></label>
    <label>Guardian name<input name="guardian_name" value="${esc(p.guardian_name)}"></label>
    <label>Guardian phone<input name="guardian_phone" value="${esc(p.guardian_phone)}"></label>
    <button>Save changes</button></form></div>` + passwordCard();
  bindPassword();
  document.getElementById("profForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/students/me", { method: "PUT", body: Object.fromEntries(new FormData(e.target)) });
      toast("Profile saved");
      studentProfile();
    } catch (err) {
      toast(err.message, false);
    }
  };
}

async function studentAttendance() {
  const a = await api("/attendance/me");
  app.innerHTML = `<div class="card"><h2>Attendance: ${a.overall_percent ?? "-"}% overall</h2>
    ${table(["Course", "Present", "Total", "Percent", "Status"], a.courses.map((c) => [
      esc(c.course),
      c.present,
      c.total,
      c.percent === null ? "-" : c.percent + "%",
      c.warning ? `<span class="badge bad">Below 75%</span>` : `<span class="badge ok">Good</span>`,
    ]))}</div>
    ${a.courses.map((c) => `<div class="card"><h2>${esc(c.course)} log</h2>${table(
      ["Date", "Status"],
      c.log.slice(-30).reverse().map((l) => [l.date, l.status === "P" ? `<span class="badge ok">Present</span>` : `<span class="badge bad">Absent</span>`])
    )}</div>`).join("")}`;
}

async function studentMarks() {
  const rows = await api("/marks/me");
  app.innerHTML = `<div class="card"><h2>Published marks</h2>
    ${table(["Course", "IA1", "IA2", "IA3", "Assignment", "Lab", "SEE", "Internal (50)", "Total (100)", "Grade"],
      rows.map((r) => [esc(r.course), fmt(r.ia1), fmt(r.ia2), fmt(r.ia3), fmt(r.assignment), fmt(r.lab), fmt(r.see),
        fmt(r.internal), fmt(r.total), `<b>${esc(r.grade)}</b>`]))}
    <p class="muted" style="margin-top:12px">Internal = average of best two IAs plus assignment and lab (capped at 50). SEE is scaled to 50.</p></div>`;
}

async function studentResults() {
  const r = await api("/results/me");
  app.innerHTML = `
    <section class="stats">
      <div class="card stat-card">
        <div class="stat-icon purple">🏆</div>
        <p>Overall CGPA</p>
        <h2>${r.cgpa ?? "-"}</h2>
        <small>Across published semesters</small>
      </div>
      <div class="card stat-card">
        <div class="stat-icon blue">📚</div>
        <p>Semesters Published</p>
        <h2>${r.semesters.length}</h2>
        <small>Grade cards available</small>
      </div>
    </section>
    <div class="card"><h2>Semester-wise SGPA</h2>
      ${table(["Semester", "SGPA"], r.semesters.map((s) => [`Semester ${s.semester}`, `<b>${s.sgpa}</b>`]))}
      <p class="muted" style="margin-top:12px">Only subjects whose marks have been published are included.</p>
    </div>`;
}

async function studentTimetable() {
  const t = await api("/timetable");
  const sorted = [...t].sort((a, b) => a.day - b.day || a.period - b.period);
  app.innerHTML = `<div class="card"><h2>Weekly timetable</h2>
    ${table(["Day", "Time", "Course", "Room"], sorted.map((s) => [
      DAYS[s.day - 1] || s.day,
      PERIOD_TIMES[s.period] || `Period ${s.period}`,
      esc(s.course),
      esc(s.room),
    ]))}</div>`;
}

async function studentExams() {
  const e = await api("/exams/me");
  app.innerHTML = `<div class="card"><h2>Exam schedule</h2>
    ${table(["Exam", "Course", "Date", "Time", "Room"], e.map((x) => [esc(x.type), esc(x.course), x.date, esc(x.time), esc(x.room)]))}</div>`;
}

async function studentAssignments() {
  const list = await api("/assignments");
  app.innerHTML = `<div class="card"><h2>Assignments</h2>
    ${table(["Title", "Course", "Deadline", "Status", "Grade", "Action"], list.map((a) => {
      const s = a.my_submission;
      const status = s
        ? s.is_late ? `<span class="status pending">Late</span>` : `<span class="status submitted">Submitted</span>`
        : a.overdue ? `<span class="status overdue">Overdue</span>` : `<span class="status pending">Open</span>`;
      const grade = s && s.marks !== null ? `${s.marks}/${a.max_marks}` : "-";
      const action = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" data-asg="${a.id}" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg,.xlsx" style="width:auto;max-width:220px;padding:4px">
        <button class="small" data-submit="${a.id}">${s ? "Resubmit" : "Submit"}</button>
      </div>`;
      return [esc(a.title), esc(a.course), dt(a.deadline), status, grade, action];
    }))}</div>`;
  app.querySelectorAll("[data-submit]").forEach((btn) => (btn.onclick = async () => {
    const input = app.querySelector(`input[data-asg="${btn.dataset.submit}"]`);
    if (!input.files[0]) return toast("Choose a file first", false);
    const fd = new FormData();
    fd.append("file", input.files[0]);
    try {
      const r = await api(`/assignments/${btn.dataset.submit}/submit`, { method: "POST", body: fd });
      toast(r.is_late ? "Submitted (late)" : "Submitted");
      studentAssignments();
    } catch (err) {
      toast(err.message, false);
    }
  }));
}

async function materialsView() {
  const courses = await api("/courses/me");
  app.innerHTML = `<div class="card"><h2>Study materials</h2>
    <div class="row">${courseSelect(courses)}<label>Search<input id="mq" placeholder="Filter by title..."></label><button id="mgo">Search</button></div>
    <div id="mlist" style="margin-top:12px"></div></div>
    ${me.role === "faculty" ? uploadMaterialCard(courses) : ""}`;
  const load = async () => {
    const q = document.getElementById("mq").value;
    const cid = document.getElementById("course").value;
    const items = await api(`/materials?course_id=${cid}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    const byUnit = {};
    items.forEach((m) => (byUnit[m.unit] ||= []).push(m));
    document.getElementById("mlist").innerHTML =
      Object.keys(byUnit).sort().map((u) => `<h3>${esc(u)}</h3>${table(
        ["Title", "Type", "Action"],
        byUnit[u].map((m) => [esc(m.title), esc(m.type), `<a href="${API}/downloads/material/${m.id}" target="_blank">${m.is_link ? "Open link" : "Download"}</a>`])
      )}`).join("") || `<p class="muted">No materials found.</p>`;
  };
  document.getElementById("mgo").onclick = load;
  document.getElementById("course").onchange = load;
  if (courses.length) load();
  const up = document.getElementById("upMat");
  if (up) up.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/materials", { method: "POST", body: new FormData(up) });
      toast("Uploaded");
      up.reset();
      load();
    } catch (err) {
      toast(err.message, false);
    }
  };
}

function uploadMaterialCard(courses) {
  return `<div class="card"><h2>Upload material</h2><form id="upMat" class="row">
    <label>Course<select name="course_id">${courses.map((c) => `<option value="${c.id}">${esc(c.code)} - ${esc(c.name)}</option>`).join("")}</select></label>
    <label>Unit<input name="unit" value="Unit 1" required></label>
    <label>Title<input name="title" required></label>
    <label>Type<select name="type"><option>notes</option><option>ppt</option><option>question_paper</option><option>video</option></select></label>
    <label>File<input type="file" name="file"></label>
    <label>or link<input name="url" placeholder="https://..."></label>
    <button>Upload</button></form></div>`;
}

async function studentFees() {
  const f = await api("/fees/me");
  const pendingRecs = f.records.filter((r) => r.balance > 0);
  const payments = await api("/fees/payments/me");
  app.innerHTML = `
    <section class="stats">
      <div class="card stat-card"><div class="stat-icon blue">💳</div><p>Total Due</p><h2>Rs. ${fmt(f.total_due)}</h2><small>All semesters</small></div>
      <div class="card stat-card"><div class="stat-icon green">✓</div><p>Total Paid</p><h2>Rs. ${fmt(f.total_paid)}</h2><small class="positive">Verified payments</small></div>
      <div class="card stat-card"><div class="stat-icon ${f.total_balance > 0 ? "orange" : "green"}">₹</div><p>Balance</p><h2>Rs. ${fmt(f.total_balance)}</h2><small>${f.total_balance > 0 ? "Pending balance" : "Cleared"}</small></div>
    </section>
    <div class="card"><h2>Fee records</h2>
      ${table(["Sem", "Fee", "Due date", "Amount", "Paid", "Balance", "Status"], f.records.map((r) => [
        r.semester, esc(r.fee_type), r.due_date, fmt(r.amount_due), fmt(r.amount_paid), fmt(r.balance), badge(r.status),
      ]))}</div>
    ${pendingRecs.length ? `<div class="card"><h2>Pay fees (mock gateway)</h2>
      <form id="payForm" class="row">
        <label>Fee<select name="fee_record_id">${pendingRecs.map((r) => `<option value="${r.id}" data-bal="${r.balance}">Sem ${r.semester} - ${esc(r.fee_type)} (balance Rs. ${fmt(r.balance)})</option>`).join("")}</select></label>
        <label>Method<select name="method"><option>UPI</option><option>Credit/Debit Card</option><option>Net Banking</option><option>Wallet</option></select></label>
        <label>Amount (Rs.)<input name="amount" type="number" step="0.01" min="1" required></label>
        <button>Pay now</button></form>
      <p class="muted">Mock gateway: no password or OTP. Payments succeed unless a demo failure rate is configured.</p></div>` : `<div class="msg ok">All fees are paid.</div>`}
    <div class="card"><h2>Payment history</h2>
      ${table(["Date", "Txn ID", "Amount", "Method", "Status", "Receipt"], payments.map((p) => [
        dt(p.paid_at), esc(p.txn_id), fmt(p.amount), esc(p.method), badge(p.status),
        p.status === "success" ? `<a href="${API}/fees/payments/${p.id}/receipt" target="_blank">PDF Receipt</a>` : "-",
      ]))}</div>`;
  const pf = document.getElementById("payForm");
  if (pf) {
    const sel = pf.fee_record_id;
    const setMax = () => {
      const bal = sel.selectedOptions[0].dataset.bal;
      pf.amount.max = bal;
      pf.amount.value = bal;
    };
    sel.onchange = setMax;
    setMax();
    pf.onsubmit = async (e) => {
      e.preventDefault();
      const d = new FormData(pf);
      try {
        const r = await api("/fees/pay", { method: "POST", body: { fee_record_id: Number(d.get("fee_record_id")), method: d.get("method"), amount: Number(d.get("amount")) } });
        toast(r.status === "success" ? `Payment successful. Txn ${r.txn_id}` : "Payment failed, please retry", r.status === "success");
        studentFees();
      } catch (err) {
        toast(err.message, false);
      }
    };
  }
}

async function studentNotices() {
  const n = await api("/notifications/me");
  setBellCount(n.unread || 0);
  app.innerHTML = `<div class="card">
    <div class="section-heading">
      <h3>Notices &amp; Alerts (${n.unread} unread)</h3>
      <button id="readAll" class="small">Mark all read</button>
    </div>
    ${n.items.map((i) => `<div class="notice-card ${i.is_read ? "" : "unread"}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <strong>${esc(i.title)}</strong>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="muted">${dt(i.created_at)}</span>
          ${i.is_read ? "" : `<button class="small" data-read="${i.id}">Mark read</button>`}
        </div>
      </div>
      <div style="margin-top:6px;font-size:14px;color:#334155">${esc(i.body)}</div></div>`).join("") || `<p class="muted">No notices.</p>`}</div>`;
  document.getElementById("readAll").onclick = async () => {
    await api("/notifications/read-all", { method: "POST" });
    studentNotices();
  };
  app.querySelectorAll("[data-read]").forEach((b) => (b.onclick = async () => {
    await api(`/notifications/${b.dataset.read}/read`, { method: "POST" });
    studentNotices();
  }));
}

// ---------- faculty ----------
async function facultyCourses() {
  const [courses, exams] = await Promise.all([api("/courses/me"), api("/exams/me")]);
  const firstName = (me.name || "Faculty").split(" ")[0];
  app.innerHTML = `
    <section class="welcome">
      <div>
        <h1>Welcome, ${esc(firstName)}! 👋</h1>
        <p>Manage your courses, mark attendance, publish grades, and share materials.</p>
      </div>
      <div class="welcome-icon">👩‍🏫</div>
    </section>
    <div class="card"><h2>My courses</h2>
      ${table(["Code", "Course", "Semester", "Credits"], courses.map((c) => [esc(c.code), esc(c.name), c.semester, c.credits]))}</div>
    <div class="card"><h2>My exam schedule</h2>
      ${table(["Exam", "Course", "Date", "Time", "Room"], exams.map((x) => [esc(x.type), esc(x.course), x.date, esc(x.time), esc(x.room)]))}</div>`;
}

async function facultyAttendance() {
  const courses = await api("/courses/me");
  if (!courses.length) return (app.innerHTML = `<div class="card"><p class="muted">No courses assigned.</p></div>`);
  app.innerHTML = `<div class="card"><h2>Mark attendance</h2>
    <div class="row">${courseSelect(courses)}<label>Date<input type="date" id="adate" value="${new Date().toISOString().slice(0, 10)}"></label>
    <button id="aload">Load class</button></div><div id="aroster" style="margin-top:12px"></div></div>`;
  const load = async () => {
    const cid = document.getElementById("course").value;
    const day = document.getElementById("adate").value;
    const [students, existing] = await Promise.all([api(`/courses/${cid}/students`), api(`/attendance/course/${cid}?on=${day}`)]);
    const prev = Object.fromEntries(existing.map((e) => [e.student_id, e.status]));
    document.getElementById("aroster").innerHTML = `<div class="table-wrap"><table><thead><tr><th>USN</th><th>Name</th><th>Sec</th><th>Present</th></tr></thead><tbody>
      ${students.map((s) => `<tr><td>${esc(s.usn)}</td><td>${esc(s.name)}</td><td>${esc(s.section)}</td>
      <td><input type="checkbox" data-sid="${s.id}" ${prev[s.id] !== "A" ? "checked" : ""} style="width:auto"></td></tr>`).join("")}
      </tbody></table></div><div class="row" style="margin-top:14px"><button id="asave">Save attendance</button></div>`;
    document.getElementById("asave").onclick = async () => {
      const records = [...document.querySelectorAll("[data-sid]")].map((cb) => ({ student_id: Number(cb.dataset.sid), status: cb.checked ? "P" : "A" }));
      try {
        await api("/attendance", { method: "POST", body: { course_id: Number(cid), date: day, records } });
        toast(`Saved ${records.length} records`);
      } catch (err) {
        toast(err.message, false);
      }
    };
  };
  document.getElementById("aload").onclick = load;
  load();
}

async function facultyMarks() {
  const courses = await api("/courses/me");
  if (!courses.length) return (app.innerHTML = `<div class="card"><p class="muted">No courses assigned.</p></div>`);
  app.innerHTML = `<div class="card"><h2>Enter marks</h2>
    <div class="row">${courseSelect(courses)}<button id="mload">Load</button></div><div id="mroster" style="margin-top:12px"></div></div>`;
  const load = async () => {
    const cid = document.getElementById("course").value;
    const [students, marks] = await Promise.all([api(`/courses/${cid}/students`), api(`/marks/course/${cid}`)]);
    const by = Object.fromEntries(marks.map((m) => [m.student_id, m]));
    const f = ["ia1", "ia2", "ia3", "assignment", "lab", "see"];
    document.getElementById("mroster").innerHTML = `<div class="table-wrap"><table><thead><tr><th>USN</th><th>Name</th>${f.map((x) => `<th>${x.toUpperCase()}</th>`).join("")}<th>Grade</th><th></th></tr></thead><tbody>
      ${students.map((s) => {
        const m = by[s.id] || {};
        return `<tr data-row="${s.id}"><td>${esc(s.usn)}</td><td>${esc(s.name)}</td>
          ${f.map((x) => `<td><input type="number" step="0.5" data-f="${x}" value="${m[x] ?? ""}" style="width:72px"></td>`).join("")}
          <td><b>${esc(m.grade ?? "-")}</b></td><td><button class="small" data-save="${s.id}">Save</button></td></tr>`;
      }).join("")}
      </tbody></table></div>
      <div class="row" style="margin-top:14px"><button id="pub" class="danger">Publish marks to students</button></div>
      <p class="muted">Students see marks only after you publish. Marks can still be edited after publishing.</p>`;
    document.querySelectorAll("[data-save]").forEach((b) => (b.onclick = async () => {
      const row = document.querySelector(`tr[data-row="${b.dataset.save}"]`);
      const body = { course_id: Number(cid), student_id: Number(b.dataset.save) };
      row.querySelectorAll("[data-f]").forEach((i) => {
        if (i.value !== "") body[i.dataset.f] = Number(i.value);
      });
      try {
        const r = await api("/marks", { method: "POST", body });
        row.cells[row.cells.length - 2].innerHTML = `<b>${esc(r.grade)}</b>`;
        toast("Saved");
      } catch (err) {
        toast(err.message, false);
      }
    }));
    document.getElementById("pub").onclick = async () => {
      if (!confirm("Publish all marks for this course to students?")) return;
      try {
        const r = await api(`/marks/publish?course_id=${cid}`, { method: "POST" });
        toast(`Published ${r.published} records`);
      } catch (err) {
        toast(err.message, false);
      }
    };
  };
  document.getElementById("mload").onclick = load;
  document.getElementById("course").onchange = load;
  load();
}

async function facultyAssignments() {
  const [courses, list] = await Promise.all([api("/courses/me"), api("/assignments")]);
  app.innerHTML = `<div class="card"><h2>Post an assignment</h2>
    <form id="asgForm" class="row">
      <label>Course<select name="course_id">${courses.map((c) => `<option value="${c.id}">${esc(c.code)} - ${esc(c.name)}</option>`).join("")}</select></label>
      <label>Title<input name="title" required></label>
      <label>Deadline<input type="datetime-local" name="deadline" required></label>
      <label>Max marks<input name="max_marks" type="number" value="10" min="1"></label>
      <label>Description<input name="description"></label>
      <label>Attachment<input type="file" name="file"></label>
      <button>Post</button></form></div>
    <div class="card"><h2>Assignments</h2>${table(["Title", "Course", "Deadline", "Action"], list.map((a) =>
      [esc(a.title), esc(a.course), dt(a.deadline), `<button class="small" data-view="${a.id}">Submissions</button>`]))}
      <div id="subs" style="margin-top:16px"></div></div>`;
  document.getElementById("asgForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get("deadline")) fd.set("deadline", fd.get("deadline") + ":00");
    try {
      await api("/assignments", { method: "POST", body: fd });
      toast("Assignment posted");
      facultyAssignments();
    } catch (err) {
      toast(err.message, false);
    }
  };
  app.querySelectorAll("[data-view]").forEach((b) => (b.onclick = async () => {
    const subs = await api(`/assignments/${b.dataset.view}/submissions`);
    document.getElementById("subs").innerHTML = `<h3>Submissions</h3>${table(["USN", "Name", "Submitted", "Late", "Marks", "Grade"],
      subs.map((s) => [esc(s.usn), esc(s.name), dt(s.submitted_at), s.is_late ? "Yes" : "No", s.marks ?? "-",
        `<form data-grade="${s.id}" class="row" style="min-width:0"><input name="marks" type="number" step="0.5" value="${s.marks ?? ""}" style="width:80px"><input name="feedback" value="${esc(s.feedback ?? "")}" placeholder="Feedback"><button class="small">Save</button></form>`]))}`;
    document.querySelectorAll("[data-grade]").forEach((f) => (f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(`/submissions/${f.dataset.grade}/grade`, { method: "POST", body: new FormData(f) });
        toast("Graded");
      } catch (err) {
        toast(err.message, false);
      }
    }));
  }));
}

async function facultyNotice() {
  const courses = await api("/courses/me");
  app.innerHTML = `<div class="card"><h2>Send a notice to a course</h2>
    <form id="nForm" class="row">${courseSelect(courses)}
      <label>Title<input name="title" required></label>
      <label>Message<textarea name="body" required rows="2"></textarea></label>
      <button>Send notice</button></form></div>`;
  document.getElementById("nForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    try {
      const r = await api("/notifications", {
        method: "POST",
        body: { title: d.get("title"), body: d.get("body"), scope: "course", course_id: Number(document.getElementById("course").value) },
      });
      toast(`Sent to ${r.recipients} students`);
      e.target.reset();
    } catch (err) {
      toast(err.message, false);
    }
  };
}

// ---------- admin ----------
async function adminDashboard() {
  const s = await api("/admin/stats");
  app.innerHTML = `
    <section class="welcome">
      <div>
        <h1>Admin Console 👋</h1>
        <p>Monitor institution metrics, manage users, broadcast notices, and run automated reminders.</p>
      </div>
      <div class="welcome-icon">🏛️</div>
    </section>
    <section class="stats">
      <div class="card stat-card"><div class="stat-icon blue">🎓</div><p>Students</p><h2>${s.students}</h2><small>Active accounts</small></div>
      <div class="card stat-card"><div class="stat-icon green">👩‍🏫</div><p>Faculty</p><h2>${s.faculty}</h2><small>Teaching staff</small></div>
      <div class="card stat-card"><div class="stat-icon purple">📚</div><p>Courses</p><h2>${s.courses}</h2><small>Across departments</small></div>
      <div class="card stat-card"><div class="stat-icon orange">💳</div><p>Open Fee Records</p><h2>${s.pending_fee_records}</h2><small>Pending / partial dues</small></div>
    </section>
    <div class="card"><h2>Post a global notice</h2>
      <form id="gForm" class="row"><label>Title<input name="title" required></label><label>Message<input name="body" required></label>
      <label>Audience<select name="scope"><option value="all">All students</option></select></label><button>Send notice</button></form></div>
    <div class="card"><h2>Automated reminders</h2><p class="muted" style="margin-bottom:12px">Creates deadline (48h) and fee-due notifications. Run daily.</p>
      <button id="rem">Run reminders now</button></div>`;
  document.getElementById("gForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    try {
      const r = await api("/notifications", { method: "POST", body: { title: d.get("title"), body: d.get("body"), scope: "all" } });
      toast(`Sent to ${r.recipients} students`);
      e.target.reset();
    } catch (err) {
      toast(err.message, false);
    }
  };
  document.getElementById("rem").onclick = async () => {
    const r = await api("/admin/reminders/run", { method: "POST" });
    toast(`${r.notifications_created} reminders created`);
  };
}

let depts = null;
async function deptOptions() {
  depts ||= await api("/admin/departments");
  return depts.map((d) => `<option value="${d.id}">${esc(d.code)} - ${esc(d.name)}</option>`).join("");
}

async function adminStudents() {
  const list = await api("/students");
  app.innerHTML = `<div class="card"><h2>Add student</h2>
    <form id="sForm" class="row">
      <label>USN<input name="usn" required></label><label>Name<input name="name" required></label>
      <label>Dept<select name="dept_id">${await deptOptions()}</select></label>
      <label>Semester<input name="semester" type="number" value="2" min="1" max="8" required></label>
      <label>Section<select name="section"><option>A</option><option>B</option></select></label>
      <label>Batch year<input name="batch_year" type="number" value="2025" required></label>
      <label>Password (min 8)<input name="password" required minlength="8"></label>
      <button>Add student</button></form></div>
    <div class="card"><h2>Students (${list.length} shown, max 500)</h2>
      <div class="row"><label>Search<input id="sq" placeholder="Name or USN"></label><button id="sgo">Search</button></div>
      <div id="stbl" style="margin-top:10px">${studentsTable(list)}</div></div>`;
  document.getElementById("sForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await api("/students", { method: "POST", body: { ...d, dept_id: Number(d.dept_id), semester: Number(d.semester), batch_year: Number(d.batch_year) } });
      toast("Student added");
      adminStudents();
    } catch (err) {
      toast(err.message, false);
    }
  };
  document.getElementById("sgo").onclick = async () => {
    const q = document.getElementById("sq").value;
    document.getElementById("stbl").innerHTML = studentsTable(await api(`/students${q ? `?q=${encodeURIComponent(q)}` : ""}`));
  };
}

function studentsTable(list) {
  return table(["USN", "Name", "Dept", "Sem", "Sec", "Email"], list.map((s) => [esc(s.usn), esc(s.name), esc(s.dept_code), s.semester, esc(s.section), esc(s.email)]));
}

async function adminFaculty() {
  const list = await api("/admin/faculty");
  app.innerHTML = `<div class="card"><h2>Add faculty</h2>
    <form id="fForm" class="row">
      <label>Faculty ID<input name="faculty_id" required></label><label>Name<input name="name" required></label>
      <label>Dept<select name="dept_id">${await deptOptions()}</select></label>
      <label>Designation<input name="designation" value="Assistant Professor" required></label>
      <label>Password (min 8)<input name="password" required minlength="8"></label><button>Add faculty</button></form></div>
    <div class="card"><h2>Faculty</h2>${table(["ID", "Name", "Designation", "Status", "Actions"], list.map((f) => [
      esc(f.faculty_id), esc(f.name), esc(f.designation),
      f.is_active ? `<span class="badge ok">Active</span>` : `<span class="badge bad">Inactive</span>`,
      `<button class="small" data-reset="${f.user_id}">Reset password</button> <button class="small" data-toggle="${f.user_id}">${f.is_active ? "Deactivate" : "Activate"}</button>`,
    ]))}</div>`;
  document.getElementById("fForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await api("/admin/faculty", { method: "POST", body: { ...d, dept_id: Number(d.dept_id) } });
      toast("Faculty added");
      adminFaculty();
    } catch (err) {
      toast(err.message, false);
    }
  };
  bindUserActions(adminFaculty);
}

function bindUserActions(reload) {
  app.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = async () => {
    const pw = prompt("New password (min 8 characters)");
    if (!pw) return;
    try {
      await api(`/admin/users/${b.dataset.reset}/reset-password`, { method: "POST", body: { password: pw } });
      toast("Password reset");
    } catch (err) {
      toast(err.message, false);
    }
  }));
  app.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = async () => {
    try {
      await api(`/admin/users/${b.dataset.toggle}/toggle-active`, { method: "POST" });
      toast("Status updated");
      reload();
    } catch (err) {
      toast(err.message, false);
    }
  }));
}

async function adminCourses() {
  const [list, facs] = await Promise.all([api("/admin/courses"), api("/admin/faculty")]);
  app.innerHTML = `<div class="card"><h2>Add course</h2>
    <form id="cForm" class="row"><label>Code<input name="code" required></label><label>Name<input name="name" required></label>
      <label>Dept<select name="dept_id">${await deptOptions()}</select></label>
      <label>Semester<input name="semester" type="number" min="1" max="8" required></label>
      <label>Credits<input name="credits" type="number" value="3"></label><button>Add course</button></form></div>
    <div class="card"><h2>Assign faculty to a course section</h2>
      <form id="aForm" class="row"><label>Course ID<input name="course_id" type="number" required></label>
      <label>Faculty<select name="faculty_id">${facs.map((f) => `<option value="${f.id}">${esc(f.faculty_id)} - ${esc(f.name)}</option>`).join("")}</select></label>
      <label>Section<select name="section"><option>A</option><option>B</option></select></label><button>Assign</button></form></div>
    <div class="card"><h2>Courses</h2>${table(["ID", "Code", "Name", "Sem", "Faculty"], list.map((c) => [
      c.id, esc(c.code), esc(c.name), c.semester, esc(c.faculty.map((f) => `${f.name} (${f.section})`).join(", ")),
    ]))}</div>`;
  document.getElementById("cForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await api("/admin/courses", { method: "POST", body: { ...d, dept_id: Number(d.dept_id), semester: Number(d.semester), credits: Number(d.credits) } });
      toast("Course added");
      adminCourses();
    } catch (err) {
      toast(err.message, false);
    }
  };
  document.getElementById("aForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await api("/admin/course-assignments", { method: "POST", body: { course_id: Number(d.course_id), faculty_id: Number(d.faculty_id), section: d.section } });
      toast("Assigned");
      adminCourses();
    } catch (err) {
      toast(err.message, false);
    }
  };
}

async function adminTools() {
  app.innerHTML = `<div class="card"><h2>Bulk import (CSV)</h2>
    <p class="muted" style="margin-bottom:12px">Students columns: usn,name,dept_code,semester,section,batch_year,password[,email,phone].<br>
    Faculty columns: faculty_id,name,dept_code,designation,password[,email,phone].</p>
    <form id="imp" class="row"><label>Type<select name="kind"><option value="students">Students</option><option value="faculty">Faculty</option></select></label>
    <label>CSV file<input type="file" name="file" accept=".csv" required></label><button>Import</button></form><div id="impRes"></div></div>
    <div class="card"><h2>Export</h2><a href="${API}/admin/export/students.csv">Download students CSV</a></div>`;
  document.getElementById("imp").onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    try {
      const r = await api(`/admin/import?kind=${d.get("kind")}`, { method: "POST", body: d });
      document.getElementById("impRes").innerHTML = `<div class="msg ${r.errors.length ? "err" : "ok"}">Created ${r.created}.${r.errors.length ? "<br>" + r.errors.map(esc).join("<br>") : ""}</div>`;
    } catch (err) {
      toast(err.message, false);
    }
  };
}

async function adminAudit() {
  const rows = await api("/admin/audit");
  app.innerHTML = `<div class="card"><h2>Audit log (latest 200)</h2>${table(
    ["When", "User ID", "Action", "Entity"],
    rows.map((r) => [dt(r.timestamp), r.user_id, esc(r.action), esc(r.entity)])
  )}</div>`;
}

boot();
