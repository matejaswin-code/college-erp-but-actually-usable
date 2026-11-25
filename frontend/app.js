// Sample Institute of Technology ERP - single-page client (vanilla JS, no build step).
const API = "/api";
const app = document.getElementById("app");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n === null || n === undefined ? "-" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const dt = (s) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-");

async function api(path, opts = {}) {
  const init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
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
  document.getElementById("app").prepend(el);
  setTimeout(() => el.remove(), 4000);
}

function table(headers, rows) {
  if (!rows.length) return `<p class="muted">Nothing to show yet.</p>`;
  return `<div style="overflow-x:auto"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function tabsFor(role) {
  if (role === "student") return [["dashboard", "Dashboard"], ["profile", "Profile"], ["attendance", "Attendance"],
    ["marks", "Marks"], ["results", "Results"], ["timetable", "Timetable"], ["exams", "Exams"],
    ["assignments", "Assignments"], ["materials", "Materials"], ["fees", "Fees"], ["notices", "Notices"]];
  if (role === "faculty") return [["courses", "My courses"], ["attendance", "Attendance"], ["marks", "Marks"],
    ["assignments", "Assignments"], ["materials", "Materials"], ["notices", "Send notice"]];
  return [["admin-dash", "Dashboard"], ["admin-students", "Students"], ["admin-faculty", "Faculty"],
    ["admin-courses", "Courses"], ["admin-tools", "Import / export"], ["admin-audit", "Audit log"]];
}

let me = null;

async function boot() {
  try { me = await api("/auth/me"); } catch { return showLogin(); }
  renderShell();
}

function renderShell() {
  document.getElementById("topbar").hidden = false;
  document.getElementById("whoami").textContent = `${me.name} (${me.login_id})`;
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = tabsFor(me.role).map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join("");
  tabs.onclick = (e) => { if (e.target.dataset.tab) go(e.target.dataset.tab); };
  go(tabsFor(me.role)[0][0]);
}

function go(tab) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const views = {
    dashboard: studentDashboard, profile: studentProfile, attendance: me.role === "student" ? studentAttendance : facultyAttendance,
    marks: me.role === "student" ? studentMarks : facultyMarks, results: studentResults, timetable: studentTimetable,
    exams: studentExams, assignments: me.role === "student" ? studentAssignments : facultyAssignments,
    materials: materialsView, fees: studentFees, notices: me.role === "student" ? studentNotices : facultyNotice,
    courses: facultyCourses, "admin-dash": adminDashboard, "admin-students": adminStudents,
    "admin-faculty": adminFaculty, "admin-courses": adminCourses, "admin-tools": adminTools, "admin-audit": adminAudit,
  };
  views[tab]();
}

function showLogin() {
  document.getElementById("topbar").hidden = true;
  app.innerHTML = `<div class="card login">
    <h1>Sample Institute of Technology</h1><p class="muted">Sign in with your USN, Faculty ID or email.</p>
    <form id="loginForm">
      <label>Login ID or email<input name="login" required autocomplete="username"></label>
      <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
      <button type="submit">Sign in</button>
      <div id="loginErr"></div>
    </form></div>`;
  document.getElementById("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      me = await api("/auth/login", { method: "POST", body: { login: f.get("login"), password: f.get("password") } });
      renderShell();
    } catch (err) { document.getElementById("loginErr").innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
  };
}

document.getElementById("logout").onclick = async () => { await api("/auth/logout", { method: "POST" }); me = null; showLogin(); };

// ---------- helpers ----------
function courseSelect(courses, id = "course") {
  return `<label>Course<select id="${id}">${courses.map((c) => `<option value="${c.id}">${esc(c.code)} - ${esc(c.name)}</option>`).join("")}</select></label>`;
}

function passwordCard(title = "Change password") {
  return `<div class="card"><h2>${title}</h2><form id="pwForm" class="row">
    <label>Current<input name="current" type="password" required></label>
    <label>New (min 8)<input name="new" type="password" required minlength="8"></label>
    <button>Update</button></form></div>`;
}
function bindPassword() {
  const f = document.getElementById("pwForm");
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(f);
    try { await api("/auth/change-password", { method: "POST", body: { current_password: d.get("current"), new_password: d.get("new") } }); toast("Password updated"); f.reset(); }
    catch (err) { toast(err.message, false); }
  };
}

// ---------- student ----------
async function studentDashboard() {
  const [profile, att, res, fees, asg, notes] = await Promise.all([
    api("/students/me"), api("/attendance/me"), api("/results/me"), api("/fees/me"),
    api("/assignments"), api("/notifications/me"),
  ]);
  const upcoming = asg.filter((a) => !a.overdue).slice(0, 4);
  app.innerHTML = `
    <h1 style="margin:0 0 12px">Welcome, ${esc(profile.name)}</h1>
    <div class="grid">
      <div class="stat"><div class="n">${att.overall_percent ?? "-"}%</div><div class="l">Attendance</div></div>
      <div class="stat"><div class="n">${res.cgpa ?? "-"}</div><div class="l">CGPA</div></div>
      <div class="stat"><div class="n">Rs. ${fmt(fees.total_balance)}</div><div class="l">Fee balance</div></div>
      <div class="stat"><div class="n">${notes.unread}</div><div class="l">Unread notices</div></div>
    </div>
    <div class="card" style="margin-top:16px"><h2>Upcoming deadlines</h2>
      ${table(["Assignment", "Course", "Deadline", "Status"], upcoming.map((a) => [esc(a.title), esc(a.course), dt(a.deadline),
        a.my_submission ? `<span class="badge ok">Submitted</span>` : `<span class="badge warn">Pending</span>`]))}
    </div>
    <div class="card"><h2>Low attendance warnings</h2>
      ${table(["Course", "Attendance"], att.courses.filter((c) => c.warning).map((c) => [esc(c.course), `<span class="badge bad">${c.percent}%</span>`]))}
    </div>`;
}

async function studentProfile() {
  const p = await api("/students/me");
  app.innerHTML = `<div class="card"><h2>My profile</h2>
    ${table(["Field", "Value"], [["Name", esc(p.name)], ["USN", esc(p.usn)], ["Email", esc(p.email)],
      ["Branch", esc(p.dept)], ["Semester / Section", `${p.semester} / ${esc(p.section)}`], ["Batch", p.batch_year],
      ["DOB", esc(p.dob)], ["Blood group", esc(p.blood_group)], ["Address", esc(p.address)],
      ["Guardian", `${esc(p.guardian_name)} (${esc(p.guardian_phone)})`], ["Phone", esc(p.phone)]])}
  </div>
  <div class="card"><h2>Update contact details</h2><form id="profForm" class="row">
    <label>Phone<input name="phone" value="${esc(p.phone)}"></label>
    <label>Address<input name="address" value="${esc(p.address)}"></label>
    <label>Blood group<input name="blood_group" value="${esc(p.blood_group)}"></label>
    <label>Guardian name<input name="guardian_name" value="${esc(p.guardian_name)}"></label>
    <label>Guardian phone<input name="guardian_phone" value="${esc(p.guardian_phone)}"></label>
    <button>Save</button></form></div>` + passwordCard();
  bindPassword();
  document.getElementById("profForm").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/students/me", { method: "PUT", body: Object.fromEntries(new FormData(e.target)) }); toast("Saved"); studentProfile(); }
    catch (err) { toast(err.message, false); }
  };
}

async function studentAttendance() {
  const a = await api("/attendance/me");
  app.innerHTML = `<div class="card"><h2>Attendance: ${a.overall_percent ?? "-"}% overall</h2>
    ${table(["Course", "Present", "Total", "Percent", ""], a.courses.map((c) => [esc(c.course), c.present, c.total,
      c.percent === null ? "-" : c.percent + "%", c.warning ? `<span class="badge bad">Below 75%</span>` : ""]))}</div>
    ${a.courses.map((c) => `<div class="card"><h2>${esc(c.course)} log</h2>${table(["Date", "Status"],
      c.log.slice(-30).reverse().map((l) => [l.date, l.status === "P" ? `<span class="badge ok">Present</span>` : `<span class="badge bad">Absent</span>`]))}</div>`).join("")}`;
}

async function studentMarks() {
  const rows = await api("/marks/me");
  app.innerHTML = `<div class="card"><h2>Published marks</h2>
    ${table(["Course", "IA1", "IA2", "IA3", "Assignment", "Lab", "SEE", "Internal (50)", "Total (100)", "Grade"],
      rows.map((r) => [esc(r.course), fmt(r.ia1), fmt(r.ia2), fmt(r.ia3), fmt(r.assignment), fmt(r.lab), fmt(r.see),
        fmt(r.internal), fmt(r.total), `<b>${esc(r.grade)}</b>`]))}
    <p class="muted">Internal = average of best two IAs plus assignment and lab (capped at 50). SEE is scaled to 50.</p></div>`;
}

async function studentResults() {
  const r = await api("/results/me");
  app.innerHTML = `<div class="card"><h2>CGPA: ${r.cgpa ?? "-"}</h2>
    ${table(["Semester", "SGPA"], r.semesters.map((s) => [s.semester, s.sgpa]))}
    <p class="muted">Only subjects whose marks have been published are included.</p></div>`;
}

async function studentTimetable() {
  const t = await api("/timetable");
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sorted = [...t].sort((a, b) => a.day - b.day || a.period - b.period);
  app.innerHTML = `<div class="card"><h2>Weekly timetable</h2>
    ${table(["Day", "Period", "Course", "Room"], sorted.map((s) => [days[s.day - 1], s.period, esc(s.course), esc(s.room)]))}</div>`;
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
      const status = s ? (s.is_late ? `<span class="badge warn">Late</span>` : `<span class="badge ok">Submitted</span>`) : (a.overdue ? `<span class="badge bad">Overdue</span>` : `<span class="badge">Open</span>`);
      const grade = s && s.marks !== null ? `${s.marks}/${a.max_marks}` : "-";
      const action = `<input type="file" data-asg="${a.id}" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg,.xlsx" style="width:auto">
        <button class="small" data-submit="${a.id}">${s ? "Resubmit" : "Submit"}</button>`;
      return [esc(a.title), esc(a.course), dt(a.deadline), status, grade, a.has_file ? `${action}` : action];
    }))}</div>`;
  app.querySelectorAll("[data-submit]").forEach((btn) => btn.onclick = async () => {
    const input = app.querySelector(`input[data-asg="${btn.dataset.submit}"]`);
    if (!input.files[0]) return toast("Choose a file first", false);
    const fd = new FormData(); fd.append("file", input.files[0]);
    try { const r = await api(`/assignments/${btn.dataset.submit}/submit`, { method: "POST", body: fd }); toast(r.is_late ? "Submitted (late)" : "Submitted"); studentAssignments(); }
    catch (err) { toast(err.message, false); }
  });
}

