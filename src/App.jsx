import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const MEMBERS = ["Faiz", "Moeed", "Umair", "Hassan Ali", "Hassan Tariq", "Farah", "Hamza"];
const PAYMENT_METHODS = ["Cash", "UBL", "Sadapay", "EasyPaisa", "Bank Transfer"];
const EXPENSE_CATEGORIES = ["Food", "Transport", "Equipment", "Venue", "Marketing", "Miscellaneous"];
const ADMIN_CREDS = { username: "admin", password: "admin123" };
const MEMBER_CREDS = MEMBERS.reduce((acc, m) => {
  const key = m.toLowerCase().replace(/\s+/g, "");
  acc[key] = { username: key, password: "member123", name: m };
  return acc;
}, {});

const C = {
  red: "#E8302A", orange: "#F47C20", yellow: "#F5C518",
  green: "#3AAA35", blue: "#2E86C1", purple: "#7B3FA0",
  bg: "#0C0C0F", surface: "#13131A", card: "#18181F",
  border: "#22222E", borderHover: "#333345",
  text: "#F0F0F5", textMuted: "#6B6B80", textDim: "#3A3A4A",
};
const RS = [C.red, C.orange, C.yellow, C.green, C.blue, C.purple];

const formatPKR = (n) => `PKR ${Number(n || 0).toLocaleString("en-PK")}`;

// ─── Particles Background ─────────────────────────────────────────────────────
function Particles() {
  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    size: Math.random() * 3 + 1,
    x: Math.random() * 100,
    y: Math.random() * 100,
    duration: Math.random() * 20 + 10,
    delay: Math.random() * 10,
    color: RS[Math.floor(Math.random() * RS.length)],
    opacity: Math.random() * 0.4 + 0.1,
  }));
  return (
    <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none", zIndex:0 }}>
      {particles.map(p => (
        <div key={p.id} className="particle" style={{
          position:"absolute",
          left:`${p.x}%`,
          top:`${p.y}%`,
          width:p.size,
          height:p.size,
          borderRadius:"50%",
          background:p.color,
          opacity:p.opacity,
          animationDuration:`${p.duration}s`,
          animationDelay:`${p.delay}s`,
        }} />
      ))}
    </div>
  );
}
const fmtDate = (d) => new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });

function exportCSV(rows, filename, headers) {
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename; a.click();
}

