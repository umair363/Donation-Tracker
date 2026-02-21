import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Constants ───────────────────────────────────────────────────────────────
const MEMBERS = ["Faiz", "Moeed", "Umair", "Hassan Ali", "Hassan Tariq", "Farah", "Hamza"];
const PAYMENT_METHODS = ["Cash", "UBL", "Sadapay", "EasyPaisa", "Bank Transfer"];
const EXPENSE_CATEGORIES = ["Food", "Transport", "Equipment", "Venue", "Marketing", "Miscellaneous"];

const ADMIN_CREDS = { username: "admin", password: "admin123" };
const MEMBER_CREDS = MEMBERS.reduce((acc, m) => {
  const key = m.toLowerCase().replace(/\s+/g, "");
  acc[key] = { username: key, password: "member123", name: m };
  return acc;
}, {});

const formatPKR = (n) => `PKR ${Number(n || 0).toLocaleString("en-PK")}`;
const fmtDate = (d) => new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(rows, filename, headers) {
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [donations, setDonations] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [goal, setGoal] = useState(500000);
  const [loading, setLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [modal, setModal] = useState(null); // 'donation' | 'expense' | 'goal'
  const [toast, setToast] = useState(null);

  // ── Load data ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: don }, { data: exp }, { data: set }] = await Promise.all([
      supabase.from("donations").select("*").order("created_at", { ascending: false }),
      supabase.from("expenses").select("*").order("created_at", { ascending: false }),
      supabase.from("settings").select("*"),
    ]);
    setDonations(don || []);
    setExpenses(exp || []);
    const goalSetting = (set || []).find(s => s.key === "goal");
    if (goalSetting) setGoal(Number(goalSetting.value));
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const notify = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  // ── Auth ──
  const handleLogin = (e) => {
    e.preventDefault();
    const { username, password } = loginForm;
    if (username === ADMIN_CREDS.username && password === ADMIN_CREDS.password) {
      setSession({ role: "admin", name: "Admin" });
    } else {
      const member = MEMBER_CREDS[username];
      if (member && member.password === password) {
        setSession({ role: "member", name: member.name });
      } else {
        setLoginError("Invalid credentials. Try again.");
        return;
      }
    }
    setLoginError("");
  };

  const handleLogout = () => { setSession(null); setPage("dashboard"); setLoginForm({ username: "", password: "" }); };

  // ── Donations CRUD ──
  const addDonation = async (form) => {
    const { error } = await supabase.from("donations").insert([{
      donor_name: form.donorName || null,
      amount: Number(form.amount),
      method: form.method,
      reference: form.reference,
      notes: form.notes || null,
    }]);
    if (error) { notify("Error saving donation", "error"); return; }
    await loadAll();
    setModal(null);
    notify("Donation recorded!");
  };

  const deleteDonation = async (id) => {
    if (!confirm("Delete this donation?")) return;
    await supabase.from("donations").delete().eq("id", id);
    await loadAll();
    notify("Donation deleted");
  };

  // ── Expenses CRUD ──
  const addExpense = async (form) => {
    let receipt_url = null;
    if (form.receiptFile) {
      const ext = form.receiptFile.name.split(".").pop();
      const path = `${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, form.receiptFile);
      if (!upErr) {
        const { data } = supabase.storage.from("receipts").getPublicUrl(path);
        receipt_url = data.publicUrl;
      }
    }
    const { error } = await supabase.from("expenses").insert([{
      description: form.description,
      amount: Number(form.amount),
      category: form.category,
      receipt_url,
    }]);
    if (error) { notify("Error saving expense", "error"); return; }
    await loadAll();
    setModal(null);
    notify("Expense recorded!");
  };

  const deleteExpense = async (id) => {
    if (!confirm("Delete this expense?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    await loadAll();
    notify("Expense deleted");
  };

  // ── Goal ──
  const updateGoal = async (newGoal) => {
    await supabase.from("settings").upsert([{ key: "goal", value: String(newGoal) }]);
    setGoal(newGoal);
    setModal(null);
    notify("Goal updated!");
  };

  // ── Stats ──
  const totalDonations = donations.reduce((s, d) => s + Number(d.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netBalance = totalDonations - totalExpenses;
  const goalProgress = Math.min((totalDonations / goal) * 100, 100);
  const memberStats = MEMBERS.map(m => {
    const md = donations.filter(d => d.reference === m);
    return { name: m, total: md.reduce((s, d) => s + Number(d.amount), 0), count: md.length };
  }).sort((a, b) => b.total - a.total);

  // ── Render ──
  if (loading) return <LoadingScreen />;
  if (!session) return <LoginScreen form={loginForm} setForm={setLoginForm} onSubmit={handleLogin} error={loginError} />;

  return (
    <div style={s.app}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <Sidebar session={session} page={page} setPage={setPage} onLogout={handleLogout} />

      <main style={s.main}>
        <Header
          session={session} page={page}
          onAddDonation={() => setModal("donation")}
          onAddExpense={() => setModal("expense")}
        />

        <div style={s.pageWrap}>
          {page === "dashboard" && (
            <Dashboard
              totalDonations={totalDonations} totalExpenses={totalExpenses}
              netBalance={netBalance} goalProgress={goalProgress} goal={goal}
              donations={donations} expenses={expenses} memberStats={memberStats}
              session={session} onEditGoal={() => setModal("goal")}
            />
          )}
          {page === "donations" && (
            <DonationsPage
              donations={donations} session={session}
              onDelete={deleteDonation}
              onExport={() => exportCSV(
                donations.map(d => ({ Date: fmtDate(d.created_at), Donor: d.donor_name || "Anonymous", Amount: d.amount, Method: d.method, Reference: d.reference, Notes: d.notes || "" })),
                "donations.csv", ["Date", "Donor", "Amount", "Method", "Reference", "Notes"]
              )}
            />
          )}
          {page === "expenses" && (
            <ExpensesPage
              expenses={expenses} session={session}
              onDelete={deleteExpense}
              onExport={() => exportCSV(
                expenses.map(e => ({ Date: fmtDate(e.created_at), Description: e.description, Category: e.category, Amount: e.amount })),
                "expenses.csv", ["Date", "Description", "Category", "Amount"]
              )}
            />
          )}
          {page === "leaderboard" && <LeaderboardPage memberStats={memberStats} totalDonations={totalDonations} />}
        </div>
      </main>

      {modal === "donation" && <DonationModal onClose={() => setModal(null)} onSave={addDonation} />}
      {modal === "expense" && <ExpenseModal onClose={() => setModal(null)} onSave={addExpense} />}
      {modal === "goal" && <GoalModal currentGoal={goal} onClose={() => setModal(null)} onSave={updateGoal} />}

      <style>{globalCSS}</style>
    </div>
  );
}

// ─── Screens ──────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={s.loadingScreen}>
      <div style={s.spinner} className="spin" />
      <p style={{ color: "#c9a84c", letterSpacing: 4, fontSize: 12, fontFamily: "Georgia, serif" }}>LOADING</p>
    </div>
  );
}

function LoginScreen({ form, setForm, onSubmit, error }) {
  return (
    <div style={s.loginScreen}>
      <div style={s.loginCard}>
        <div style={s.logoWrap}>
          <div style={s.logoCircle}>◈</div>
          {/* Replace the div above with: <img src="/logo.png" style={{ width: 72, height: 72, borderRadius: "50%" }} /> */}
          <p style={s.logoHint}>Add your logo in /public/logo.png</p>
        </div>
        <h1 style={s.loginTitle}>Society Portal</h1>
        <p style={s.loginSub}>Donation & Expense Tracker</p>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Username">
            <input style={s.input} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="admin or membername" className="gi" />
          </Field>
          <Field label="Password">
            <input style={s.input} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className="gi" />
          </Field>
          {error && <p style={s.errMsg}>{error}</p>}
          <button style={s.btnPrimary} type="submit" className="gb">Sign In →</button>
        </form>
        <p style={s.loginHint}>Admin: admin / admin123 · Members: firstname / member123</p>
      </div>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
function Sidebar({ session, page, setPage, onLogout }) {
  const nav = session.role === "admin"
    ? [["dashboard", "◈", "Dashboard"], ["donations", "◆", "Donations"], ["expenses", "◇", "Expenses"], ["leaderboard", "▲", "Leaderboard"]]
    : [["dashboard", "◈", "Dashboard"], ["donations", "◆", "My Donations"], ["leaderboard", "▲", "Leaderboard"]];

  return (
    <aside style={s.sidebar}>
      <div style={s.sidebarTop}>
        <span style={{ color: "#c9a84c", fontSize: 22 }}>◈</span>
        <div>
          <div style={s.sidebarTitle}>SOCIETY</div>
          <div style={s.sidebarSub}>{session.role === "admin" ? "Administrator" : session.name}</div>
        </div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px", flex: 1 }}>
        {nav.map(([id, icon, label]) => (
          <button key={id} style={{ ...s.navBtn, ...(page === id ? s.navActive : {}) }} onClick={() => setPage(id)} className="nb">
            <span style={{ fontSize: 15 }}>{icon}</span> {label}
          </button>
        ))}
      </nav>
      <button style={s.logoutBtn} onClick={onLogout} className="lb">⊗ Sign Out</button>
    </aside>
  );
}

function Header({ session, page, onAddDonation, onAddExpense }) {
  const titles = { dashboard: "Dashboard", donations: session.role === "member" ? "My Donations" : "Donations", expenses: "Expenses", leaderboard: "Leaderboard" };
  return (
    <div style={s.header}>
      <div>
        <h2 style={s.headerTitle}>{titles[page]}</h2>
        <p style={s.headerDate}>{new Date().toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>
      {session.role === "admin" && (
        <div style={{ display: "flex", gap: 10 }}>
          <button style={s.btnOutline} onClick={onAddExpense} className="go">+ Expense</button>
          <button style={s.btnPrimary} onClick={onAddDonation} className="gb">+ Donation</button>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ totalDonations, totalExpenses, netBalance, goalProgress, goal, donations, expenses, memberStats, session, onEditGoal }) {
  const recent = [...donations.slice(0, 5).map(d => ({ ...d, _type: "donation" })), ...expenses.slice(0, 3).map(e => ({ ...e, _type: "expense" }))]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 7);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stat cards */}
      <div style={s.statsGrid}>
        {[
          { icon: "💰", label: "Total Collected", val: formatPKR(totalDonations), color: "#c9a84c", sub: `${donations.length} donations` },
          { icon: "🧾", label: "Total Expenses", val: formatPKR(totalExpenses), color: "#e07b54", sub: `${expenses.length} entries` },
          { icon: "◎", label: "Net Balance", val: formatPKR(netBalance), color: netBalance >= 0 ? "#5cb85c" : "#d9534f", sub: "available funds" },
          { icon: "👥", label: "Members", val: MEMBERS.length, color: "#7b9dc9", sub: "contributors" },
        ].map(c => (
          <div key={c.label} style={s.statCard} className="sc">
            <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ color: "#444", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{c.label}</div>
            <div style={{ color: c.color, fontSize: 20, fontWeight: "bold" }}>{c.val}</div>
            <div style={{ color: "#333", fontSize: 11, marginTop: 4 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Goal + Top Contributor */}
      <div style={s.midGrid}>
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <CardLabel>Fundraising Goal</CardLabel>
            {session.role === "admin" && <button style={s.smBtn} onClick={onEditGoal} className="go">Edit Goal</button>}
          </div>
          <div style={{ fontSize: 20, fontFamily: "serif", marginBottom: 14 }}>
            <span style={{ color: "#c9a84c" }}>{formatPKR(totalDonations)}</span>
            <span style={{ color: "#333", fontSize: 14 }}> / {formatPKR(goal)}</span>
          </div>
          <div style={s.progTrack}>
            <div style={{ ...s.progBar, width: `${goalProgress}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12 }}>
            <span style={{ color: "#c9a84c" }}>{goalProgress.toFixed(1)}% reached</span>
            <span style={{ color: "#444" }}>{formatPKR(Math.max(goal - totalDonations, 0))} remaining</span>
          </div>
        </div>

        <div style={s.card}>
          <CardLabel>Top Contributor</CardLabel>
          {memberStats[0] ? (
            <div style={{ display: "flex", alignItems: "center", gap: 18, paddingTop: 10 }}>
              <span style={{ fontSize: 48 }}>🏆</span>
              <div>
                <div style={{ color: "#c9a84c", fontSize: 22, fontFamily: "serif", fontWeight: "bold" }}>{memberStats[0].name}</div>
                <div style={{ color: "#555", fontSize: 13 }}>{memberStats[0].count} collection{memberStats[0].count !== 1 ? "s" : ""}</div>
                <div style={{ color: "#ddd", fontSize: 18, marginTop: 4 }}>{formatPKR(memberStats[0].total)}</div>
              </div>
            </div>
          ) : <p style={{ color: "#333", marginTop: 16 }}>No data yet</p>}
        </div>
      </div>

      {/* Recent + Member overview */}
      <div style={s.midGrid}>
        <div style={s.card}>
          <CardLabel>Recent Activity</CardLabel>
          {recent.length === 0 ? <p style={{ color: "#333", marginTop: 12 }}>No activity yet</p> : recent.map(item => (
            <div key={item.id} style={s.actRow}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: item._type === "donation" ? "#c9a84c" : "#e07b54", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: "#ccc", fontSize: 13 }}>{item._type === "donation" ? `${item.reference} · ${item.method}` : `${item.category} · ${item.description}`}</div>
                <div style={{ color: "#444", fontSize: 11 }}>{fmtDate(item.created_at)}</div>
              </div>
              <div style={{ color: item._type === "donation" ? "#c9a84c" : "#e07b54", fontWeight: "bold", fontSize: 13 }}>
                {item._type === "donation" ? "+" : "-"}{formatPKR(item.amount)}
              </div>
            </div>
          ))}
        </div>

        <div style={s.card}>
          <CardLabel>Member Overview</CardLabel>
          {memberStats.map((m, i) => (
            <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #141414" }}>
              <span style={{ width: 24, color: i < 3 ? "#c9a84c" : "#333", fontWeight: "bold", fontSize: 12 }}>#{i + 1}</span>
              <span style={{ flex: 1, color: "#ccc", fontSize: 13 }}>{m.name}</span>
              <div style={{ width: 70, background: "#1a1a1a", borderRadius: 4, height: 5 }}>
                <div style={{ width: `${memberStats[0].total > 0 ? (m.total / memberStats[0].total) * 100 : 0}%`, height: "100%", background: "#c9a84c", borderRadius: 4 }} />
              </div>
              <span style={{ color: "#666", fontSize: 12, minWidth: 90, textAlign: "right" }}>{formatPKR(m.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Donations Page ───────────────────────────────────────────────────────────
function DonationsPage({ donations, session, onDelete, onExport }) {
  const [search, setSearch] = useState("");
  const [methodF, setMethodF] = useState("All");
  const [memberF, setMemberF] = useState("All");

  const filtered = donations.filter(d => {
    if (session.role === "member" && d.reference !== session.name) return false;
    if (methodF !== "All" && d.method !== methodF) return false;
    if (memberF !== "All" && d.reference !== memberF) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.reference?.toLowerCase().includes(q) && !d.donor_name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total = filtered.reduce((s, d) => s + Number(d.amount), 0);

  return (
    <div>
      <div style={s.filterRow}>
        <input style={{ ...s.input, maxWidth: 200 }} placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="gi" />
        <select style={s.select} value={methodF} onChange={e => setMethodF(e.target.value)} className="gs">
          <option value="All">All Methods</option>
          {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
        {session.role === "admin" && (
          <select style={s.select} value={memberF} onChange={e => setMemberF(e.target.value)} className="gs">
            <option value="All">All Members</option>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
        )}
        <span style={s.totalBadge}>Total: {formatPKR(total)}</span>
        {session.role === "admin" && <button style={s.btnOutline} onClick={onExport} className="go">↓ Export CSV</button>}
      </div>
      <div style={s.card}>
        <table style={s.table}>
          <thead>
            <tr>
              {["Date", "Donor", "Amount", "Method", "Collected By", "Notes", session.role === "admin" ? "" : null].filter(Boolean).map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={s.emptyCell}>No donations found</td></tr>
            ) : filtered.map(d => (
              <tr key={d.id} style={s.tr} className="tr">
                <td style={s.td}>{fmtDate(d.created_at)}</td>
                <td style={s.td}>{d.donor_name || <span style={{ color: "#333" }}>Anonymous</span>}</td>
                <td style={{ ...s.td, color: "#c9a84c", fontWeight: "bold" }}>{formatPKR(d.amount)}</td>
                <td style={s.td}><span style={s.badge}>{d.method}</span></td>
                <td style={s.td}>{d.reference}</td>
                <td style={{ ...s.td, color: "#444", fontSize: 12 }}>{d.notes || "—"}</td>
                {session.role === "admin" && <td style={s.td}><button style={s.delBtn} onClick={() => onDelete(d.id)} className="db">×</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Expenses Page ────────────────────────────────────────────────────────────
function ExpensesPage({ expenses, session, onDelete, onExport }) {
  const [catF, setCatF] = useState("All");
  const filtered = expenses.filter(e => catF === "All" || e.category === catF);
  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <div style={s.filterRow}>
        <select style={s.select} value={catF} onChange={e => setCatF(e.target.value)} className="gs">
          <option value="All">All Categories</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <span style={s.totalBadge}>Total: {formatPKR(total)}</span>
        {session.role === "admin" && <button style={s.btnOutline} onClick={onExport} className="go">↓ Export CSV</button>}
      </div>
      <div style={s.card}>
        <table style={s.table}>
          <thead>
            <tr>
              {["Date", "Description", "Category", "Amount", "Receipt", session.role === "admin" ? "" : null].filter(Boolean).map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={s.emptyCell}>No expenses found</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} style={s.tr} className="tr">
                <td style={s.td}>{fmtDate(e.created_at)}</td>
                <td style={s.td}>{e.description}</td>
                <td style={s.td}><span style={s.badge2}>{e.category}</span></td>
                <td style={{ ...s.td, color: "#e07b54", fontWeight: "bold" }}>{formatPKR(e.amount)}</td>
                <td style={s.td}>
                  {e.receipt_url
                    ? <a href={e.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color: "#c9a84c", fontSize: 12 }}>View ↗</a>
                    : <span style={{ color: "#333" }}>—</span>}
                </td>
                {session.role === "admin" && <td style={s.td}><button style={s.delBtn} onClick={() => onDelete(e.id)} className="db">×</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
function LeaderboardPage({ memberStats, totalDonations }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {memberStats.map((m, i) => {
        const pct = totalDonations > 0 ? (m.total / totalDonations) * 100 : 0;
        return (
          <div key={m.name} style={{ ...s.lbItem, ...(i === 0 ? s.lbFirst : {}) }} className="li">
            <div style={{ fontSize: 28, minWidth: 44, textAlign: "center" }}>
              {medals[i] || <span style={{ color: "#333", fontSize: 18 }}>#{i + 1}</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: i === 0 ? "#c9a84c" : "#ddd", fontFamily: "serif", fontSize: i === 0 ? 20 : 16, fontWeight: i === 0 ? "bold" : "normal" }}>{m.name}</span>
                <span style={{ color: i === 0 ? "#c9a84c" : "#aaa", fontWeight: "bold" }}>{formatPKR(m.total)}</span>
              </div>
              <div style={{ background: "#1a1a1a", borderRadius: 6, height: 8 }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 6, background: i === 0 ? "linear-gradient(90deg,#7a5800,#c9a84c)" : "#252525", transition: "width 1s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 12 }}>
                <span style={{ color: "#444" }}>{m.count} collection{m.count !== 1 ? "s" : ""}</span>
                <span style={{ color: "#444" }}>{pct.toFixed(1)}% of total</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function DonationModal({ onClose, onSave }) {
  const [form, setForm] = useState({ donorName: "", amount: "", method: "Cash", reference: MEMBERS[0], notes: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState({});

  const submit = async () => {
    const e = {};
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) e.amount = "Enter a valid amount";
    if (Object.keys(e).length) { setErr(e); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Modal title="Record Donation" onClose={onClose}>
      <div style={s.formGrid}>
        <Field label="Donor Name (optional)">
          <input style={s.input} value={form.donorName} onChange={e => setForm({ ...form, donorName: e.target.value })} placeholder="Anonymous" className="gi" />
        </Field>
        <Field label="Amount (PKR) *" error={err.amount}>
          <input style={{ ...s.input, ...(err.amount ? { borderColor: "#e07b54" } : {}) }} type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className="gi" />
        </Field>
        <Field label="Payment Method *">
          <select style={s.select} value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className="gs">
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Collected By *">
          <select style={s.select} value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} className="gs">
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Notes" full>
          <textarea style={{ ...s.input, height: 72, resize: "vertical" }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." className="gi" />
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} label="Save Donation" />
    </Modal>
  );
}

function ExpenseModal({ onClose, onSave }) {
  const [form, setForm] = useState({ description: "", amount: "", category: "Miscellaneous", receiptFile: null });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState({});

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setForm(prev => ({ ...prev, receiptFile: f }));
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    const e = {};
    if (!form.description.trim()) e.description = "Description required";
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) e.amount = "Enter a valid amount";
    if (Object.keys(e).length) { setErr(e); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Modal title="Record Expense" onClose={onClose}>
      <div style={s.formGrid}>
        <Field label="Description *" error={err.description} full>
          <input style={{ ...s.input, ...(err.description ? { borderColor: "#e07b54" } : {}) }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What was this for?" className="gi" />
        </Field>
        <Field label="Amount (PKR) *" error={err.amount}>
          <input style={{ ...s.input, ...(err.amount ? { borderColor: "#e07b54" } : {}) }} type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className="gi" />
        </Field>
        <Field label="Category">
          <select style={s.select} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="gs">
            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Receipt Photo (optional)" full>
          <label style={s.uploadZone} className="uz">
            {preview ? <img src={preview} alt="receipt" style={{ maxHeight: 110, maxWidth: "100%", borderRadius: 6 }} />
              : <div style={{ textAlign: "center", color: "#444" }}><div style={{ fontSize: 26 }}>↑</div><div style={{ fontSize: 12, marginTop: 4 }}>Click to upload receipt</div></div>}
            <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleFile} />
          </label>
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={submit} saving={saving} label="Save Expense" />
    </Modal>
  );
}

function GoalModal({ currentGoal, onClose, onSave }) {
  const [goal, setGoal] = useState(currentGoal);
  return (
    <Modal title="Set Fundraising Goal" onClose={onClose}>
      <Field label="Goal Amount (PKR)">
        <input style={s.input} type="number" value={goal} onChange={e => setGoal(Number(e.target.value))} className="gi" />
      </Field>
      <ModalFooter onClose={onClose} onSave={() => onSave(goal)} label="Update Goal" />
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <h3 style={{ color: "#c9a84c", fontSize: 14, letterSpacing: 2, textTransform: "uppercase" }}>{title}</h3>
          <button style={s.xBtn} onClick={onClose} className="xb">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSave, saving, label }) {
  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
      <button style={s.btnOutline} onClick={onClose} className="go">Cancel</button>
      <button style={s.btnPrimary} onClick={onSave} disabled={saving} className="gb">{saving ? "Saving…" : label}</button>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function Field({ label, children, error, full }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, ...(full ? { gridColumn: "1 / -1" } : {}) }}>
      <label style={{ color: "#444", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</label>
      {children}
      {error && <span style={{ color: "#e07b54", fontSize: 11 }}>{error}</span>}
    </div>
  );
}

function CardLabel({ children }) {
  return <p style={{ color: "#444", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{children}</p>;
}

function Toast({ msg, type }) {
  return (
    <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9000, background: type === "success" ? "#0d1f0d" : "#1f0d0d", border: `1px solid ${type === "success" ? "#4caf50" : "#f44336"}`, color: "#ddd", padding: "13px 20px", borderRadius: 10, fontSize: 13, letterSpacing: 0.5, boxShadow: "0 8px 24px rgba(0,0,0,0.6)", animation: "fadeIn 0.3s ease" }}>
      {type === "success" ? "✓" : "✗"} {msg}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  app: { display: "flex", minHeight: "100vh", background: "#0a0a0a", fontFamily: "Georgia, serif", color: "#ccc" },
  loadingScreen: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0a", gap: 16 },
  spinner: { width: 36, height: 36, border: "2px solid #1a1a1a", borderTop: "2px solid #c9a84c", borderRadius: "50%" },

  loginScreen: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0a0a", backgroundImage: "radial-gradient(ellipse at 50% 0%, #1a1100 0%, #0a0a0a 70%)" },
  loginCard: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: "44px 38px", width: "100%", maxWidth: 400, boxShadow: "0 32px 64px rgba(0,0,0,0.9)" },
  logoWrap: { display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 },
  logoCircle: { width: 68, height: 68, border: "2px solid #c9a84c", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#c9a84c", fontSize: 26, marginBottom: 6 },
  logoHint: { color: "#2a2a2a", fontSize: 10, letterSpacing: 1 },
  loginTitle: { textAlign: "center", fontSize: 24, color: "#c9a84c", letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 },
  loginSub: { textAlign: "center", color: "#333", fontSize: 12, letterSpacing: 1, marginBottom: 28 },
  loginHint: { textAlign: "center", color: "#252525", fontSize: 11, marginTop: 18 },
  errMsg: { color: "#e07b54", fontSize: 12, textAlign: "center" },

  sidebar: { width: 220, background: "#0d0d0d", borderRight: "1px solid #161616", display: "flex", flexDirection: "column", padding: "22px 0", position: "sticky", top: 0, height: "100vh" },
  sidebarTop: { display: "flex", alignItems: "center", gap: 12, padding: "0 18px 22px", borderBottom: "1px solid #161616", marginBottom: 14 },
  sidebarTitle: { color: "#c9a84c", fontSize: 12, letterSpacing: 3, fontWeight: "bold" },
  sidebarSub: { color: "#333", fontSize: 10, letterSpacing: 1, marginTop: 1 },
  navBtn: { display: "flex", alignItems: "center", gap: 11, padding: "10px 16px", background: "none", border: "none", color: "#444", fontSize: 12, letterSpacing: 1, cursor: "pointer", borderRadius: 7, textAlign: "left", fontFamily: "Georgia, serif", transition: "all 0.15s" },
  navActive: { background: "#140f00", color: "#c9a84c", borderLeft: "2px solid #c9a84c" },
  logoutBtn: { display: "flex", alignItems: "center", gap: 10, margin: "0 12px", padding: "10px 16px", background: "none", border: "1px solid #161616", color: "#333", fontSize: 12, cursor: "pointer", borderRadius: 7, fontFamily: "Georgia, serif" },

  main: { flex: 1, overflow: "auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "26px 30px 18px", borderBottom: "1px solid #161616", position: "sticky", top: 0, background: "#0a0a0a", zIndex: 100 },
  headerTitle: { fontSize: 20, color: "#ddd", letterSpacing: 2, margin: 0 },
  headerDate: { color: "#2a2a2a", fontSize: 11, letterSpacing: 1, marginTop: 4 },

  pageWrap: { padding: "22px 28px" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 },
  statCard: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: 20, transition: "all 0.2s" },
  midGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  card: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: "22px 22px" },
  actRow: { display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #131313" },

  progTrack: { background: "#181818", borderRadius: 8, height: 11, overflow: "hidden" },
  progBar: { height: "100%", background: "linear-gradient(90deg,#7a5800,#c9a84c)", borderRadius: 8, transition: "width 1s ease" },

  lbItem: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: "18px 22px", display: "flex", alignItems: "center", gap: 18, transition: "all 0.18s" },
  lbFirst: { background: "#110e00", border: "1px solid #2e1f00", boxShadow: "0 0 20px rgba(201,168,76,0.07)" },

  filterRow: { display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" },
  totalBadge: { background: "#140f00", border: "1px solid #2e1f00", color: "#c9a84c", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: "bold", marginLeft: "auto" },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { color: "#333", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", padding: "10px 14px", textAlign: "left", fontWeight: "normal", borderBottom: "1px solid #181818" },
  tr: { borderBottom: "1px solid #111" },
  td: { padding: "13px 14px", color: "#bbb", fontSize: 13 },
  emptyCell: { textAlign: "center", padding: 36, color: "#2a2a2a" },
  badge: { background: "#140f00", color: "#c9a84c", border: "1px solid #2e1f00", padding: "3px 9px", borderRadius: 20, fontSize: 11 },
  badge2: { background: "#0d1616", color: "#6bb0c0", border: "1px solid #162828", padding: "3px 9px", borderRadius: 20, fontSize: 11 },
  delBtn: { background: "none", border: "1px solid #1e1212", color: "#5a2a2a", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 14, fontFamily: "Georgia, serif", transition: "all 0.15s" },
  smBtn: { background: "none", border: "1px solid #1e1e00", color: "#c9a84c", borderRadius: 6, padding: "4px 10px", fontSize: 10, cursor: "pointer", letterSpacing: 1, fontFamily: "Georgia, serif" },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(5px)" },
  modal: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: 30, width: "100%", maxWidth: 510, boxShadow: "0 32px 64px rgba(0,0,0,0.95)", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, borderBottom: "1px solid #181818", paddingBottom: 14 },
  xBtn: { background: "none", border: "1px solid #1e1e1e", color: "#444", width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 18 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },

  input: { background: "#0c0c0c", border: "1px solid #1e1e1e", borderRadius: 8, color: "#ddd", padding: "10px 13px", fontSize: 13, fontFamily: "Georgia, serif", outline: "none", width: "100%", boxSizing: "border-box" },
  select: { background: "#0c0c0c", border: "1px solid #1e1e1e", borderRadius: 8, color: "#ddd", padding: "10px 13px", fontSize: 13, fontFamily: "Georgia, serif", outline: "none", cursor: "pointer" },
  uploadZone: { border: "2px dashed #1e1e1e", borderRadius: 10, padding: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", minHeight: 90, transition: "border-color 0.2s" },

  btnPrimary: { background: "linear-gradient(135deg,#7a5800,#c9a84c)", color: "#000", border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 13, cursor: "pointer", fontWeight: "bold", letterSpacing: 1, fontFamily: "Georgia, serif" },
  btnOutline: { background: "none", color: "#555", border: "1px solid #1e1e1e", borderRadius: 8, padding: "10px 22px", fontSize: 13, cursor: "pointer", letterSpacing: 1, fontFamily: "Georgia, serif" },
};

const globalCSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0a0a; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
.spin { animation: spin 1s linear infinite; }
.gi:focus { border-color: #c9a84c !important; box-shadow: 0 0 0 1px rgba(201,168,76,0.15); }
.gs:focus { border-color: #c9a84c !important; }
.gb:hover { opacity: 0.85; transform: translateY(-1px); transition: all 0.15s; }
.gb:disabled { opacity: 0.5; cursor: not-allowed; }
.go:hover { border-color: #c9a84c; color: #c9a84c; transition: all 0.15s; }
.nb:hover { background: #130f00 !important; color: #888 !important; }
.lb:hover { border-color: #2a1010 !important; color: #a05050 !important; transition: all 0.15s; }
.sc:hover { border-color: #222; transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.4); }
.tr:hover { background: #111 !important; }
.li:hover { border-color: #222; transform: translateX(3px); }
.uz:hover { border-color: #c9a84c !important; }
.xb:hover { border-color: #c9a84c; color: #c9a84c; }
.db:hover { border-color: #7a2a2a; color: #e07070; }
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: #0a0a0a; }
::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 3px; }
`;