async function materialsView() {
  const courses = await api("/courses/me");
  app.innerHTML = `<div class="card"><h2>Study materials</h2>
    <div class="row">${courseSelect(courses)}<label>Search<input id="mq"></label><button id="mgo">Search</button></div>
    <div id="mlist" style="margin-top:12px"></div></div>
    ${me.role === "faculty" ? uploadMaterialCard(courses) : ""}`;
  const load = async () => {
    const q = document.getElementById("mq").value;
    const cid = document.getElementById("course").value;
    const items = await api(`/materials?course_id=${cid}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    const byUnit = {};
    items.forEach((m) => (byUnit[m.unit] ||= []).push(m));
    document.getElementById("mlist").innerHTML = Object.keys(byUnit).sort().map((u) => `<h3>${esc(u)}</h3>${table(["Title", "Type", ""],
      byUnit[u].map((m) => [esc(m.title), esc(m.type), `<a href="${API}/downloads/material/${m.id}" target="_blank">${m.is_link ? "Open link" : "Download"}</a>`]))}`).join("") || `<p class="muted">No materials found.</p>`;
  };
  document.getElementById("mgo").onclick = load;
  document.getElementById("course").onchange = load;
  if (courses.length) load();
  const up = document.getElementById("upMat");
  if (up) up.onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/materials", { method: "POST", body: new FormData(up) }); toast("Uploaded"); up.reset(); load(); }
    catch (err) { toast(err.message, false); }
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
  app.innerHTML = `<div class="grid">
      <div class="stat"><div class="n">Rs. ${fmt(f.total_due)}</div><div class="l">Total due</div></div>
      <div class="stat"><div class="n">Rs. ${fmt(f.total_paid)}</div><div class="l">Paid</div></div>
      <div class="stat"><div class="n">Rs. ${fmt(f.total_balance)}</div><div class="l">Balance</div></div></div>
    <div class="card" style="margin-top:16px"><h2>Fee records</h2>
      ${table(["Sem", "Fee", "Due date", "Amount", "Paid", "Balance", "Status"], f.records.map((r) => [r.semester, esc(r.fee_type), r.due_date,
        fmt(r.amount_due), fmt(r.amount_paid), fmt(r.balance), badge(r.status)]))}</div>
    ${pendingRecs.length ? `<div class="card"><h2>Pay fees (mock gateway)</h2>
      <form id="payForm" class="row">
        <label>Fee<select name="fee_record_id">${pendingRecs.map((r) => `<option value="${r.id}" data-bal="${r.balance}">Sem ${r.semester} - ${esc(r.fee_type)} (balance Rs. ${fmt(r.balance)})</option>`).join("")}</select></label>
        <label>Method<select name="method"><option>UPI</option><option>Credit/Debit Card</option><option>Net Banking</option><option>Wallet</option></select></label>
        <label>Amount (Rs.)<input name="amount" type="number" step="0.01" min="1" required></label>
        <button>Pay</button></form>
      <p class="muted">Mock gateway: no password or OTP. Payments always succeed unless the demo failure rate is set.</p></div>` : `<p class="msg ok">All fees are paid.</p>`}
    <div class="card"><h2>Payment history</h2>
      ${table(["Date", "Txn ID", "Amount", "Method", "Status", "Receipt"], payments.map((p) => [dt(p.paid_at), esc(p.txn_id), fmt(p.amount),
        esc(p.method), badge(p.status), p.status === "success" ? `<a href="${API}/fees/payments/${p.id}/receipt" target="_blank">PDF</a>` : "-"]))}</div>`;
  const pf = document.getElementById("payForm");
  if (pf) {
    const sel = pf.fee_record_id;
    const setMax = () => { const bal = sel.selectedOptions[0].dataset.bal; pf.amount.max = bal; pf.amount.value = bal; };
    sel.onchange = setMax; setMax();
    pf.onsubmit = async (e) => {
      e.preventDefault();
      const d = new FormData(pf);
      try {
        const r = await api("/fees/pay", { method: "POST", body: { fee_record_id: Number(d.get("fee_record_id")), method: d.get("method"), amount: Number(d.get("amount")) } });
        toast(r.status === "success" ? `Payment successful. Txn ${r.txn_id}` : "Payment failed, please retry", r.status === "success");
        studentFees();
      } catch (err) { toast(err.message, false); }
    };
  }
}

function badge(s) {
  const map = { paid: "ok", success: "ok", partial: "warn", pending: "", overdue: "bad", failed: "bad" };
  return `<span class="badge ${map[s] ?? ""}">${esc(s)}</span>`;
}

async function studentNotices() {
  const n = await api("/notifications/me");
  app.innerHTML = `<div class="card"><h2>Notices and alerts (${n.unread} unread)</h2>
    <div class="row" style="margin-bottom:10px"><button id="readAll" class="small">Mark all read</button></div>
    ${n.items.map((i) => `<div class="card ${i.is_read ? "" : "unread"}" style="margin:8px 0">
      <div class="row"><b>${esc(i.title)}</b><span class="muted">${dt(i.created_at)}</span>
      ${i.is_read ? "" : `<button class="small" data-read="${i.id}">Mark read</button>`}</div>
      <div style="margin-top:6px">${esc(i.body)}</div></div>`).join("") || `<p class="muted">No notices.</p>`}</div>`;
  document.getElementById("readAll").onclick = async () => { await api("/notifications/read-all", { method: "POST" }); studentNotices(); };
  app.querySelectorAll("[data-read]").forEach((b) => b.onclick = async () => { await api(`/notifications/${b.dataset.read}/read`, { method: "POST" }); studentNotices(); });
}

// ---------- faculty ----------
async function facultyCourses() {
  const courses = await api("/courses/me");
  app.innerHTML = `<div class="card"><h2>My courses</h2>
    ${table(["Code", "Course", "Semester", "Credits"], courses.map((c) => [esc(c.code), esc(c.name), c.semester, c.credits]))}</div>
    <div class="card"><h2>My exam schedule</h2>${table(["Exam", "Course", "Date", "Time", "Room"],
      (await api("/exams/me")).map((x) => [esc(x.type), esc(x.course), x.date, esc(x.time), esc(x.room)]))}</div>` + passwordCard();
  bindPassword();
}

async function facultyAttendance() {
  const courses = await api("/courses/me");
  if (!courses.length) return app.innerHTML = `<p class="muted">No courses assigned.</p>`;
  app.innerHTML = `<div class="card"><h2>Mark attendance</h2>
    <div class="row">${courseSelect(courses)}<label>Date<input type="date" id="adate" value="${new Date().toISOString().slice(0, 10)}"></label>
    <button id="aload">Load class</button></div><div id="aroster" style="margin-top:12px"></div></div>`;
  const load = async () => {
    const cid = document.getElementById("course").value;
    const day = document.getElementById("adate").value;
    const [students, existing] = await Promise.all([api(`/courses/${cid}/students`), api(`/attendance/course/${cid}?on=${day}`)]);
    const prev = Object.fromEntries(existing.map((e) => [e.student_id, e.status]));
    document.getElementById("aroster").innerHTML = `<table><thead><tr><th>USN</th><th>Name</th><th>Sec</th><th>Present</th></tr></thead><tbody>
      ${students.map((s) => `<tr><td>${esc(s.usn)}</td><td>${esc(s.name)}</td><td>${esc(s.section)}</td>
      <td><input type="checkbox" data-sid="${s.id}" ${prev[s.id] !== "A" ? "checked" : ""} style="width:auto"></td></tr>`).join("")}
      </tbody></table><div class="row" style="margin-top:10px"><button id="asave">Save attendance</button></div>`;
    document.getElementById("asave").onclick = async () => {
      const records = [...document.querySelectorAll("[data-sid]")].map((cb) => ({ student_id: Number(cb.dataset.sid), status: cb.checked ? "P" : "A" }));
      try { await api("/attendance", { method: "POST", body: { course_id: Number(cid), date: day, records } }); toast(`Saved ${records.length} records`); }
      catch (err) { toast(err.message, false); }
    };
  };
  document.getElementById("aload").onclick = load;
}

async function facultyMarks() {
  const courses = await api("/courses/me");
  if (!courses.length) return app.innerHTML = `<p class="muted">No courses assigned.</p>`;
  app.innerHTML = `<div class="card"><h2>Enter marks</h2>
    <div class="row">${courseSelect(courses)}<button id="mload">Load</button></div><div id="mroster" style="margin-top:12px"></div></div>`;
  const load = async () => {
    const cid = document.getElementById("course").value;
    const [students, marks] = await Promise.all([api(`/courses/${cid}/students`), api(`/marks/course/${cid}`)]);
    const by = Object.fromEntries(marks.map((m) => [m.student_id, m]));
    const f = ["ia1", "ia2", "ia3", "assignment", "lab", "see"];
    document.getElementById("mroster").innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>USN</th><th>Name</th>${f.map((x) => `<th>${x.toUpperCase()}</th>`).join("")}<th>Grade</th><th></th></tr></thead><tbody>
      ${students.map((s) => { const m = by[s.id] || {}; return `<tr data-row="${s.id}"><td>${esc(s.usn)}</td><td>${esc(s.name)}</td>
        ${f.map((x) => `<td><input type="number" step="0.5" data-f="${x}" value="${m[x] ?? ""}" style="width:70px"></td>`).join("")}
        <td>${esc(m.grade ?? "-")}</td><td><button class="small" data-save="${s.id}">Save</button></td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="row" style="margin-top:10px"><button id="pub" class="danger">Publish marks to students</button></div>
      <p class="muted">Students see marks only after you publish. Marks can still be edited after publishing.</p>`;
    document.querySelectorAll("[data-save]").forEach((b) => b.onclick = async () => {
      const row = document.querySelector(`tr[data-row="${b.dataset.save}"]`);
      const body = { course_id: Number(cid), student_id: Number(b.dataset.save) };
      row.querySelectorAll("[data-f]").forEach((i) => { if (i.value !== "") body[i.dataset.f] = Number(i.value); });
      try { const r = await api("/marks", { method: "POST", body }); row.cells[row.cells.length - 2].textContent = r.grade; toast("Saved"); }
      catch (err) { toast(err.message, false); }
    });
    document.getElementById("pub").onclick = async () => {
      if (!confirm("Publish all marks for this course to students?")) return;
      try { const r = await api(`/marks/publish?course_id=${cid}`, { method: "POST" }); toast(`Published ${r.published} records`); }
      catch (err) { toast(err.message, false); }
    };
  };
  document.getElementById("mload").onclick = load;
  document.getElementById("course").onchange = load;
  load();
}

async function facultyAssignments() {
  const courses = await api("/courses/me");
  const list = await api("/assignments");
  app.innerHTML = `<div class="card"><h2>Post an assignment</h2>
    <form id="asgForm" class="row">
      <label>Course<select name="course_id">${courses.map((c) => `<option value="${c.id}">${esc(c.code)} - ${esc(c.name)}</option>`).join("")}</select></label>
      <label>Title<input name="title" required></label>
      <label>Deadline<input type="datetime-local" name="deadline" required></label>
      <label>Max marks<input type="number" name="max_marks" value="10" min="1"></label>
      <label>Description<input name="description"></label>
      <label>Attachment<input type="file" name="file"></label>
      <button>Post</button></form></div>
    <div class="card"><h2>Assignments</h2>${table(["Title", "Course", "Deadline", ""], list.map((a) =>
      [esc(a.title), esc(a.course), dt(a.deadline), `<button class="small" data-view="${a.id}">Submissions</button>`]))}
      <div id="subs"></div></div>`;
  document.getElementById("asgForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get("deadline")) fd.set("deadline", fd.get("deadline") + ":00");
    try { await api("/assignments", { method: "POST", body: fd }); toast("Assignment posted"); facultyAssignments(); }
    catch (err) { toast(err.message, false); }
  };
  app.querySelectorAll("[data-view]").forEach((b) => b.onclick = async () => {
    const subs = await api(`/assignments/${b.dataset.view}/submissions`);
    document.getElementById("subs").innerHTML = `<h3>Submissions</h3>${table(["USN", "Name", "Submitted", "Late", "Marks", "Grade"],
      subs.map((s) => [esc(s.usn), esc(s.name), dt(s.submitted_at), s.is_late ? "Yes" : "No", s.marks ?? "-",
        `<form data-grade="${s.id}" class="row" style="min-width:0"><input name="marks" type="number" step="0.5" value="${s.marks ?? ""}" style="width:80px"><input name="feedback" value="${esc(s.feedback ?? "")}" placeholder="Feedback"><button class="small">Save</button></form>`]))}`;
    document.querySelectorAll("[data-grade]").forEach((f) => f.onsubmit = async (e) => {
      e.preventDefault();
      try { await api(`/submissions/${f.dataset.grade}/grade`, { method: "POST", body: new FormData(f) }); toast("Graded"); }
      catch (err) { toast(err.message, false); }
    });
  });
}

async function facultyNotice() {
  const courses = await api("/courses/me");
  app.innerHTML = `<div class="card"><h2>Send a notice to a course</h2>
    <form id="nForm" class="row">${courseSelect(courses)}
      <label>Title<input name="title" required></label>
      <label>Message<textarea name="body" required rows="2"></textarea></label>
      <button>Send</button></form></div>`;
  document.getElementById("nForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    try { const r = await api("/notifications", { method: "POST", body: { title: d.get("title"), body: d.get("body"), scope: "course", course_id: Number(d.get("course")) } }); toast(`Sent to ${r.recipients} students`); e.target.reset(); }
    catch (err) { toast(err.message, false); }
  };
}

// ---------- admin ----------
async function adminDashboard() {
  const s = await api("/admin/stats");
  app.innerHTML = `<div class="grid">
    <div class="stat"><div class="n">${s.students}</div><div class="l">Students</div></div>
    <div class="stat"><div class="n">${s.faculty}</div><div class="l">Faculty</div></div>
    <div class="stat"><div class="n">${s.courses}</div><div class="l">Courses</div></div>
    <div class="stat"><div class="n">${s.pending_fee_records}</div><div class="l">Open fee records</div></div></div>
    <div class="card" style="margin-top:16px"><h2>Post a global notice</h2>
      <form id="gForm" class="row"><label>Title<input name="title" required></label><label>Message<input name="body" required></label>
      <label>Audience<select name="scope"><option value="all">All students</option></select></label><button>Send</button></form></div>
    <div class="card"><h2>Automated reminders</h2><p class="muted">Creates deadline (48h) and fee-due notifications. Run daily.</p>
      <button id="rem">Run reminders now</button></div>`;
  document.getElementById("gForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    try { const r = await api("/notifications", { method: "POST", body: { title: d.get("title"), body: d.get("body"), scope: "all" } }); toast(`Sent to ${r.recipients} students`); e.target.reset(); }
    catch (err) { toast(err.message, false); }
  };
  document.getElementById("rem").onclick = async () => { const r = await api("/admin/reminders/run", { method: "POST" }); toast(`${r.notifications_created} reminders created`); };
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
      <button>Add</button></form></div>
    <div class="card"><h2>Students (${list.length} shown, max 500)</h2>
      <div class="row"><label>Search<input id="sq" placeholder="Name or USN"></label><button id="sgo">Search</button></div>
      <div id="stbl" style="margin-top:10px">${studentsTable(list)}</div></div>`;
  document.getElementById("sForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try { await api("/students", { method: "POST", body: { ...d, dept_id: Number(d.dept_id), semester: Number(d.semester), batch_year: Number(d.batch_year) } }); toast("Student added"); adminStudents(); }
    catch (err) { toast(err.message, false); }
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
      <label>Password (min 8)<input name="password" required minlength="8"></label><button>Add</button></form></div>
    <div class="card"><h2>Faculty</h2>${table(["ID", "Name", "Designation", "Status", "Actions"], list.map((f) => [esc(f.faculty_id), esc(f.name),
      esc(f.designation), f.is_active ? `<span class="badge ok">Active</span>` : `<span class="badge bad">Inactive</span>`,
      `<button class="small" data-reset="${f.user_id}">Reset password</button> <button class="small" data-toggle="${f.user_id}">${f.is_active ? "Deactivate" : "Activate"}</button>`]))}</div>`;
  document.getElementById("fForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try { await api("/admin/faculty", { method: "POST", body: { ...d, dept_id: Number(d.dept_id) } }); toast("Faculty added"); adminFaculty(); }
    catch (err) { toast(err.message, false); }
  };
  bindUserActions(adminFaculty);
}

function bindUserActions(reload) {
  app.querySelectorAll("[data-reset]").forEach((b) => b.onclick = async () => {
    const pw = prompt("New password (min 8 characters)");
    if (!pw) return;
    try { await api(`/admin/users/${b.dataset.reset}/reset-password`, { method: "POST", body: { password: pw } }); toast("Password reset"); }
    catch (err) { toast(err.message, false); }
  });
  app.querySelectorAll("[data-toggle]").forEach((b) => b.onclick = async () => {
    try { await api(`/admin/users/${b.dataset.toggle}/toggle-active`, { method: "POST" }); toast("Status updated"); reload(); }
    catch (err) { toast(err.message, false); }
  });
}

async function adminCourses() {
  const list = await api("/admin/courses");
  const facs = await api("/admin/faculty");
  app.innerHTML = `<div class="card"><h2>Add course</h2>
    <form id="cForm" class="row"><label>Code<input name="code" required></label><label>Name<input name="name" required></label>
      <label>Dept<select name="dept_id">${await deptOptions()}</select></label>
      <label>Semester<input name="semester" type="number" min="1" max="8" required></label>
      <label>Credits<input name="credits" type="number" value="3"></label><button>Add</button></form></div>
    <div class="card"><h2>Assign faculty to a course section</h2>
      <form id="aForm" class="row"><label>Course ID<input name="course_id" type="number" required></label>
      <label>Faculty<select name="faculty_id">${facs.map((f) => `<option value="${f.id}">${esc(f.faculty_id)} - ${esc(f.name)}</option>`).join("")}</select></label>
      <label>Section<select name="section"><option>A</option><option>B</option></select></label><button>Assign</button></form></div>
    <div class="card"><h2>Courses</h2>${table(["ID", "Code", "Name", "Sem", "Faculty"], list.map((c) => [c.id, esc(c.code), esc(c.name), c.semester,
      esc(c.faculty.map((f) => `${f.name} (${f.section})`).join(", "))]))}</div>`;
  document.getElementById("cForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try { await api("/admin/courses", { method: "POST", body: { ...d, dept_id: Number(d.dept_id), semester: Number(d.semester), credits: Number(d.credits) } }); toast("Course added"); adminCourses(); }
    catch (err) { toast(err.message, false); }
  };
  document.getElementById("aForm").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try { await api("/admin/course-assignments", { method: "POST", body: { course_id: Number(d.course_id), faculty_id: Number(d.faculty_id), section: d.section } }); toast("Assigned"); adminCourses(); }
    catch (err) { toast(err.message, false); }
  };
}

async function adminTools() {
  app.innerHTML = `<div class="card"><h2>Bulk import (CSV)</h2>
    <p class="muted">Students columns: usn,name,dept_code,semester,section,batch_year,password[,email,phone].<br>
    Faculty columns: faculty_id,name,dept_code,designation,password[,email,phone].</p>
    <form id="imp" class="row"><label>Type<select name="kind"><option value="students">Students</option><option value="faculty">Faculty</option></select></label>
    <label>CSV file<input type="file" name="file" accept=".csv" required></label><button>Import</button></form><div id="impRes"></div></div>
    <div class="card"><h2>Export</h2><a href="${API}/admin/export/students.csv">Download students CSV</a></div>` + passwordCard();
  bindPassword();
  document.getElementById("imp").onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    try {
      const r = await api(`/admin/import?kind=${d.get("kind")}`, { method: "POST", body: d });
      document.getElementById("impRes").innerHTML = `<div class="msg ${r.errors.length ? "err" : "ok"}">Created ${r.created}.${r.errors.length ? "<br>" + r.errors.map(esc).join("<br>") : ""}</div>`;
    } catch (err) { toast(err.message, false); }
  };
}

async function adminAudit() {
  const rows = await api("/admin/audit");
  app.innerHTML = `<div class="card"><h2>Audit log (latest 200)</h2>${table(["When", "User ID", "Action", "Entity"],
    rows.map((r) => [dt(r.timestamp), r.user_id, esc(r.action), esc(r.entity)]))}</div>`;
}

boot();
