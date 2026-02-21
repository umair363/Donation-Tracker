import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const MEMBERS = ["Faiz", "Moeed", "Umair", "Hassan Ali", "Hassaan Tariq", "Farah", "Hamza","Member"];
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

const RS_COLORS = [C.red, C.orange, C.yellow, C.green, C.blue, C.purple];

const formatPKR = (n) => `PKR ${Number(n || 0).toLocaleString("en-PK")}`;
const fmtDate = (d) => new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });

function exportCSV(rows, filename, headers) {
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename; a.click();
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
      else { setLoginError("Invalid credentials. Try again."); return; }
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
        {RS_COLORS.map((c,i) => <div key={i} className="bounce-dot" style={{ width:11, height:11, borderRadius:"50%", background:c, animationDelay:`${i*0.1}s` }} />)}
      </div>
      <p style={{ color:C.textMuted, fontSize:12, letterSpacing:4, fontWeight:700, textTransform:"uppercase" }}>Roshan Safar</p>
      <style>{baseCss}</style>
    </div>
  );

  if (!session) return <LoginScreen form={loginForm} setForm={setLoginForm} onSubmit={handleLogin} error={loginError} />;

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, fontFamily:"'Barlow',sans-serif", color:C.text }}>
      {toast && (
        <div style={{ position:"fixed", top:20, right:20, zIndex:9999, background: toast.type==="success"?"#0A1F0A":"#1F0A0A", border:`1px solid ${toast.type==="success"?C.green:C.red}`, color:C.text, padding:"13px 20px", borderRadius:12, fontSize:13, fontWeight:600, boxShadow:"0 8px 32px rgba(0,0,0,0.7)", animation:"slideIn 0.3s ease" }}>
          {toast.type==="success"?"✓":"✗"} {toast.msg}
        </div>
      )}
      <Sidebar session={session} page={page} setPage={setPage} onLogout={handleLogout} />
      <main style={{ flex:1, overflow:"auto" }}>
        <Header session={session} page={page} onAddDonation={()=>setModal("donation")} onAddExpense={()=>setModal("expense")} />
        <div style={{ padding:"24px 28px" }}>
          {page==="dashboard" && <Dashboard totalDonations={totalDonations} totalExpenses={totalExpenses} netBalance={netBalance} goalProgress={goalProgress} goal={goal} donations={donations} expenses={expenses} memberStats={memberStats} session={session} onEditGoal={()=>setModal("goal")} />}
          {page==="donations" && <DonationsPage donations={donations} session={session} onDelete={deleteDonation} onExport={()=>exportCSV(donations.map(d=>({Date:fmtDate(d.created_at),Donor:d.donor_name||"Anonymous",Amount:d.amount,Method:d.method,Reference:d.reference,Notes:d.notes||""})),"donations.csv",["Date","Donor","Amount","Method","Reference","Notes"])} />}
          {page==="expenses" && <ExpensesPage expenses={expenses} session={session} onDelete={deleteExpense} onExport={()=>exportCSV(expenses.map(e=>({Date:fmtDate(e.created_at),Description:e.description,Category:e.category,Amount:e.amount})),"expenses.csv",["Date","Description","Category","Amount"])} />}
          {page==="leaderboard" && <LeaderboardPage memberStats={memberStats} totalDonations={totalDonations} />}
        </div>
      </main>
      {modal==="donation" && <DonationModal onClose={()=>setModal(null)} onSave={addDonation} />}
      {modal==="expense" && <ExpenseModal onClose={()=>setModal(null)} onSave={addExpense} />}
      {modal==="goal" && <GoalModal currentGoal={goal} onClose={()=>setModal(null)} onSave={updateGoal} />}
      <style>{baseCss}</style>
    </div>
  );
}