// Hook for responsive
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return isMobile;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [donations, setDonations] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [goal, setGoal] = useState(500000);
  const [loading, setLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const isMobile = useIsMobile();

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: don }, { data: exp }, { data: set }] = await Promise.all([
      supabase.from("donations").select("*").order("created_at", { ascending: false }),
      supabase.from("expenses").select("*").order("created_at", { ascending: false }),
      supabase.from("settings").select("*"),
    ]);
    setDonations(don || []); setExpenses(exp || []);
    const g = (set || []).find(s => s.key === "goal");
    if (g) setGoal(Number(g.value));
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const notify = (msg, type = "success") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const { username, password } = loginForm;
    if (username === ADMIN_CREDS.username && password === ADMIN_CREDS.password) {
      setSession({ role: "admin", name: "Admin" });
    } else {
      const member = MEMBER_CREDS[username];
      if (member && member.password === password) { setSession({ role: "member", name: member.name }); }
      else { setLoginError("Invalid credentials."); return; }
    }
    setLoginError("");
  };

  const handleLogout = () => { setSession(null); setPage("dashboard"); setLoginForm({ username: "", password: "" }); };

  const addDonation = async (form) => {
    const { error } = await supabase.from("donations").insert([{
      donor_name: form.donorName || null, amount: Number(form.amount),
      method: form.method, reference: form.reference, notes: form.notes || null,
    }]);
    if (error) { notify("Error saving", "error"); return; }
    await loadAll(); setModal(null); notify("Donation recorded!");
  };

  const deleteDonation = async (id) => {
    if (!confirm("Delete this donation?")) return;
    await supabase.from("donations").delete().eq("id", id);
    await loadAll(); notify("Deleted");
  };

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
      description: form.description, amount: Number(form.amount),
      category: form.category, receipt_url,
    }]);
    if (error) { notify("Error saving", "error"); return; }
    await loadAll(); setModal(null); notify("Expense recorded!");
  };

  const deleteExpense = async (id) => {
    if (!confirm("Delete this expense?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    await loadAll(); notify("Deleted");
  };

  const updateGoal = async (newGoal) => {
    await supabase.from("settings").upsert([{ key: "goal", value: String(newGoal) }]);
    setGoal(newGoal); setModal(null); notify("Goal updated!");
  };

  const totalDonations = donations.reduce((s, d) => s + Number(d.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netBalance = totalDonations - totalExpenses;
  const goalProgress = Math.min((totalDonations / goal) * 100, 100);
  const memberStats = MEMBERS.map(m => {
    const md = donations.filter(d => d.reference === m);
    return { name: m, total: md.reduce((s, d) => s + Number(d.amount), 0), count: md.length };
  }).sort((a, b) => b.total - a.total);

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:C.bg, gap:20, fontFamily:"'Barlow',sans-serif" }}>
      <div style={{ display:"flex", gap:7 }}>
        {RS.map((c,i) => <div key={i} className="bounce-dot" style={{ width:11, height:11, borderRadius:"50%", background:c, animationDelay:`${i*0.1}s` }} />)}
      </div>
      <p style={{ color:C.textMuted, fontSize:12, letterSpacing:4, fontWeight:700, textTransform:"uppercase" }}>Roshan Safar</p>
      <style>{css}</style>
    </div>
  );

  if (!session) return <LoginScreen form={loginForm} setForm={setLoginForm} onSubmit={handleLogin} error={loginError} isMobile={isMobile} />;

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:C.bg, fontFamily:"'Barlow',sans-serif", color:C.text }}>
      {toast && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", zIndex:9999, background:toast.type==="success"?"#0A1F0A":"#1F0A0A", border:`1px solid ${toast.type==="success"?C.green:C.red}`, color:C.text, padding:"12px 20px", borderRadius:12, fontSize:13, fontWeight:600, boxShadow:"0 8px 32px rgba(0,0,0,0.7)", animation:"slideIn 0.3s ease", whiteSpace:"nowrap" }}>
          {toast.type==="success"?"✓":"✗"} {toast.msg}
        </div>
      )}

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* Desktop sidebar */}
        {!isMobile && <Sidebar session={session} page={page} setPage={setPage} onLogout={handleLogout} />}

        <main style={{ flex:1, overflow:"auto", display:"flex", flexDirection:"column", paddingBottom: isMobile ? 80 : 0 }}>
          <Header session={session} page={page} onAddDonation={()=>setModal("donation")} onAddExpense={()=>setModal("expense")} isMobile={isMobile} onLogout={handleLogout} />
          <div style={{ padding: isMobile ? "16px 14px" : "24px 28px", flex:1 }}>
            {page==="dashboard" && <Dashboard totalDonations={totalDonations} totalExpenses={totalExpenses} netBalance={netBalance} goalProgress={goalProgress} goal={goal} donations={donations} expenses={expenses} memberStats={memberStats} session={session} onEditGoal={()=>setModal("goal")} isMobile={isMobile} />}
            {page==="donations" && <DonationsPage donations={donations} session={session} onDelete={deleteDonation} isMobile={isMobile} onExport={()=>exportCSV(donations.map(d=>({Date:fmtDate(d.created_at),Donor:d.donor_name||"Anonymous",Amount:d.amount,Method:d.method,Reference:d.reference,Notes:d.notes||""})),"donations.csv",["Date","Donor","Amount","Method","Reference","Notes"])} />}
            {page==="expenses" && <ExpensesPage expenses={expenses} session={session} onDelete={deleteExpense} isMobile={isMobile} onExport={()=>exportCSV(expenses.map(e=>({Date:fmtDate(e.created_at),Description:e.description,Category:e.category,Amount:e.amount})),"expenses.csv",["Date","Description","Category","Amount"])} />}
            {page==="leaderboard" && <LeaderboardPage memberStats={memberStats} totalDonations={totalDonations} />}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && <BottomNav session={session} page={page} setPage={setPage} onAddDonation={()=>setModal("donation")} onAddExpense={()=>setModal("expense")} />}

      {modal==="donation" && <DonationModal onClose={()=>setModal(null)} onSave={addDonation} isMobile={isMobile} />}
      {modal==="expense" && <ExpenseModal onClose={()=>setModal(null)} onSave={addExpense} isMobile={isMobile} />}
      {modal==="goal" && <GoalModal currentGoal={goal} onClose={()=>setModal(null)} onSave={updateGoal} />}
      <style>{css}</style>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({ form, setForm, onSubmit, error, isMobile }) {
  const [showPass, setShowPass] = useState(false);

  const LeftPanel = () => (
    <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden", minHeight: isMobile ? "auto" : "100vh", padding: isMobile ? "52px 24px 36px" : 40 }}>
      <Particles />
      {/* Glow orb */}
      <div style={{ position:"absolute", bottom:-180, left:"50%", transform:"translateX(-50%)", width:700, height:700, borderRadius:"50%", background:`conic-gradient(from 180deg,${C.red},${C.orange},${C.yellow},${C.green},${C.blue},${C.purple},${C.red})`, opacity:0.06, filter:"blur(4px)", pointerEvents:"none" }} />
      <div style={{ position:"relative", zIndex:1, textAlign:"center" }}>
        {/* Transparent logo2 */}
        <img
          src="/logo2.png"
          alt="Roshan Safar"
          style={{ width: isMobile ? 180 : 240, mixBlendMode:"lighten", filter:"brightness(1.05) drop-shadow(0 0 40px rgba(245,197,24,0.15))", marginBottom: isMobile ? 20 : 28, display:"block", margin:"0 auto" }}
          onError={e => { e.target.style.display="none"; }}
        />
        <div style={{ marginTop: isMobile ? 20 : 28 }}>
          <h1 style={{ fontSize: isMobile ? 34 : 48, fontWeight:900, color:C.text, letterSpacing:-2, margin:"0 0 6px", lineHeight:1 }}>Roshan Safar</h1>
          <p style={{ color:C.textMuted, fontSize: isMobile ? 11 : 12, letterSpacing:5, textTransform:"uppercase", fontWeight:600, marginBottom: isMobile ? 20 : 32 }}>Member Portal</p>
          {/* Color bar */}
          <div style={{ display:"flex", justifyContent:"center", gap:6 }}>
            {RS.map((c,i) => <div key={i} style={{ width: isMobile ? 24 : 36, height:4, borderRadius:99, background:c, opacity:0.85 }} />)}
          </div>
        </div>
      </div>
    </div>
  );

  const RightPanel = () => (
    <div style={{ width: isMobile ? "100%" : 420, background:C.surface, borderLeft: isMobile ? "none" : `1px solid ${C.border}`, borderTop: isMobile ? `1px solid ${C.border}` : "none", display:"flex", alignItems:"center", justifyContent:"center", padding: isMobile ? "32px 24px 48px" : "0 52px" }}>
      <div style={{ width:"100%" }}>
        {/* Logo2 centered on right panel */}
        <img
          src="/logo2.png"
          alt=""
          style={{ width:110, mixBlendMode:"lighten", marginBottom:28, opacity:0.85, display:"block", margin:"0 auto 28px" }}
          onError={e => { e.target.style.display="none"; }}
        />
        <h2 style={{ fontSize: isMobile ? 26 : 28, fontWeight:900, color:C.text, letterSpacing:-0.8, marginBottom:4, textAlign:"center" }}>Welcome back</h2>
        <p style={{ color:C.textMuted, fontSize:14, fontWeight:400, marginBottom:36, lineHeight:1.5, textAlign:"center" }}>Sign in to access the society portal</p>

        <form onSubmit={onSubmit} style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {/* Username */}
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            <label style={{ color:C.textMuted, fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase" }}>Username</label>
            <input
              style={{ ...inp, fontSize: isMobile ? 16 : 14, padding:"13px 16px" }}
              value={form.username}
              onChange={e => setForm({...form, username:e.target.value})}
              placeholder="Enter your username"
              className="rs-input"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {/* Password - hidden label, show/hide toggle */}
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            <label style={{ color:C.textMuted, fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase" }}>Password</label>
            <div style={{ position:"relative" }}>
              <input
                style={{ ...inp, fontSize: isMobile ? 16 : 14, padding:"13px 48px 13px 16px" }}
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={e => setForm({...form, password:e.target.value})}
                placeholder="Enter your password"
                className="rs-input"
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.textMuted, cursor:"pointer", fontSize:14, padding:4, fontFamily:"'Barlow',sans-serif" }}>
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ display:"flex", alignItems:"center", gap:8, background:"#1F0A0A", border:`1px solid ${C.red}30`, borderRadius:9, padding:"10px 14px" }}>
              <span style={{ color:C.red, fontSize:13 }}>⚠</span>
              <p style={{ color:"#f08080", fontSize:13, fontWeight:500 }}>{error}</p>
            </div>
          )}

          <button style={{ ...btnP(C.green), padding: isMobile ? "15px" : "14px", fontSize:15, marginTop:4, borderRadius:11, letterSpacing:0.5 }} type="submit" className="rs-btn">
            Sign In
          </button>
        </form>

        {/* Subtle divider line */}
        <div style={{ marginTop:32, paddingTop:24, borderTop:`1px solid ${C.border}` }}>
          <p style={{ color:C.textDim, fontSize:12, fontWeight:500, lineHeight:1.6 }}>
            Contact your administrator if you're having trouble signing in.
          </p>
        </div>
      </div>
    </div>
  );

  if (isMobile) return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Barlow',sans-serif", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <LeftPanel />
      <RightPanel />
      <style>{css}</style>
    </div>
  );

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, fontFamily:"'Barlow',sans-serif" }}>
      <LeftPanel />
      <RightPanel />
      <style>{css}</style>
    </div>
  );
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────
function Sidebar({ session, page, setPage, onLogout }) {
  const nav = session.role==="admin"
    ? [["dashboard","▣","Dashboard",C.blue],["donations","◆","Donations",C.green],["expenses","◇","Expenses",C.orange],["leaderboard","▲","Leaderboard",C.yellow]]
    : [["dashboard","▣","Dashboard",C.blue],["donations","◆","My Donations",C.green],["leaderboard","▲","Leaderboard",C.yellow]];

  return (
    <aside style={{ width:230, background:C.surface, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", position:"sticky", top:0, height:"100vh", flexShrink:0 }}>
      <div style={{ padding:"22px 18px 18px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:11 }}>
          <div style={{ width:40, height:40, borderRadius:10, overflow:"hidden", background:C.card, border:`1px solid ${C.border}`, flexShrink:0 }}>
            <img src="/logo.png" alt="RS" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>{e.target.style.display="none"; e.target.parentElement.style.background=`conic-gradient(${C.red},${C.orange},${C.yellow},${C.green},${C.blue},${C.purple})`;}} />
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:13, color:C.text, letterSpacing:-0.3 }}>Roshan Safar</div>
            <div style={{ fontSize:11, color:C.textMuted, fontWeight:500 }}>{session.role==="admin"?"Administrator":session.name}</div>
          </div>
        </div>
      </div>
      <nav style={{ flex:1, padding:"14px 10px", display:"flex", flexDirection:"column", gap:2 }}>
        {nav.map(([id,icon,label,color])=>{
          const active = page===id;
          return (
            <button key={id} onClick={()=>setPage(id)} className="rs-nav"
              style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 14px", borderRadius:10, border:"none", cursor:"pointer", textAlign:"left", fontFamily:"'Barlow',sans-serif", fontWeight:active?700:500, fontSize:14, transition:"all 0.15s", background:active?`${color}18`:"transparent", color:active?color:C.textMuted, borderLeft:active?`3px solid ${color}`:"3px solid transparent" }}>
              <span>{icon}</span>{label}
            </button>
          );
        })}
      </nav>
      <div style={{ padding:"10px", borderTop:`1px solid ${C.border}` }}>
        <button onClick={onLogout} className="rs-logout" style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'Barlow',sans-serif", transition:"all 0.15s" }}>
          ⊗ Sign Out
        </button>
      </div>
    </aside>
  );
}

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────
function BottomNav({ session, page, setPage, onAddDonation, onAddExpense }) {
  const nav = session.role==="admin"
    ? [["dashboard","▣","Home",C.blue],["donations","◆","Donations",C.green],["expenses","◇","Expenses",C.orange],["leaderboard","▲","Ranks",C.yellow]]
    : [["dashboard","▣","Home",C.blue],["donations","◆","My Donations",C.green],["leaderboard","▲","Ranks",C.yellow]];

  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, background:C.surface, borderTop:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-around", padding:"8px 4px 12px", zIndex:500, backdropFilter:"blur(10px)" }}>
      {nav.map(([id,icon,label,color])=>{
        const active = page===id;
        return (
          <button key={id} onClick={()=>setPage(id)}
            style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"6px 12px", border:"none", background:"none", cursor:"pointer", color:active?color:C.textDim, fontFamily:"'Barlow',sans-serif", transition:"all 0.15s", flex:1 }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            <span style={{ fontSize:10, fontWeight:active?700:500 }}>{label}</span>
            {active && <div style={{ width:20, height:3, borderRadius:99, background:color, marginTop:1 }} />}
          </button>
        );
      })}
      {session.role==="admin" && (
        <button onClick={onAddDonation}
          style={{ width:48, height:48, borderRadius:"50%", background:`linear-gradient(135deg,${C.green},${C.blue})`, border:"none", color:"#fff", fontSize:24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:`0 4px 16px ${C.green}50`, flexShrink:0 }}>
          +
        </button>
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ session, page, onAddDonation, onAddExpense, isMobile, onLogout }) {
  const titles = { dashboard:"Dashboard", donations:session.role==="member"?"My Donations":"Donations", expenses:"Expenses", leaderboard:"Leaderboard" };
  return (
    <div style={{ padding: isMobile?"14px 16px":"20px 28px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:C.surface, position:"sticky", top:0, zIndex:100 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {isMobile && (
          <div style={{ width:30, height:30, borderRadius:8, overflow:"hidden", flexShrink:0 }}>
            <img src="/logo.png" alt="RS" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>{e.target.style.display="none";}} />
          </div>
        )}
        <h2 style={{ fontSize: isMobile?17:21, fontWeight:800, color:C.text, margin:0, letterSpacing:-0.3 }}>{titles[page]}</h2>
      </div>
      {!isMobile && session.role==="admin" && (
        <div style={{ display:"flex", gap:10 }}>
          <button style={{ ...btnO, borderColor:C.orange, color:C.orange }} onClick={onAddExpense} className="rs-btn">+ Expense</button>
          <button style={btnP(C.green)} onClick={onAddDonation} className="rs-btn">+ Donation</button>
        </div>
      )}
      {isMobile && (
        <button onClick={onLogout} style={{ background:"none", border:`1px solid ${C.border}`, color:C.textMuted, borderRadius:8, padding:"6px 10px", fontSize:11, cursor:"pointer", fontFamily:"'Barlow',sans-serif", fontWeight:600 }}>
          Sign Out
        </button>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ totalDonations, totalExpenses, netBalance, goalProgress, goal, donations, expenses, memberStats, session, onEditGoal, isMobile }) {
  const recent = [...donations.slice(0,5).map(d=>({...d,_t:"d"})), ...expenses.slice(0,3).map(e=>({...e,_t:"e"}))]
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,6);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Stats - 2x2 on mobile, 4x1 on desktop */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(4,1fr)", gap:10 }}>
        {[
          { label:"Collected", val:formatPKR(totalDonations), sub:`${donations.length} donations`, color:C.green, icon:"💰" },
          { label:"Expenses", val:formatPKR(totalExpenses), sub:`${expenses.length} entries`, color:C.orange, icon:"🧾" },
          { label:"Balance", val:formatPKR(netBalance), sub:"available", color:netBalance>=0?C.blue:C.red, icon:"◎" },
          { label:"Members", val:MEMBERS.length, sub:"active", color:C.purple, icon:"👥" },
        ].map((st,i)=>(
          <div key={st.label} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding: isMobile?"14px 12px":"18px", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:-15, right:-15, width:60, height:60, borderRadius:"50%", background:`${st.color}18`, filter:"blur(14px)" }} />
            <div style={{ fontSize: isMobile?18:22, marginBottom:8 }}>{st.icon}</div>
            <div style={{ color:C.textMuted, fontSize: isMobile?9:10, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase", marginBottom:4 }}>{st.label}</div>
            <div style={{ color:st.color, fontSize: isMobile?14:19, fontWeight:800, letterSpacing:-0.5, marginBottom:2 }}>{st.val}</div>
            <div style={{ color:C.textDim, fontSize:11, fontWeight:500 }}>{st.sub}</div>
          </div>
        ))}
      </div>

      {/* Goal */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding: isMobile?"16px":"20px 22px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <p style={cardT}>Fundraising Goal</p>
          {session.role==="admin" && <button style={{ background:"none", border:`1px solid ${C.border}`, color:C.textMuted, borderRadius:7, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"'Barlow',sans-serif", fontWeight:600 }} onClick={onEditGoal} className="rs-sm-btn">Edit</button>}
        </div>
        <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:12 }}>
          <span style={{ fontSize: isMobile?20:26, fontWeight:800, color:C.green, letterSpacing:-1 }}>{formatPKR(totalDonations)}</span>
          <span style={{ color:C.textDim, fontSize:13, fontWeight:600 }}>/ {formatPKR(goal)}</span>
        </div>
        <div style={{ background:C.border, borderRadius:99, height:10, overflow:"hidden", marginBottom:8 }}>
          <div style={{ height:"100%", width:`${goalProgress}%`, borderRadius:99, background:`linear-gradient(90deg,${C.red},${C.orange},${C.yellow},${C.green})`, transition:"width 1.2s ease" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontWeight:600 }}>
          <span style={{ color:C.green }}>{goalProgress.toFixed(1)}% reached</span>
          <span style={{ color:C.textMuted }}>{formatPKR(Math.max(goal-totalDonations,0))} to go</span>
        </div>
      </div>

      {/* Top contributor */}
      {memberStats[0]&&memberStats[0].total>0 && (
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding: isMobile?"16px":"20px 22px" }}>
          <p style={cardT}>🏆 Top Contributor</p>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:10 }}>
            <span style={{ fontSize:44 }}>🏆</span>
            <div>
              <div style={{ fontSize: isMobile?20:22, fontWeight:800, color:C.yellow, letterSpacing:-0.5 }}>{memberStats[0].name}</div>
              <div style={{ color:C.textMuted, fontSize:13, fontWeight:500 }}>{memberStats[0].count} collections</div>
              <div style={{ color:C.text, fontSize:17, fontWeight:700, marginTop:4 }}>{formatPKR(memberStats[0].total)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding: isMobile?"16px":"20px 22px" }}>
        <p style={cardT}>Recent Activity</p>
        {recent.length===0?<p style={{ color:C.textDim, fontSize:14, marginTop:10 }}>No activity yet</p>:recent.map(item=>(
          <div key={item.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ width:36, height:36, borderRadius:10, background:item._t==="d"?`${C.green}18`:`${C.orange}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{item._t==="d"?"💚":"🧡"}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:C.text, fontSize:13, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {item._t==="d"?`${item.reference} · ${item.method}`:`${item.category} · ${item.description}`}
              </div>
              <div style={{ color:C.textMuted, fontSize:11, marginTop:1 }}>{fmtDate(item.created_at)}</div>
            </div>
            <div style={{ color:item._t==="d"?C.green:C.orange, fontWeight:700, fontSize:13, whiteSpace:"nowrap" }}>
              {item._t==="d"?"+":"-"}{formatPKR(item.amount)}
            </div>
          </div>
        ))}
      </div>

      {/* Member overview */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding: isMobile?"16px":"20px 22px" }}>
        <p style={cardT}>Member Overview</p>
        {memberStats.map((m,i)=>{
          const col = RS[i%RS.length];
          return (
            <div key={m.name} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ width:22, height:22, borderRadius:6, background:`${col}20`, color:col, fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</span>
              <span style={{ flex:1, color:C.text, fontSize:13, fontWeight:600, minWidth:0 }}>{m.name}</span>
              <div style={{ width:50, background:C.border, borderRadius:99, height:5, flexShrink:0 }}>
                <div style={{ width:`${memberStats[0].total>0?(m.total/memberStats[0].total)*100:0}%`, height:"100%", background:col, borderRadius:99 }} />
              </div>
              <span style={{ color:C.textMuted, fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>{formatPKR(m.total)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Donations Page ───────────────────────────────────────────────────────────
function DonationsPage({ donations, session, onDelete, onExport, isMobile }) {
  const [search, setSearch] = useState("");
  const [methodF, setMethodF] = useState("All");
  const [memberF, setMemberF] = useState("All");

  const filtered = donations.filter(d => {
    if (session.role==="member"&&d.reference!==session.name) return false;
    if (methodF!=="All"&&d.method!==methodF) return false;
    if (memberF!=="All"&&d.reference!==memberF) return false;
    if (search) { const q=search.toLowerCase(); if(!d.reference?.toLowerCase().includes(q)&&!d.donor_name?.toLowerCase().includes(q)) return false; }
    return true;
  });
  const total = filtered.reduce((s,d)=>s+Number(d.amount),0);

  if (isMobile) return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        <input style={{ ...inp, flex:1, fontSize:16 }} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} className="rs-input" />
        <select style={{ ...sel, fontSize:16 }} value={methodF} onChange={e=>setMethodF(e.target.value)} className="rs-select">
          <option value="All">All Methods</option>
          {PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}
        </select>
        {session.role==="admin"&&<select style={{ ...sel, fontSize:16 }} value={memberF} onChange={e=>setMemberF(e.target.value)} className="rs-select">
          <option value="All">All Members</option>
          {MEMBERS.map(m=><option key={m}>{m}</option>)}
        </select>}
      </div>
      <div style={{ background:`${C.green}15`, border:`1px solid ${C.green}35`, color:C.green, padding:"10px 14px", borderRadius:10, fontSize:14, fontWeight:700, marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span>Total Collected</span><span>{formatPKR(total)}</span>
      </div>
      {session.role==="admin"&&<button style={{ ...btnO, width:"100%", marginBottom:12, fontSize:13 }} onClick={onExport} className="rs-btn">↓ Export CSV</button>}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {filtered.length===0?<p style={{ color:C.textDim, textAlign:"center", padding:32 }}>No donations found</p>
        :filtered.map(d=>(
          <div key={d.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div>
                <div style={{ fontWeight:700, color:C.text, fontSize:15 }}>{d.donor_name||"Anonymous"}</div>
                <div style={{ color:C.textMuted, fontSize:12, marginTop:2 }}>{fmtDate(d.created_at)}</div>
              </div>
              <div style={{ color:C.green, fontWeight:800, fontSize:16 }}>{formatPKR(d.amount)}</div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <span style={{ background:`${C.green}12`, color:C.green, border:`1px solid ${C.green}28`, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>{d.method}</span>
              <span style={{ color:C.textMuted, fontSize:12 }}>by {d.reference}</span>
              {d.notes&&<span style={{ color:C.textDim, fontSize:11 }}>· {d.notes}</span>}
              {session.role==="admin"&&<button className="rs-del" style={{ marginLeft:"auto", background:"none", border:`1px solid ${C.border}`, color:C.textDim, borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:13, fontFamily:"'Barlow',sans-serif" }} onClick={()=>onDelete(d.id)}>×</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Desktop table view
  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        <input style={{ ...inp, maxWidth:200 }} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} className="rs-input" />
        <select style={sel} value={methodF} onChange={e=>setMethodF(e.target.value)} className="rs-select">
          <option value="All">All Methods</option>
          {PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}
        </select>
        {session.role==="admin"&&<select style={sel} value={memberF} onChange={e=>setMemberF(e.target.value)} className="rs-select">
          <option value="All">All Members</option>
          {MEMBERS.map(m=><option key={m}>{m}</option>)}
        </select>}
        <div style={{ marginLeft:"auto", display:"flex", gap:10 }}>
          <span style={{ background:`${C.green}15`, border:`1px solid ${C.green}35`, color:C.green, padding:"8px 14px", borderRadius:8, fontSize:13, fontWeight:700 }}>Total: {formatPKR(total)}</span>
          {session.role==="admin"&&<button style={{ ...btnO, fontSize:12 }} onClick={onExport} className="rs-btn">↓ CSV</button>}
        </div>
      </div>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>
            {["Date","Donor","Amount","Method","Collected By","Notes",session.role==="admin"?"⋯":null].filter(v=>v!==null).map(h=>(
              <th key={h} style={{ color:C.textMuted, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", padding:"13px 16px", textAlign:"left" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length===0?<tr><td colSpan={7} style={{ textAlign:"center", padding:40, color:C.textDim }}>No donations found</td></tr>
            :filtered.map(d=>(
              <tr key={d.id} className="rs-tr" style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={td}>{fmtDate(d.created_at)}</td>
                <td style={td}>{d.donor_name||<span style={{ color:C.textDim }}>Anonymous</span>}</td>
                <td style={{ ...td, color:C.green, fontWeight:700 }}>{formatPKR(d.amount)}</td>
                <td style={td}><span style={{ background:`${C.green}12`, color:C.green, border:`1px solid ${C.green}28`, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>{d.method}</span></td>
                <td style={{ ...td, fontWeight:600 }}>{d.reference}</td>
                <td style={{ ...td, color:C.textMuted, fontSize:12 }}>{d.notes||"—"}</td>
                {session.role==="admin"&&<td style={td}><button className="rs-del" style={{ background:"none", border:`1px solid ${C.border}`, color:C.textDim, borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:13, fontFamily:"'Barlow',sans-serif" }} onClick={()=>onDelete(d.id)}>×</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Expenses Page ────────────────────────────────────────────────────────────
function ExpensesPage({ expenses, session, onDelete, onExport, isMobile }) {
  const [catF, setCatF] = useState("All");
  const filtered = expenses.filter(e=>catF==="All"||e.category===catF);
  const total = filtered.reduce((s,e)=>s+Number(e.amount),0);

  if (isMobile) return (
    <div>
      <select style={{ ...sel, width:"100%", fontSize:16, marginBottom:12 }} value={catF} onChange={e=>setCatF(e.target.value)} className="rs-select">
        <option value="All">All Categories</option>
        {EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}
      </select>
      <div style={{ background:`${C.orange}15`, border:`1px solid ${C.orange}35`, color:C.orange, padding:"10px 14px", borderRadius:10, fontSize:14, fontWeight:700, marginBottom:12, display:"flex", justifyContent:"space-between" }}>
        <span>Total Expenses</span><span>{formatPKR(total)}</span>
      </div>
      {session.role==="admin"&&<button style={{ ...btnO, width:"100%", marginBottom:12, fontSize:13 }} onClick={onExport} className="rs-btn">↓ Export CSV</button>}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {filtered.length===0?<p style={{ color:C.textDim, textAlign:"center", padding:32 }}>No expenses found</p>
        :filtered.map(e=>(
          <div key={e.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div>
                <div style={{ fontWeight:700, color:C.text, fontSize:15 }}>{e.description}</div>
                <div style={{ color:C.textMuted, fontSize:12, marginTop:2 }}>{fmtDate(e.created_at)}</div>
              </div>
              <div style={{ color:C.orange, fontWeight:800, fontSize:16 }}>{formatPKR(e.amount)}</div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ background:`${C.blue}12`, color:C.blue, border:`1px solid ${C.blue}28`, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>{e.category}</span>
              {e.receipt_url&&<a href={e.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color:C.blue, fontSize:12, fontWeight:600 }}>View Receipt ↗</a>}
              {session.role==="admin"&&<button className="rs-del" style={{ marginLeft:"auto", background:"none", border:`1px solid ${C.border}`, color:C.textDim, borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:13, fontFamily:"'Barlow',sans-serif" }} onClick={()=>onDelete(e.id)}>×</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center" }}>
        <select style={sel} value={catF} onChange={e=>setCatF(e.target.value)} className="rs-select">
          <option value="All">All Categories</option>
          {EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}
        </select>
        <div style={{ marginLeft:"auto", display:"flex", gap:10 }}>
          <span style={{ background:`${C.orange}15`, border:`1px solid ${C.orange}35`, color:C.orange, padding:"8px 14px", borderRadius:8, fontSize:13, fontWeight:700 }}>Total: {formatPKR(total)}</span>
          {session.role==="admin"&&<button style={{ ...btnO, fontSize:12 }} onClick={onExport} className="rs-btn">↓ CSV</button>}
        </div>
      </div>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>
            {["Date","Description","Category","Amount","Receipt",session.role==="admin"?"⋯":null].filter(v=>v!==null).map(h=>(
              <th key={h} style={{ color:C.textMuted, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", padding:"13px 16px", textAlign:"left" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length===0?<tr><td colSpan={6} style={{ textAlign:"center", padding:40, color:C.textDim }}>No expenses found</td></tr>
            :filtered.map(e=>(
              <tr key={e.id} className="rs-tr" style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={td}>{fmtDate(e.created_at)}</td>
                <td style={{ ...td, fontWeight:600 }}>{e.description}</td>
                <td style={td}><span style={{ background:`${C.blue}12`, color:C.blue, border:`1px solid ${C.blue}28`, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>{e.category}</span></td>
                <td style={{ ...td, color:C.orange, fontWeight:700 }}>{formatPKR(e.amount)}</td>
                <td style={td}>{e.receipt_url?<a href={e.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color:C.blue, fontSize:12, fontWeight:600 }}>View ↗</a>:<span style={{ color:C.textDim }}>—</span>}</td>
                {session.role==="admin"&&<td style={td}><button className="rs-del" style={{ background:"none", border:`1px solid ${C.border}`, color:C.textDim, borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:13, fontFamily:"'Barlow',sans-serif" }} onClick={()=>onDelete(e.id)}>×</button></td>}
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
  const medals = ["🥇","🥈","🥉"];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {memberStats.map((m,i)=>{
        const pct = totalDonations>0?(m.total/totalDonations)*100:0;
        const col = RS[i%RS.length];
        const isFirst = i===0;
        return (
          <div key={m.name} className="rs-lb" style={{ background:isFirst?`${C.yellow}08`:C.card, border:`1px solid ${isFirst?C.yellow+"35":C.border}`, borderRadius:14, padding:"16px 18px", display:"flex", alignItems:"center", gap:14, transition:"all 0.2s" }}>
            <div style={{ fontSize:28, minWidth:40, textAlign:"center" }}>
              {medals[i]||<span style={{ color:C.textDim, fontSize:14, fontWeight:800 }}>#{i+1}</span>}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ color:isFirst?C.yellow:C.text, fontWeight:isFirst?800:600, fontSize:isFirst?18:15, letterSpacing:-0.3 }}>{m.name}</span>
                <span style={{ color:col, fontWeight:800, fontSize:15 }}>{formatPKR(m.total)}</span>
              </div>
              <div style={{ background:C.border, borderRadius:99, height:7 }}>
                <div style={{ width:`${pct}%`, height:"100%", borderRadius:99, background:isFirst?`linear-gradient(90deg,${C.orange},${C.yellow})`:col, transition:"width 1.2s ease" }} />
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:5, fontSize:11, fontWeight:600 }}>
                <span style={{ color:C.textMuted }}>{m.count} collection{m.count!==1?"s":""}</span>
                <span style={{ color:C.textMuted }}>{pct.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function DonationModal({ onClose, onSave, isMobile }) {
  const [form, setForm] = useState({ donorName:"", amount:"", method:"Cash", reference:MEMBERS[0], notes:"" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState({});
  const submit = async () => {
    const e = {};
    if (!form.amount||isNaN(form.amount)||Number(form.amount)<=0) e.amount="Enter a valid amount";
    if (Object.keys(e).length) { setErr(e); return; }
    setSaving(true); await onSave(form); setSaving(false);
  };
  return (
    <Modal title="Record Donation" accent={C.green} onClose={onClose} isMobile={isMobile}>
      <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"1fr 1fr", gap:14 }}>
        <MF label="Donor Name (optional)"><input style={{ ...inp, fontSize: isMobile?16:14 }} value={form.donorName} onChange={e=>setForm({...form,donorName:e.target.value})} placeholder="Anonymous" className="rs-input" /></MF>
        <MF label="Amount (PKR) *" error={err.amount}><input style={{ ...inp, fontSize: isMobile?16:14, ...(err.amount?{borderColor:C.red}:{}) }} type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" className="rs-input" /></MF>
        <MF label="Payment Method"><select style={{ ...sel, fontSize: isMobile?16:14, width:"100%" }} value={form.method} onChange={e=>setForm({...form,method:e.target.value})} className="rs-select">{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></MF>
        <MF label="Collected By"><select style={{ ...sel, fontSize: isMobile?16:14, width:"100%" }} value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} className="rs-select">{MEMBERS.map(m=><option key={m}>{m}</option>)}</select></MF>
        <MF label="Notes" full><textarea style={{ ...inp, height:70, resize:"vertical", fontSize: isMobile?16:14 }} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional..." className="rs-input" /></MF>
      </div>
      <MFoot onClose={onClose} onSave={submit} saving={saving} label="Save Donation" accent={C.green} />
    </Modal>
  );
}

function ExpenseModal({ onClose, onSave, isMobile }) {
  const [form, setForm] = useState({ description:"", amount:"", category:"Miscellaneous", receiptFile:null });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState({});
  const handleFile = e => {
    const f = e.target.files[0]; if (!f) return;
    setForm(p=>({...p,receiptFile:f}));
    const r = new FileReader(); r.onload = ev=>setPreview(ev.target.result); r.readAsDataURL(f);
  };
  const submit = async () => {
    const e = {};
    if (!form.description.trim()) e.description="Description required";
    if (!form.amount||isNaN(form.amount)||Number(form.amount)<=0) e.amount="Enter a valid amount";
    if (Object.keys(e).length) { setErr(e); return; }
    setSaving(true); await onSave(form); setSaving(false);
  };
  return (
    <Modal title="Record Expense" accent={C.orange} onClose={onClose} isMobile={isMobile}>
      <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"1fr 1fr", gap:14 }}>
        <MF label="Description *" error={err.description} full><input style={{ ...inp, fontSize: isMobile?16:14, ...(err.description?{borderColor:C.red}:{}) }} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="What was this for?" className="rs-input" /></MF>
        <MF label="Amount (PKR) *" error={err.amount}><input style={{ ...inp, fontSize: isMobile?16:14, ...(err.amount?{borderColor:C.red}:{}) }} type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" className="rs-input" /></MF>
        <MF label="Category"><select style={{ ...sel, fontSize: isMobile?16:14, width:"100%" }} value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="rs-select">{EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></MF>
        <MF label="Receipt (optional)" full>
          <label style={{ border:`2px dashed ${C.border}`, borderRadius:10, padding:18, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", minHeight:82 }} className="rs-upload">
            {preview?<img src={preview} alt="receipt" style={{ maxHeight:90, maxWidth:"100%", borderRadius:8 }} />
              :<div style={{ textAlign:"center", color:C.textMuted }}><div style={{ fontSize:22, marginBottom:4 }}>↑</div><div style={{ fontSize:12, fontWeight:600 }}>Tap to upload receipt</div></div>}
            <input type="file" accept="image/*,application/pdf" style={{ display:"none" }} onChange={handleFile} />
          </label>
        </MF>
      </div>
      <MFoot onClose={onClose} onSave={submit} saving={saving} label="Save Expense" accent={C.orange} />
    </Modal>
  );
}

function GoalModal({ currentGoal, onClose, onSave }) {
  const [goal, setGoal] = useState(currentGoal);
  return (
    <Modal title="Set Goal" accent={C.blue} onClose={onClose}>
      <MF label="Goal Amount (PKR)"><input style={{ ...inp, fontSize:16 }} type="number" value={goal} onChange={e=>setGoal(Number(e.target.value))} className="rs-input" /></MF>
      <MFoot onClose={onClose} onSave={()=>onSave(goal)} label="Update Goal" accent={C.blue} />
    </Modal>
  );
}

function Modal({ title, accent, onClose, children, isMobile }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", display:"flex", alignItems: isMobile?"flex-end":"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(6px)" }} onClick={onClose}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderTop:`3px solid ${accent}`, borderRadius: isMobile?"20px 20px 0 0":"18px", padding: isMobile?"24px 20px 36px":"28px", width:"100%", maxWidth: isMobile?"100%":"520px", boxShadow:"0 40px 80px rgba(0,0,0,0.95)", maxHeight:"90vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h3 style={{ color:accent, fontSize:14, fontWeight:800, letterSpacing:0.5, textTransform:"uppercase" }}>{title}</h3>
          <button style={{ background:"none", border:`1px solid ${C.border}`, color:C.textMuted, width:30, height:30, borderRadius:8, cursor:"pointer", fontSize:16 }} onClick={onClose} className="rs-xbtn">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MFoot({ onClose, onSave, saving, label, accent }) {
  return (
    <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:20, borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
      <button style={btnO} onClick={onClose} className="rs-btn">Cancel</button>
      <button style={btnP(accent)} onClick={onSave} disabled={saving} className="rs-btn">{saving?"Saving…":label}</button>
    </div>
  );
}

function MF({ label, children, error, full }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5, ...(full?{gridColumn:"1 / -1"}:{}) }}>
      <label style={lbl}>{label}</label>
      {children}
      {error&&<span style={{ color:C.red, fontSize:11, fontWeight:600 }}>{error}</span>}
    </div>
  );
}

const lbl = { color:C.textMuted, fontSize:10, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase" };
const inp = { background:C.bg, border:`1px solid ${C.border}`, borderRadius:9, color:C.text, padding:"11px 14px", fontSize:14, fontFamily:"'Barlow',sans-serif", fontWeight:500, outline:"none", width:"100%", boxSizing:"border-box" };
const sel = { background:C.bg, border:`1px solid ${C.border}`, borderRadius:9, color:C.text, padding:"11px 14px", fontSize:14, fontFamily:"'Barlow',sans-serif", fontWeight:500, outline:"none", cursor:"pointer" };
const td = { padding:"13px 16px", color:C.text, fontSize:13, fontWeight:500 };
const cardT = { color:C.textMuted, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:4 };
const btnP = (bg) => ({ background:bg, color:"#fff", border:"none", borderRadius:9, padding:"11px 22px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Barlow',sans-serif" });
const btnO = { background:"none", color:C.textMuted, border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 22px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'Barlow',sans-serif" };

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:${C.bg}; -webkit-tap-highlight-color:transparent; }
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-12px)} }
  @keyframes slideIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  .bounce-dot { animation:bounce 1.2s ease infinite; }
  @keyframes float { 0%{transform:translateY(0px) translateX(0px) scale(1);opacity:var(--op,0.2)} 33%{transform:translateY(-40px) translateX(15px) scale(1.1)} 66%{transform:translateY(-20px) translateX(-10px) scale(0.9)} 100%{transform:translateY(0px) translateX(0px) scale(1);opacity:var(--op,0.2)} }
  .particle { animation:float linear infinite; will-change:transform; }
  .rs-input:focus { border-color:${C.blue} !important; box-shadow:0 0 0 2px ${C.blue}20; }
  .rs-select:focus { border-color:${C.blue} !important; }
  .rs-btn:hover { opacity:0.85; transform:translateY(-1px); transition:all 0.15s; }
  .rs-btn:active { transform:scale(0.97); }
  .rs-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
  .rs-nav:hover { background:${C.border}60 !important; color:${C.text} !important; }
  .rs-logout:hover { border-color:${C.red}50 !important; color:#E87070 !important; }
  .rs-tr:hover { background:${C.surface} !important; }
  .rs-lb:hover { transform:translateX(4px); }
  .rs-del:hover { border-color:${C.red}60 !important; color:${C.red} !important; }
  .rs-upload:hover { border-color:${C.blue} !important; }
  .rs-xbtn:hover { border-color:${C.red}60 !important; color:${C.red} !important; }
  .rs-sm-btn:hover { border-color:${C.borderHover} !important; color:${C.text} !important; }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-track { background:${C.bg}; }
  ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
`;