function LoginScreen({ form, setForm, onSubmit, error }) {
  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, fontFamily:"'Barlow',sans-serif" }}>
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", bottom:-150, left:"50%", transform:"translateX(-50%)", width:600, height:600, borderRadius:"50%", background:`conic-gradient(from 180deg, ${C.red}, ${C.orange}, ${C.yellow}, ${C.green}, ${C.blue}, ${C.purple}, ${C.red})`, opacity:0.07, filter:"blur(3px)" }} />
        <div style={{ position:"relative", zIndex:1, textAlign:"center", padding:40 }}>
          <div style={{ width:110, height:110, borderRadius:"50%", overflow:"hidden", background:C.surface, border:`3px solid ${C.border}`, margin:"0 auto 28px", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <img src="/logo.png" alt="Roshan Safar" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>{e.target.style.display="none"; e.target.parentElement.innerHTML=`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:conic-gradient(${C.red},${C.orange},${C.yellow},${C.green},${C.blue},${C.purple});font-size:36px;font-weight:900;color:white;font-family:Barlow,sans-serif">RS</div>`;}} />
          </div>
          <h1 style={{ fontSize:40, fontWeight:900, color:C.text, letterSpacing:-1.5, margin:"0 0 8px" }}>Roshan Safar</h1>
          <p style={{ color:C.textMuted, fontSize:14, letterSpacing:3, textTransform:"uppercase", fontWeight:700, marginBottom:32 }}>Donation Tracker</p>
          <div style={{ display:"flex", justifyContent:"center", gap:7 }}>
            {RS_COLORS.map((c,i)=><div key={i} style={{ width:32, height:5, borderRadius:99, background:c }} />)}
          </div>
        </div>
      </div>
      <div style={{ width:440, background:C.surface, borderLeft:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ width:"100%", padding:"0 48px" }}>
          <h2 style={{ fontSize:30, fontWeight:900, color:C.text, letterSpacing:-1, marginBottom:6 }}>Welcome back</h2>
          <p style={{ color:C.textMuted, fontSize:14, fontWeight:500, marginBottom:34 }}>Sign in to continue</p>
          <form onSubmit={onSubmit} style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <label style={lbl}>Username</label>
              <input style={inp} value={form.username} onChange={e=>setForm({...form,username:e.target.value})} placeholder="admin or membername" className="rs-input" />
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <label style={lbl}>Password</label>
              <input style={inp} type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="••••••••" className="rs-input" />
            </div>
            {error && <p style={{ color:C.red, fontSize:13, fontWeight:700 }}>{error}</p>}
            <button style={{ ...btnP(C.green), marginTop:4, padding:"13px" }} type="submit" className="rs-btn">Sign In →</button>
          </form>
          <p style={{ color:C.textDim, fontSize:11, marginTop:24, lineHeight:1.9, fontWeight:500 }}>
            
          </p>
        </div>
      </div>
      <style>{baseCss}</style>
    </div>
  );
}

function Sidebar({ session, page, setPage, onLogout }) {
  const nav = session.role==="admin"
    ? [["dashboard","▣","Dashboard",C.blue],["donations","◆","Donations",C.green],["expenses","◇","Expenses",C.orange],["leaderboard","▲","Leaderboard",C.yellow]]
    : [["dashboard","▣","Dashboard",C.blue],["donations","◆","My Donations",C.green],["leaderboard","▲","Leaderboard",C.yellow]];

  return (
    <aside style={{ width:230, background:C.surface, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", position:"sticky", top:0, height:"100vh" }}>
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
        <p style={{ fontSize:10, fontWeight:700, color:C.textDim, letterSpacing:2, textTransform:"uppercase", padding:"0 10px", marginBottom:8 }}>Navigation</p>
        {nav.map(([id,icon,label,color])=>{
          const active = page===id;
          return (
            <button key={id} onClick={()=>setPage(id)} className="rs-nav"
              style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 14px", borderRadius:10, border:"none", cursor:"pointer", textAlign:"left", fontFamily:"'Barlow',sans-serif", fontWeight:active?700:500, fontSize:14, transition:"all 0.15s", background:active?`${color}18`:"transparent", color:active?color:C.textMuted, borderLeft:active?`3px solid ${color}`:"3px solid transparent" }}>
              <span style={{ fontSize:12 }}>{icon}</span>{label}
            </button>
          );
        })}
      </nav>
      <div style={{ padding:"10px", borderTop:`1px solid ${C.border}` }}>
        <button onClick={onLogout} className="rs-logout"
          style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent", color:C.textMuted, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'Barlow',sans-serif", transition:"all 0.15s" }}>
          ⊗ Sign Out
        </button>
      </div>
    </aside>
  );
}

function Header({ session, page, onAddDonation, onAddExpense }) {
  const titles = { dashboard:"Dashboard", donations:session.role==="member"?"My Donations":"Donations", expenses:"Expenses", leaderboard:"Leaderboard" };
  const subs = { dashboard:"Society overview & stats", donations:"Track incoming donations", expenses:"Manage expenses", leaderboard:"Member rankings" };
  return (
    <div style={{ padding:"20px 28px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:C.surface, position:"sticky", top:0, zIndex:100 }}>
      <div>
        <h2 style={{ fontSize:21, fontWeight:800, color:C.text, margin:0, letterSpacing:-0.5 }}>{titles[page]}</h2>
        <p style={{ color:C.textMuted, fontSize:13, marginTop:2, fontWeight:500 }}>{subs[page]}</p>
      </div>
      {session.role==="admin" && (
        <div style={{ display:"flex", gap:10 }}>
          <button style={{ ...btnO, borderColor:C.orange, color:C.orange }} onClick={onAddExpense} className="rs-btn">+ Expense</button>
          <button style={btnP(C.green)} onClick={onAddDonation} className="rs-btn">+ Donation</button>
        </div>
      )}
    </div>
  );
}

function Dashboard({ totalDonations, totalExpenses, netBalance, goalProgress, goal, donations, expenses, memberStats, session, onEditGoal }) {
  const recent = [...donations.slice(0,5).map(d=>({...d,_t:"d"})), ...expenses.slice(0,3).map(e=>({...e,_t:"e"}))]
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,7);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
        {[
          { label:"Total Collected", val:formatPKR(totalDonations), sub:`${donations.length} donations`, color:C.green, icon:"💰", glow:C.green },
          { label:"Total Expenses", val:formatPKR(totalExpenses), sub:`${expenses.length} entries`, color:C.orange, icon:"🧾", glow:C.orange },
          { label:"Net Balance", val:formatPKR(netBalance), sub:"available funds", color:netBalance>=0?C.blue:C.red, icon:"◎", glow:netBalance>=0?C.blue:C.red },
          { label:"Members", val:MEMBERS.length, sub:"contributors", color:C.purple, icon:"👥", glow:C.purple },
        ].map((st,i)=>(
          <div key={st.label} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"20px", position:"relative", overflow:"hidden", animation:`fadeUp 0.4s ease ${i*0.07}s both` }}>
            <div style={{ position:"absolute", top:-20, right:-20, width:80, height:80, borderRadius:"50%", background:`${st.glow}18`, filter:"blur(18px)" }} />
            <div style={{ fontSize:22, marginBottom:12 }}>{st.icon}</div>
            <div style={{ color:C.textMuted, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:6 }}>{st.label}</div>
            <div style={{ color:st.color, fontSize:20, fontWeight:800, letterSpacing:-0.5, marginBottom:3 }}>{st.val}</div>
            <div style={{ color:C.textDim, fontSize:12, fontWeight:500 }}>{st.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:14 }}>
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"20px 22px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <p style={cardTitle}>Fundraising Goal</p>
            {session.role==="admin" && <button style={{ background:"none", border:`1px solid ${C.border}`, color:C.textMuted, borderRadius:7, padding:"5px 12px", fontSize:11, cursor:"pointer", fontFamily:"'Barlow',sans-serif", fontWeight:600 }} onClick={onEditGoal} className="rs-sm-btn">Edit</button>}
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:14 }}>
            <span style={{ fontSize:26, fontWeight:800, color:C.green, letterSpacing:-1 }}>{formatPKR(totalDonations)}</span>
            <span style={{ color:C.textDim, fontSize:14, fontWeight:600 }}>/ {formatPKR(goal)}</span>
          </div>
          <div style={{ background:C.border, borderRadius:99, height:12, overflow:"hidden", marginBottom:8 }}>
            <div style={{ height:"100%", width:`${goalProgress}%`, borderRadius:99, background:`linear-gradient(90deg,${C.red},${C.orange},${C.yellow},${C.green})`, transition:"width 1.2s cubic-bezier(.4,0,.2,1)" }} />
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:600 }}>
            <span style={{ color:C.green }}>{goalProgress.toFixed(1)}% reached</span>
            <span style={{ color:C.textMuted }}>{formatPKR(Math.max(goal-totalDonations,0))} to go</span>
          </div>
        </div>
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"20px 22px" }}>
          <p style={cardTitle}>Top Contributor</p>
          {memberStats[0]&&memberStats[0].total>0?(
            <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:12 }}>
              <span style={{ fontSize:48 }}>🏆</span>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:C.yellow, letterSpacing:-0.5 }}>{memberStats[0].name}</div>
                <div style={{ color:C.textMuted, fontSize:13, fontWeight:500, marginTop:2 }}>{memberStats[0].count} collection{memberStats[0].count!==1?"s":""}</div>
                <div style={{ color:C.text, fontSize:17, fontWeight:700, marginTop:5 }}>{formatPKR(memberStats[0].total)}</div>
              </div>
            </div>
          ):<p style={{ color:C.textDim, marginTop:16, fontSize:14 }}>No data yet</p>}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"20px 22px" }}>
          <p style={cardTitle}>Recent Activity</p>
          <div style={{ marginTop:10 }}>
            {recent.length===0?<p style={{ color:C.textDim, fontSize:14, marginTop:8 }}>No activity yet</p>:recent.map(item=>(
              <div key={item.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ width:34, height:34, borderRadius:9, background:item._t==="d"?`${C.green}18`:`${C.orange}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>{item._t==="d"?"💚":"🧡"}</div>
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
        </div>
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"20px 22px" }}>
          <p style={cardTitle}>Member Overview</p>
          <div style={{ marginTop:10 }}>
            {memberStats.map((m,i)=>{
              const col = RS_COLORS[i%RS_COLORS.length];
              return (
                <div key={m.name} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ width:22, height:22, borderRadius:6, background:`${col}20`, color:col, fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{i+1}</span>
                  <span style={{ flex:1, color:C.text, fontSize:13, fontWeight:600 }}>{m.name}</span>
                  <div style={{ width:64, background:C.border, borderRadius:99, height:5 }}>
                    <div style={{ width:`${memberStats[0].total>0?(m.total/memberStats[0].total)*100:0}%`, height:"100%", background:col, borderRadius:99, transition:"width 1s ease" }} />
                  </div>
                  <span style={{ color:C.textMuted, fontSize:12, fontWeight:600, minWidth:85, textAlign:"right" }}>{formatPKR(m.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DonationsPage({ donations, session, onDelete, onExport }) {
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
            {["Date","Donor","Amount","Method","Collected By","Notes",session.role==="admin"?"":null].filter(v=>v!==null).map(h=>(
              <th key={h} style={{ color:C.textMuted, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", padding:"13px 16px", textAlign:"left" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length===0?<tr><td colSpan={7} style={{ textAlign:"center", padding:40, color:C.textDim, fontSize:14 }}>No donations found</td></tr>
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

function ExpensesPage({ expenses, session, onDelete, onExport }) {
  const [catF, setCatF] = useState("All");
  const filtered = expenses.filter(e=>catF==="All"||e.category===catF);
  const total = filtered.reduce((s,e)=>s+Number(e.amount),0);

  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
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
            {["Date","Description","Category","Amount","Receipt",session.role==="admin"?"":null].filter(v=>v!==null).map(h=>(
              <th key={h} style={{ color:C.textMuted, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", padding:"13px 16px", textAlign:"left" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length===0?<tr><td colSpan={6} style={{ textAlign:"center", padding:40, color:C.textDim, fontSize:14 }}>No expenses found</td></tr>
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

function LeaderboardPage({ memberStats, totalDonations }) {
  const medals = ["🥇","🥈","🥉"];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, maxWidth:680 }}>
      {memberStats.map((m,i)=>{
        const pct = totalDonations>0?(m.total/totalDonations)*100:0;
        const col = RS_COLORS[i%RS_COLORS.length];
        const isFirst = i===0;
        return (
          <div key={m.name} className="rs-lb" style={{ background:isFirst?`${C.yellow}08`:C.card, border:`1px solid ${isFirst?C.yellow+"35":C.border}`, borderRadius:14, padding:"17px 22px", display:"flex", alignItems:"center", gap:16, transition:"all 0.2s" }}>
            <div style={{ fontSize:30, minWidth:44, textAlign:"center" }}>
              {medals[i]||<span style={{ color:C.textDim, fontSize:15, fontWeight:800 }}>#{i+1}</span>}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:9 }}>
                <span style={{ color:isFirst?C.yellow:C.text, fontWeight:isFirst?800:600, fontSize:isFirst?20:16, letterSpacing:-0.3 }}>{m.name}</span>
                <span style={{ color:col, fontWeight:800, fontSize:16 }}>{formatPKR(m.total)}</span>
              </div>
              <div style={{ background:C.border, borderRadius:99, height:8 }}>
                <div style={{ width:`${pct}%`, height:"100%", borderRadius:99, background:isFirst?`linear-gradient(90deg,${C.orange},${C.yellow})`:col, transition:"width 1.2s ease" }} />
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:12, fontWeight:600 }}>
                <span style={{ color:C.textMuted }}>{m.count} collection{m.count!==1?"s":""}</span>
                <span style={{ color:C.textMuted }}>{pct.toFixed(1)}% of total</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonationModal({ onClose, onSave }) {
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
    <Modal title="Record Donation" accent={C.green} onClose={onClose}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <MF label="Donor Name (optional)"><input style={inp} value={form.donorName} onChange={e=>setForm({...form,donorName:e.target.value})} placeholder="Anonymous" className="rs-input" /></MF>
        <MF label="Amount (PKR) *" error={err.amount}><input style={{ ...inp,...(err.amount?{borderColor:C.red}:{}) }} type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" className="rs-input" /></MF>
        <MF label="Payment Method"><select style={sel} value={form.method} onChange={e=>setForm({...form,method:e.target.value})} className="rs-select">{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></MF>
        <MF label="Collected By"><select style={sel} value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} className="rs-select">{MEMBERS.map(m=><option key={m}>{m}</option>)}</select></MF>
        <MF label="Notes" full><textarea style={{ ...inp, height:74, resize:"vertical" }} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional notes..." className="rs-input" /></MF>
      </div>
      <MFoot onClose={onClose} onSave={submit} saving={saving} label="Save Donation" accent={C.green} />
    </Modal>
  );
}

function ExpenseModal({ onClose, onSave }) {
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
    <Modal title="Record Expense" accent={C.orange} onClose={onClose}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <MF label="Description *" error={err.description} full><input style={{ ...inp,...(err.description?{borderColor:C.red}:{}) }} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="What was this for?" className="rs-input" /></MF>
        <MF label="Amount (PKR) *" error={err.amount}><input style={{ ...inp,...(err.amount?{borderColor:C.red}:{}) }} type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" className="rs-input" /></MF>
        <MF label="Category"><select style={sel} value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="rs-select">{EXPENSE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></MF>
        <MF label="Receipt (optional)" full>
          <label style={{ border:`2px dashed ${C.border}`, borderRadius:10, padding:18, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", minHeight:86, transition:"border-color 0.2s" }} className="rs-upload">
            {preview?<img src={preview} alt="receipt" style={{ maxHeight:90, maxWidth:"100%", borderRadius:8 }} />
              :<div style={{ textAlign:"center", color:C.textMuted }}><div style={{ fontSize:22, marginBottom:4 }}>↑</div><div style={{ fontSize:12, fontWeight:600 }}>Click to upload receipt</div></div>}
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
    <Modal title="Set Fundraising Goal" accent={C.blue} onClose={onClose}>
      <MF label="Goal Amount (PKR)"><input style={inp} type="number" value={goal} onChange={e=>setGoal(Number(e.target.value))} className="rs-input" /></MF>
      <MFoot onClose={onClose} onSave={()=>onSave(goal)} label="Update Goal" accent={C.blue} />
    </Modal>
  );
}

function Modal({ title, accent, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(6px)" }} onClick={onClose}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderTop:`3px solid ${accent}`, borderRadius:18, padding:28, width:"100%", maxWidth:520, boxShadow:"0 40px 80px rgba(0,0,0,0.95)", maxHeight:"90vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
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
    <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:22, borderTop:`1px solid ${C.border}`, paddingTop:18 }}>
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
const cardTitle = { color:C.textMuted, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:4 };
const btnP = (bg) => ({ background:bg, color:"#fff", border:"none", borderRadius:9, padding:"11px 22px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Barlow',sans-serif" });
const btnO = { background:"none", color:C.textMuted, border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 22px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'Barlow',sans-serif" };

const baseCss = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:${C.bg}; }
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-12px)} }
  @keyframes slideIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  .bounce-dot { animation:bounce 1.2s ease infinite; }
  .rs-input:focus { border-color:${C.blue} !important; box-shadow:0 0 0 2px ${C.blue}20; }
  .rs-select:focus { border-color:${C.blue} !important; }
  .rs-btn:hover { opacity:0.85; transform:translateY(-1px); transition:all 0.15s; }
  .rs-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
  .rs-nav:hover { background:${C.border}60 !important; color:${C.text} !important; }
  .rs-logout:hover { border-color:${C.red}50 !important; color:#E87070 !important; }
  .rs-tr:hover { background:${C.surface} !important; }
  .rs-lb:hover { transform:translateX(4px); }
  .rs-del:hover { border-color:${C.red}60 !important; color:${C.red} !important; }
  .rs-upload:hover { border-color:${C.blue} !important; }
  .rs-xbtn:hover { border-color:${C.red}60 !important; color:${C.red} !important; }
  .rs-sm-btn:hover { border-color:${C.borderHover} !important; color:${C.text} !important; }
  ::-webkit-scrollbar { width:5px; }
  ::-webkit-scrollbar-track { background:${C.bg}; }
  ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
`;
