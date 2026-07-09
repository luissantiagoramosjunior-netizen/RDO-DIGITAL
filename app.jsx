const { useState, useEffect, useCallback, useRef } = React;

// ---------- constants ----------

const CARGOS_PADRAO = ["Engenheiro", "Tec. Planejamento", "Supervisor", "Téc Segurança", "Gerente de Contrato", "Gerente de Obra"];
const ITENS_PADRAO = ["Automóvel de Passeio", "Automóvel Coletivo (Kombi)", "Pickape", "Ônibus - Van", "Caminhão munck", "Guindaste", "Plataforma móvel para jato"];
const GRUPOS_SERVICO = [
  "SERVIÇOS DE CANTEIRO",
  "ADMINISTRAÇÃO LOCAL DA OBRA",
  "DEMOLIÇÕES E REMOÇÕES",
  "COBERTURA",
  "INSTALAÇÃO HIDROSSANITÁRIAS",
  "REVESTIMENTO DE PISOS, PAREDES E FORROS",
  "OUTROS",
];
const DIAS_SEMANA = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ---------- Firebase setup ----------

let firebaseReady = false;
let db = null;
let firebaseError = "";

try {
  if (typeof firebaseConfig === "undefined" || firebaseConfig.apiKey === "COLE_AQUI") {
    firebaseError = "Configure o arquivo firebase-config.js com as chaves do seu projeto Firebase (veja o README.md).";
  } else {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    firebaseReady = true;
  }
} catch (e) {
  firebaseError = "Erro ao conectar ao Firebase: " + e.message;
}

async function fsListObras() {
  if (!db) return [];
  const snap = await db.collection("obras").orderBy("nome").get();
  return snap.docs.map((d) => ({ slug: d.id, ...d.data() }));
}
async function fsSaveObra(slug, nome) {
  if (!db) return false;
  try { await db.collection("obras").doc(slug).set({ nome }); return true; } catch (e) { return false; }
}
async function fsGetConfig(slug) {
  if (!db) return null;
  try {
    const doc = await db.collection("obraConfigs").doc(slug).get();
    return doc.exists ? doc.data() : null;
  } catch (e) { return null; }
}
async function fsSaveConfig(slug, config) {
  if (!db) return false;
  try { await db.collection("obraConfigs").doc(slug).set(config); return true; } catch (e) { return false; }
}
async function fsSaveEntry(id, entry) {
  if (!db) return false;
  try { await db.collection("entries").doc(id).set(entry); return true; } catch (e) { return false; }
}
async function fsDeleteEntry(id) {
  if (!db) return false;
  try { await db.collection("entries").doc(id).delete(); return true; } catch (e) { return false; }
}
async function fsSaveFoto(id, foto) {
  if (!db) return false;
  try { await db.collection("fotos").doc(id).set(foto); return true; } catch (e) { return false; }
}
async function fsListFotos(obraSlug) {
  if (!db) return [];
  try {
    const snap = await db.collection("fotos").where("obraSlug", "==", obraSlug).get();
    return snap.docs.map((d) => ({ key: d.id, ...d.data() }));
  } catch (e) { return []; }
}
async function fsDeleteFoto(id) {
  if (!db) return false;
  try { await db.collection("fotos").doc(id).delete(); return true; } catch (e) { return false; }
}
async function fsListEntries(obraSlug) {
  if (!db) return [];
  try {
    const snap = await db.collection("entries").where("obraSlug", "==", obraSlug).get();
    return snap.docs.map((d) => ({ key: d.id, ...d.data() }));
  } catch (e) { return []; }
}

// ---------- local (per-device) preferences: author name ----------
// Stored in this browser only (not shared), since it's just a convenience default.
function getAutorNomeLocal() {
  try { return localStorage.getItem("rdo-autor-nome") || ""; } catch (e) { return ""; }
}
function setAutorNomeLocal(nome) {
  try { localStorage.setItem("rdo-autor-nome", nome); } catch (e) {}
}

// ---------- helpers ----------

const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const todayISO = () => {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
};
const parseISODate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const formatDateBR = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const diaDaSemana = (iso) => {
  const d = parseISODate(iso);
  return d ? DIAS_SEMANA[d.getDay()] : "";
};
const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
};
const diasEntre = (a, b) => Math.round((b - a) / 86400000);

function calcularPrazo(dataInicioISO, prazoMeses, dataRefISO) {
  const inicio = parseISODate(dataInicioISO);
  const ref = parseISODate(dataRefISO) || new Date();
  if (!inicio || !prazoMeses) return null;
  const termino = addMonths(inicio, prazoMeses);
  const totalDias = diasEntre(inicio, termino);
  let decorridos = diasEntre(inicio, ref) + 1;
  if (decorridos < 0) decorridos = 0;
  const restantes = totalDias - decorridos;
  return { termino, totalDias, decorridos, restantes: restantes < 0 ? 0 : restantes };
}

function compressImage(file, maxWidth = 1000, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Falha ao carregar imagem"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const zeroMap = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));

function defaultObraConfig() {
  return {
    contratado: "", numeroContrato: "", dataInicio: "", prazoMeses: "",
    responsavelTecnico: { nome: "", crea: "" },
    fiscalizacao: { nome: "", crea: "" },
    efetivoPadrao: { propria: zeroMap(CARGOS_PADRAO), terceiro: zeroMap(CARGOS_PADRAO) },
    itensCatalogo: [...ITENS_PADRAO],
    servicosCatalogo: [],
    fotografico: { imovel: "", demandante: "", endereco: "", empresa: "", respTecnico: "", crea: "" },
  };
}

// ---------- style tokens (Tailwind + custom vars) ----------

const GlobalStyle = () => (
  <style>{`
    .rdo-root {
      --bg: #ECEFEE; --paper: #FFFFFF; --ink: #1B2735; --ink-soft: #526070;
      --line: #CBD3D6; --accent: #E15A25; --accent-ink: #ffffff;
      --caution: #F0AC1F; --danger: #B33B2E; --success: #2E7D4F;
      font-family: 'IBM Plex Sans', sans-serif; color: var(--ink); background: var(--bg);
      background-image: linear-gradient(rgba(120,140,150,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120,140,150,0.08) 1px, transparent 1px);
      background-size: 28px 28px; min-height: 100vh;
    }
    .rdo-root .display { font-family: 'Oswald', sans-serif; letter-spacing: 0.01em; }
    .rdo-root .mono { font-family: 'IBM Plex Mono', monospace; }
    .rdo-card { background: var(--paper); border: 1px solid var(--line); position: relative; }
    .rdo-card::before { content: ""; position: absolute; top: 0; left: 0; width: 14px; height: 14px; border-top: 2px solid var(--accent); border-left: 2px solid var(--accent); }
    .rdo-card::after { content: ""; position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; border-bottom: 2px solid var(--accent); border-right: 2px solid var(--accent); }
    .rdo-stamp { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; border: 2px solid var(--ink); color: var(--ink); padding: 4px 10px; transform: rotate(-2deg); line-height: 1.05; }
    .rdo-btn-primary { background: var(--accent); color: var(--accent-ink); font-weight: 600; border: none; transition: filter 0.15s ease; }
    .rdo-btn-primary:hover { filter: brightness(1.08); }
    .rdo-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
    .rdo-btn-outline { background: transparent; border: 1px solid var(--ink); color: var(--ink); }
    .rdo-btn-outline:hover { background: rgba(27,39,53,0.06); }
    .rdo-seg { background: transparent; border: 1px solid var(--line); color: var(--ink-soft); font-size: 0.75rem; padding: 5px 10px; }
    .rdo-seg.active { background: var(--ink); color: white; border-color: var(--ink); }
    .rdo-input { border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
    .rdo-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(225,90,37,0.18); }
    .rdo-tab { font-family: 'Oswald', sans-serif; letter-spacing: 0.03em; color: var(--ink-soft); border-bottom: 3px solid transparent; white-space: nowrap; }
    .rdo-tab.active { color: var(--ink); border-bottom-color: var(--accent); }
    .rdo-section-title { font-family: 'Oswald', sans-serif; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); border-bottom: 1px solid var(--line); padding-bottom: 4px; margin-bottom: 10px; }
    .rdo-spin { display: inline-block; width: 13px; height: 13px; border: 2px solid rgba(0,0,0,0.15); border-top-color: currentColor; border-radius: 50%; animation: rdospin 0.7s linear infinite; }
    @keyframes rdospin { to { transform: rotate(360deg); } }
    @media print {
      .no-print { display: none !important; }
      .rdo-root { background-image: none; background: white; }
      .print-page { break-inside: avoid; page-break-after: always; }
    }
  `}</style>
);

function Spin() { return <span className="rdo-spin" />; }

function Field({ label, icon, children, hint }) {
  return (
    <div className="mb-4">
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--ink-soft)" }}>
        {icon && <span>{icon}</span>}{label}
      </label>
      {children}
      {hint && <div className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>{hint}</div>}
    </div>
  );
}
function SectionTitle({ children }) { return <div className="rdo-section-title">{children}</div>; }
function EmptyState({ title, subtitle }) {
  return (
    <div className="text-center py-14 px-4">
      <div className="mono text-xs uppercase tracking-widest mb-2" style={{ color: "var(--ink-soft)" }}>{title}</div>
      <div className="text-sm" style={{ color: "var(--ink-soft)" }}>{subtitle}</div>
    </div>
  );
}

// ---------- main app ----------

function RdoDigital() {
  const [obras, setObras] = useState([]);
  const [selectedObra, setSelectedObra] = useState("");
  const [obrasLoaded, setObrasLoaded] = useState(false);
  const [novaObraNome, setNovaObraNome] = useState("");
  const [showNovaObra, setShowNovaObra] = useState(false);

  const [obraConfig, setObraConfig] = useState(defaultObraConfig());
  const [configLoaded, setConfigLoaded] = useState(false);

  const [autorNome, setAutorNome] = useState("");
  const [activeTab, setActiveTab] = useState("novo");

  useEffect(() => {
    setAutorNome(getAutorNomeLocal());
    (async () => {
      const list = await fsListObras();
      setObras(list);
      if (list.length > 0) setSelectedObra(list[0].slug);
      setObrasLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!selectedObra) return;
    setConfigLoaded(false);
    (async () => {
      const base = defaultObraConfig();
      const parsed = await fsGetConfig(selectedObra);
      if (parsed) {
        setObraConfig({
          ...base, ...parsed,
          responsavelTecnico: { ...base.responsavelTecnico, ...(parsed.responsavelTecnico || {}) },
          fiscalizacao: { ...base.fiscalizacao, ...(parsed.fiscalizacao || {}) },
          efetivoPadrao: {
            propria: { ...base.efetivoPadrao.propria, ...(parsed.efetivoPadrao?.propria || {}) },
            terceiro: { ...base.efetivoPadrao.terceiro, ...(parsed.efetivoPadrao?.terceiro || {}) },
          },
          itensCatalogo: parsed.itensCatalogo?.length ? parsed.itensCatalogo : base.itensCatalogo,
          servicosCatalogo: parsed.servicosCatalogo?.length ? parsed.servicosCatalogo : base.servicosCatalogo,
          fotografico: { ...base.fotografico, ...(parsed.fotografico || {}) },
        });
      } else {
        setObraConfig(base);
      }
      setConfigLoaded(true);
    })();
  }, [selectedObra]);

  const persistAutorNome = (nome) => { setAutorNome(nome); setAutorNomeLocal(nome); };

  const saveObraConfig = async (novaConfig) => {
    setObraConfig(novaConfig);
    await fsSaveConfig(selectedObra, novaConfig);
  };

  const addObra = async () => {
    const nome = novaObraNome.trim();
    if (!nome) return;
    const slug = slugify(nome);
    if (!obras.some((o) => o.slug === slug)) {
      const novaLista = [...obras, { slug, nome }];
      setObras(novaLista);
      await fsSaveObra(slug, nome);
    }
    setSelectedObra(slug);
    setNovaObraNome("");
    setShowNovaObra(false);
  };

  const obraAtual = obras.find((o) => o.slug === selectedObra);

  if (!firebaseReady) {
    return (
      <div className="rdo-root w-full min-h-screen flex items-center justify-center p-6">
        <GlobalStyle />
        <div className="rdo-card p-6 max-w-md">
          <div className="display text-lg font-bold mb-2">Configuração pendente</div>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{firebaseError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rdo-root w-full min-h-screen">
      <GlobalStyle />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Header
          obras={obras} selectedObra={selectedObra} setSelectedObra={setSelectedObra}
          showNovaObra={showNovaObra} setShowNovaObra={setShowNovaObra}
          novaObraNome={novaObraNome} setNovaObraNome={setNovaObraNome}
          addObra={addObra} obrasLoaded={obrasLoaded}
        />

        {!obraAtual && obrasLoaded && (
          <div className="rdo-card p-8 mt-4">
            <EmptyState title="Nenhuma obra cadastrada" subtitle='Cadastre uma obra acima em "Nova obra" para começar a registrar o RDO.' />
          </div>
        )}

        {obraAtual && (
          <>
            <nav className="no-print flex gap-5 border-b mt-5 mb-6 overflow-x-auto" style={{ borderColor: "var(--line)" }}>
              <TabButton label="Registrar" emoji="📋" active={activeTab === "novo"} onClick={() => setActiveTab("novo")} />
              <TabButton label="Histórico" emoji="☑" active={activeTab === "historico"} onClick={() => setActiveTab("historico")} />
              <TabButton label="Relatório mensal" emoji="📄" active={activeTab === "relatorio"} onClick={() => setActiveTab("relatorio")} />
              <TabButton label="Rel. fotográfico" emoji="📷" active={activeTab === "fotografico"} onClick={() => setActiveTab("fotografico")} />
              <TabButton label="Dados do contrato" emoji="⚙" active={activeTab === "contrato"} onClick={() => setActiveTab("contrato")} />
            </nav>

            {activeTab === "novo" && configLoaded && (
              <NovoRegistro obra={obraAtual} obraConfig={obraConfig} autorNome={autorNome} setAutorNome={persistAutorNome} />
            )}
            {activeTab === "historico" && <Historico obra={obraAtual} />}
            {activeTab === "relatorio" && <RelatorioMensal obra={obraAtual} obraConfig={obraConfig} />}
            {activeTab === "fotografico" && configLoaded && <RelatorioFotografico obra={obraAtual} obraConfig={obraConfig} />}
            {activeTab === "contrato" && configLoaded && (
              <DadosContrato obraConfig={obraConfig} saveObraConfig={saveObraConfig} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({ label, emoji, active, onClick }) {
  return (
    <button onClick={onClick} className={`rdo-tab flex items-center gap-1.5 pb-2.5 pt-1 text-sm ${active ? "active" : ""}`}>
      <span>{emoji}</span>{label}
    </button>
  );
}

function Header({ obras, selectedObra, setSelectedObra, showNovaObra, setShowNovaObra, novaObraNome, setNovaObraNome, addObra, obrasLoaded }) {
  return (
    <header className="no-print">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="display text-2xl font-bold leading-none">RDO DIGITAL</div>
          <div className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Relatório Diário de Obra · registro de campo e consolidação mensal</div>
        </div>
        <div className="rdo-stamp mono text-[10px]"><span>REGISTRO</span><span>DE OBRA</span></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span>🏗</span>
        {obrasLoaded && obras.length > 0 && (
          <select value={selectedObra} onChange={(e) => setSelectedObra(e.target.value)} className="rdo-input text-sm px-2.5 py-1.5">
            {obras.map((o) => <option key={o.slug} value={o.slug}>{o.nome}</option>)}
          </select>
        )}
        {!showNovaObra && (
          <button onClick={() => setShowNovaObra(true)} className="rdo-btn-outline text-xs px-2.5 py-1.5">+ Nova obra</button>
        )}
        {showNovaObra && (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={novaObraNome} onChange={(e) => setNovaObraNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addObra()} placeholder="Nome da obra" className="rdo-input text-sm px-2.5 py-1.5" />
            <button onClick={addObra} className="rdo-btn-primary text-xs px-2.5 py-1.5">Salvar</button>
            <button onClick={() => { setShowNovaObra(false); setNovaObraNome(""); }} className="rdo-btn-outline text-xs px-2 py-1.5">✕</button>
          </div>
        )}
      </div>
    </header>
  );
}

// ---------- Dados do Contrato ----------

function DadosContrato({ obraConfig, saveObraConfig }) {
  const [form, setForm] = useState(obraConfig);
  const [servicosTexto, setServicosTexto] = useState((obraConfig.servicosCatalogo || []).join("\n"));
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    setForm(obraConfig);
    setServicosTexto((obraConfig.servicosCatalogo || []).join("\n"));
  }, [obraConfig]);

  const upd = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const updPessoa = (grupo, field, value) => setForm((f) => ({ ...f, [grupo]: { ...f[grupo], [field]: value } }));
  const updEfetivo = (tipo, cargo, value) => setForm((f) => ({ ...f, efetivoPadrao: { ...f.efetivoPadrao, [tipo]: { ...f.efetivoPadrao[tipo], [cargo]: Number(value) || 0 } } }));
  const updFoto = (campo, value) => setForm((f) => ({ ...f, fotografico: { ...(f.fotografico || {}), [campo]: value } }));

  const prazo = form.dataInicio && form.prazoMeses ? calcularPrazo(form.dataInicio, form.prazoMeses, todayISO()) : null;

  const salvar = async () => {
    setSalvando(true);
    const servicosCatalogo = servicosTexto.split("\n").map((s) => s.trim()).filter(Boolean);
    const novaConfig = { ...form, servicosCatalogo };
    await saveObraConfig(novaConfig);
    setSalvando(false);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  };

  return (
    <div className="rdo-card p-5 sm:p-6">
      <SectionTitle>Contrato</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Contratado (empresa)"><input value={form.contratado} onChange={(e) => upd("contratado", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" /></Field>
        <Field label="Número do contrato"><input value={form.numeroContrato} onChange={(e) => upd("numeroContrato", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" /></Field>
        <Field label="Data de início do contrato"><input type="date" value={form.dataInicio} onChange={(e) => upd("dataInicio", e.target.value)} className="rdo-input px-3 py-2 text-sm mono" /></Field>
        <Field label="Prazo contratual (meses)"><input type="number" min="0" value={form.prazoMeses} onChange={(e) => upd("prazoMeses", e.target.value)} className="rdo-input px-3 py-2 text-sm w-28" /></Field>
      </div>
      {prazo && (
        <div className="text-xs mb-4 px-3 py-2 mono" style={{ background: "var(--bg)" }}>
          Término previsto: {formatDateBR(prazo.termino.toISOString().slice(0,10))} · Prazo total: {prazo.totalDias} dias · Hoje: {prazo.decorridos}º dia decorrido, {prazo.restantes} dias restantes
        </div>
      )}

      <SectionTitle>Responsável técnico (contratada)</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Nome"><input value={form.responsavelTecnico.nome} onChange={(e) => updPessoa("responsavelTecnico", "nome", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" /></Field>
        <Field label="CREA"><input value={form.responsavelTecnico.crea} onChange={(e) => updPessoa("responsavelTecnico", "crea", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" placeholder="CREA nº" /></Field>
      </div>

      <SectionTitle>Fiscalização (contratante)</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Nome"><input value={form.fiscalizacao.nome} onChange={(e) => updPessoa("fiscalizacao", "nome", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" /></Field>
        <Field label="CREA"><input value={form.fiscalizacao.crea} onChange={(e) => updPessoa("fiscalizacao", "crea", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" placeholder="CREA nº" /></Field>
      </div>

      <SectionTitle>Efetivo padrão (pré-preenche cada RDO, você ajusta no dia se mudar)</SectionTitle>
      <div className="overflow-x-auto mb-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--ink-soft)" }}>
              <th className="font-medium pb-1.5 text-xs uppercase tracking-wide">Cargo</th>
              <th className="font-medium pb-1.5 text-xs uppercase tracking-wide w-28">Equipe própria</th>
              <th className="font-medium pb-1.5 text-xs uppercase tracking-wide w-28">Equipe terceira</th>
            </tr>
          </thead>
          <tbody>
            {CARGOS_PADRAO.map((cargo) => (
              <tr key={cargo} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="py-1.5">{cargo}</td>
                <td className="py-1.5"><input type="number" min="0" value={form.efetivoPadrao.propria[cargo] ?? 0} onChange={(e) => updEfetivo("propria", cargo, e.target.value)} className="rdo-input w-16 px-2 py-1 text-sm" /></td>
                <td className="py-1.5"><input type="number" min="0" value={form.efetivoPadrao.terceiro[cargo] ?? 0} onChange={(e) => updEfetivo("terceiro", cargo, e.target.value)} className="rdo-input w-16 px-2 py-1 text-sm" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Lista padrão de serviços executados</SectionTitle>
      <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>Um serviço por linha. Essa lista aparece como checklist na hora de registrar o RDO do dia, pra marcar em vez de digitar.</p>
      <textarea
        value={servicosTexto}
        onChange={(e) => setServicosTexto(e.target.value)}
        rows={8}
        placeholder={"Ex:\nAssentamento de piso cerâmico\nAplicação de massa corrida\nInstalação de louças e metais"}
        className="rdo-input w-full px-3 py-2 text-sm mb-5 mono"
      />

      <SectionTitle>Dados do relatório fotográfico (cabeçalho)</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Imóvel público"><input value={form.fotografico?.imovel || ""} onChange={(e) => updFoto("imovel", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" /></Field>
        <Field label="Demandante (Secretaria)"><input value={form.fotografico?.demandante || ""} onChange={(e) => updFoto("demandante", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" /></Field>
        <Field label="Endereço"><input value={form.fotografico?.endereco || ""} onChange={(e) => updFoto("endereco", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" /></Field>
        <Field label="Empresa contratada"><input value={form.fotografico?.empresa || ""} onChange={(e) => updFoto("empresa", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" /></Field>
        <Field label="Responsável técnico"><input value={form.fotografico?.respTecnico || ""} onChange={(e) => updFoto("respTecnico", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" /></Field>
        <Field label="CREA (resp. técnico)"><input value={form.fotografico?.crea || ""} onChange={(e) => updFoto("crea", e.target.value)} className="rdo-input w-full px-3 py-2 text-sm" /></Field>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button onClick={salvar} disabled={salvando} className="rdo-btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          {salvando && <Spin />} Salvar dados do contrato
        </button>
        {salvo && <span className="text-xs font-semibold" style={{ color: "var(--success)" }}>Salvo ✓</span>}
      </div>
    </div>
  );
}

function ChecklistServicos({ catalogo, itensSelecionados, onToggle }) {
  const [busca, setBusca] = useState("");
  const buscaLower = busca.toLowerCase();
  const filtrados = catalogo.filter((s) => itensSelecionados.includes(s) || s.toLowerCase().includes(buscaLower));

  return (
    <div className="mt-2.5 p-2.5" style={{ background: "var(--bg)" }}>
      <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>Marcar da lista padrão:</div>
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar serviço..."
        className="rdo-input w-full px-2.5 py-1.5 text-sm mb-2"
      />
      <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
        {filtrados.length === 0 && <div className="text-xs py-1" style={{ color: "var(--ink-soft)" }}>Nenhum serviço encontrado.</div>}
        {filtrados.map((servico) => (
          <label key={servico} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={itensSelecionados.includes(servico)} onChange={() => onToggle(servico)} />
            {servico}
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------- Novo Registro ----------

function NovoRegistro({ obra, obraConfig, autorNome, setAutorNome }) {
  const [data, setData] = useState(todayISO());
  const [locais, setLocais] = useState([{ local: "", itens: [""] }]);
  const [obsFiscalizacao, setObsFiscalizacao] = useState("");
  const [efetivo, setEfetivo] = useState({ propria: { ...obraConfig.efetivoPadrao.propria }, terceiro: { ...obraConfig.efetivoPadrao.terceiro } });
  const [ocorrencias, setOcorrencias] = useState("");
  const [materialRecebido, setMaterialRecebido] = useState(zeroMap(obraConfig.itensCatalogo));
  const [equipamentos, setEquipamentos] = useState(zeroMap(obraConfig.itensCatalogo));
  const [clima, setClima] = useState({ temperatura: "", condicao: "Bom", umidade: "" });
  const [fotos, setFotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState("");
  const cameraInputRef = useRef(null);
  const galeriaInputRef = useRef(null);

  useEffect(() => {
    setEfetivo({ propria: { ...obraConfig.efetivoPadrao.propria }, terceiro: { ...obraConfig.efetivoPadrao.terceiro } });
    setMaterialRecebido(zeroMap(obraConfig.itensCatalogo));
    setEquipamentos(zeroMap(obraConfig.itensCatalogo));
  }, [obra.slug]);

  const updLocal = (i, value) => setLocais((prev) => prev.map((l, idx) => (idx === i ? { ...l, local: value } : l)));
  const updItem = (li, ii, value) => setLocais((prev) => prev.map((l, idx) => (idx === li ? { ...l, itens: l.itens.map((it, iidx) => (iidx === ii ? value : it)) } : l)));
  const addItem = (li) => setLocais((prev) => prev.map((l, idx) => (idx === li ? { ...l, itens: [...l.itens, ""] } : l)));
  const removeItem = (li, ii) => setLocais((prev) => prev.map((l, idx) => (idx === li ? { ...l, itens: l.itens.filter((_, iidx) => iidx !== ii) } : l)));
  const addLocal = () => setLocais((prev) => [...prev, { local: "", itens: [""] }]);
  const removeLocal = (i) => setLocais((prev) => prev.filter((_, idx) => idx !== i));

  const toggleServicoCatalogo = (li, servico) => {
    setLocais((prev) => prev.map((l, idx) => {
      if (idx !== li) return l;
      const semVazios = l.itens.filter((it) => it.trim().length > 0);
      const jaTem = semVazios.includes(servico);
      const novosItens = jaTem ? semVazios.filter((it) => it !== servico) : [...semVazios, servico];
      return { ...l, itens: novosItens.length > 0 ? novosItens : [""] };
    }));
  };

  const updEfetivo = (tipo, cargo, value) => setEfetivo((prev) => ({ ...prev, [tipo]: { ...prev[tipo], [cargo]: Number(value) || 0 } }));
  const updCatalogo = (setter, item, value) => setter((prev) => ({ ...prev, [item]: Number(value) || 0 }));

  const handleFotos = async (e) => {
    const files = Array.from(e.target.files || []);
    const inputEl = e.target;
    if (files.length === 0) return;
    setCompressing(true); setErro("");
    try {
      const novas = [];
      for (const file of files) {
        const dataUrl = await compressImage(file);
        novas.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, dataUrl });
      }
      setFotos((prev) => [...prev, ...novas]);
    } catch (e) { setErro("Não foi possível processar uma das fotos. Tente novamente."); }
    setCompressing(false);
    if (inputEl) inputEl.value = "";
  };
  const removeFoto = (id) => setFotos((prev) => prev.filter((f) => f.id !== id));

  const resetForm = () => {
    setData(todayISO());
    setLocais([{ local: "", itens: [""] }]);
    setObsFiscalizacao("");
    setEfetivo({ propria: { ...obraConfig.efetivoPadrao.propria }, terceiro: { ...obraConfig.efetivoPadrao.terceiro } });
    setOcorrencias("");
    setMaterialRecebido(zeroMap(obraConfig.itensCatalogo));
    setEquipamentos(zeroMap(obraConfig.itensCatalogo));
    setClima({ temperatura: "", condicao: "Bom", umidade: "" });
    setFotos([]);
  };

  const podeSalvar = autorNome.trim().length > 0 && data && locais.some((l) => l.itens.some((it) => it.trim().length > 0));

  const salvar = async () => {
    if (!podeSalvar) return;
    setSaving(true); setErro("");
    const prazo = obraConfig.dataInicio && obraConfig.prazoMeses ? calcularPrazo(obraConfig.dataInicio, obraConfig.prazoMeses, data) : null;
    const entry = {
      data, diaSemana: diaDaSemana(data),
      obraSlug: obra.slug, obraNome: obra.nome,
      contratado: obraConfig.contratado, numeroContrato: obraConfig.numeroContrato,
      diasDecorridos: prazo?.decorridos ?? null, diasRestantes: prazo?.restantes ?? null,
      autor: autorNome.trim(),
      locais: locais.map((l) => ({ local: l.local.trim(), itens: l.itens.map((i) => i.trim()).filter(Boolean) })).filter((l) => l.itens.length > 0),
      obsFiscalizacao: obsFiscalizacao.trim(),
      efetivo, ocorrencias: ocorrencias.trim(),
      materialRecebido, equipamentos, clima,
      responsavelTecnico: obraConfig.responsavelTecnico, fiscalizacaoResp: obraConfig.fiscalizacao,
      fotos: fotos.map((f) => f.dataUrl),
      criadoEm: new Date().toISOString(),
    };
    const id = `${obra.slug}__${data}__${Date.now()}`;
    const ok = await fsSaveEntry(id, entry);
    setSaving(false);
    if (ok) { setSaved(true); resetForm(); setTimeout(() => setSaved(false), 3000); }
    else setErro("Não foi possível salvar o registro. Verifique sua conexão com a internet e se o Firebase está configurado corretamente.");
  };

  return (
    <div className="rdo-card p-5 sm:p-6">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Responsável pelo registro" icon="👤">
          <input value={autorNome} onChange={(e) => setAutorNome(e.target.value)} placeholder="Seu nome" className="rdo-input w-full px-3 py-2 text-sm" />
        </Field>
        <Field label="Data" icon="📅" hint={data ? diaDaSemana(data) : ""}>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="rdo-input px-3 py-2 text-sm mono" />
        </Field>
      </div>

      <SectionTitle>Serviços executados por local</SectionTitle>
      <div className="space-y-4 mb-2">
        {locais.map((l, li) => (
          <div key={li} className="pl-3 border-l-2" style={{ borderColor: "var(--accent)" }}>
            <div className="flex gap-2 items-center mb-2">
              <input value={l.local} onChange={(e) => updLocal(li, e.target.value)} placeholder="LOCAL (ex: WC FEMININO)" className="rdo-input flex-1 px-3 py-1.5 text-sm font-medium uppercase" />
              {locais.length > 1 && <button onClick={() => removeLocal(li)} className="rdo-btn-outline px-2 py-1.5">🗑</button>}
            </div>
            <div className="space-y-1.5">
              {l.itens.map((item, ii) => (
                <div key={ii} className="flex gap-2 items-center">
                  <input value={item} onChange={(e) => updItem(li, ii, e.target.value)} placeholder="Serviço executado" className="rdo-input flex-1 px-3 py-1.5 text-sm" />
                  {l.itens.length > 1 && <button onClick={() => removeItem(li, ii)} className="rdo-btn-outline px-2 py-1.5">✕</button>}
                </div>
              ))}
            </div>
            <button onClick={() => addItem(li)} className="mt-1.5 text-xs font-semibold" style={{ color: "var(--accent)" }}>+ Adicionar serviço</button>

            {obraConfig.servicosCatalogo?.length > 0 && (
              <ChecklistServicos
                catalogo={obraConfig.servicosCatalogo}
                itensSelecionados={l.itens}
                onToggle={(servico) => toggleServicoCatalogo(li, servico)}
              />
            )}
          </div>
        ))}
      </div>
      <button onClick={addLocal} className="mb-5 text-xs font-semibold">+ Adicionar local</button>

      <SectionTitle>Observações da fiscalização</SectionTitle>
      <textarea value={obsFiscalizacao} onChange={(e) => setObsFiscalizacao(e.target.value)} rows={2} placeholder="Preencha se houver observação da fiscalização" className="rdo-input w-full px-3 py-2 text-sm mb-5" />

      <SectionTitle>Efetivo do dia</SectionTitle>
      <div className="overflow-x-auto mb-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--ink-soft)" }}>
              <th className="font-medium pb-1.5 text-xs uppercase tracking-wide">Cargo</th>
              <th className="font-medium pb-1.5 text-xs uppercase tracking-wide w-24">Própria</th>
              <th className="font-medium pb-1.5 text-xs uppercase tracking-wide w-24">Terceiro</th>
            </tr>
          </thead>
          <tbody>
            {CARGOS_PADRAO.map((cargo) => (
              <tr key={cargo} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="py-1">{cargo}</td>
                <td className="py-1"><input type="number" min="0" value={efetivo.propria[cargo] ?? 0} onChange={(e) => updEfetivo("propria", cargo, e.target.value)} className="rdo-input w-16 px-2 py-1 text-sm" /></td>
                <td className="py-1"><input type="number" min="0" value={efetivo.terceiro[cargo] ?? 0} onChange={(e) => updEfetivo("terceiro", cargo, e.target.value)} className="rdo-input w-16 px-2 py-1 text-sm" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Ocorrências</SectionTitle>
      <textarea value={ocorrencias} onChange={(e) => setOcorrencias(e.target.value)} rows={2} placeholder="Ex: chuva interrompeu concretagem às 14h; falta de material X..." className="rdo-input w-full px-3 py-2 text-sm mb-5" />

      <SectionTitle>Material recebido e equipamentos</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div>
          <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>🚚 Material recebido</div>
          {obraConfig.itensCatalogo.map((item) => (
            <div key={item} className="flex items-center justify-between gap-2 py-0.5 text-sm">
              <span>{item}</span>
              <input type="number" min="0" value={materialRecebido[item] ?? 0} onChange={(e) => updCatalogo(setMaterialRecebido, item, e.target.value)} className="rdo-input w-14 px-2 py-1 text-sm" />
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>🚚 Equipamentos em obra</div>
          {obraConfig.itensCatalogo.map((item) => (
            <div key={item} className="flex items-center justify-between gap-2 py-0.5 text-sm">
              <span>{item}</span>
              <input type="number" min="0" value={equipamentos[item] ?? 0} onChange={(e) => updCatalogo(setEquipamentos, item, e.target.value)} className="rdo-input w-14 px-2 py-1 text-sm" />
            </div>
          ))}
        </div>
      </div>

      <SectionTitle>Clima</SectionTitle>
      <div className="flex flex-wrap gap-4 items-end mb-5">
        <Field label="Temperatura (°C)" icon="🌡">
          <input value={clima.temperatura} onChange={(e) => setClima((c) => ({ ...c, temperatura: e.target.value }))} className="rdo-input w-24 px-3 py-2 text-sm" />
        </Field>
        <Field label="Umidade relativa (%)" icon="💧">
          <input value={clima.umidade} onChange={(e) => setClima((c) => ({ ...c, umidade: e.target.value }))} className="rdo-input w-24 px-3 py-2 text-sm" />
        </Field>
        <Field label="Condição">
          <div className="flex gap-1.5">
            {["Bom", "Chuva", "Instável"].map((c) => (
              <button key={c} onClick={() => setClima((cl) => ({ ...cl, condicao: c }))} className={`rdo-seg ${clima.condicao === c ? "active" : ""}`}>{c}</button>
            ))}
          </div>
        </Field>
      </div>

      <SectionTitle>Fotos</SectionTitle>
      <div className="mb-5">
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFotos} className="hidden" />
        <input ref={galeriaInputRef} type="file" accept="image/*" multiple onChange={handleFotos} className="hidden" />
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => cameraInputRef.current?.click()} className="rdo-btn-primary text-sm px-3.5 py-2">📷 Tirar foto</button>
          <button type="button" onClick={() => galeriaInputRef.current?.click()} className="rdo-btn-outline text-sm px-3.5 py-2">Escolher da galeria</button>
        </div>
        {compressing && <div className="flex items-center gap-1.5 text-xs mt-2" style={{ color: "var(--ink-soft)" }}><Spin /> Processando fotos...</div>}
        {fotos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
            {fotos.map((f) => (
              <div key={f.id} className="relative">
                <img src={f.dataUrl} alt="" className="w-full h-20 object-cover border" style={{ borderColor: "var(--line)" }} />
                <button onClick={() => removeFoto(f.id)} className="absolute -top-1.5 -right-1.5 bg-white border rounded-full px-1" style={{ borderColor: "var(--line)" }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {erro && <div className="text-xs mb-3 px-3 py-2" style={{ background: "rgba(179,59,46,0.08)", color: "var(--danger)" }}>{erro}</div>}

      <div className="flex items-center gap-3 mt-2">
        <button onClick={salvar} disabled={!podeSalvar || saving} className="rdo-btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
          {saving && <Spin />} Salvar registro do dia
        </button>
        {saved && <span className="text-xs font-semibold" style={{ color: "var(--success)" }}>Registro salvo ✓</span>}
      </div>
      {!podeSalvar && <div className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>Preencha seu nome e ao menos um serviço executado para salvar.</div>}
    </div>
  );
}

// ---------- Histórico ----------

function useEntries(obra, monthFilter) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!obra) return;
    setLoading(true);
    const all = await fsListEntries(obra.slug);
    const filtered = monthFilter ? all.filter((e) => e.data?.slice(0, 7) === monthFilter) : all;
    filtered.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : (a.criadoEm < b.criadoEm ? 1 : -1)));
    setEntries(filtered);
    setLoading(false);
  }, [obra, monthFilter]);

  useEffect(() => { reload(); }, [reload]);
  return { entries, loading, reload };
}

function Historico({ obra }) {
  const [mesFiltro, setMesFiltro] = useState("");
  const { entries, loading, reload } = useEntries(obra, mesFiltro);
  const [expandido, setExpandido] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [confirmando, setConfirmando] = useState(null);

  const excluirRegistro = async (key) => {
    setExcluindo(key);
    const ok = await fsDeleteEntry(key);
    setExcluindo(null);
    setConfirmando(null);
    if (ok) {
      if (expandido === key) setExpandido(null);
      reload();
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="rdo-input px-3 py-2 text-sm mono" />
        {mesFiltro && <button onClick={() => setMesFiltro("")} className="text-xs" style={{ color: "var(--ink-soft)" }}>Limpar filtro</button>}
      </div>
      {loading && <div className="flex items-center gap-2 text-sm py-8 justify-center" style={{ color: "var(--ink-soft)" }}><Spin /> Carregando registros...</div>}
      {!loading && entries.length === 0 && <div className="rdo-card p-8"><EmptyState title="Sem registros" subtitle="Ainda não há registros de RDO para essa obra/período." /></div>}
      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.key} className="rdo-card">
            <button onClick={() => setExpandido(expandido === entry.key ? null : entry.key)} className="w-full flex items-center justify-between p-4 text-left">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="mono text-sm font-semibold px-2 py-1" style={{ background: "var(--bg)" }}>{formatDateBR(entry.data)}</span>
                <span className="text-sm" style={{ color: "var(--ink-soft)" }}>{entry.autor}</span>
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{entry.locais?.length || 0} local(is) · {entry.fotos?.length || 0} fotos</span>
              </div>
              <span>{expandido === entry.key ? "▾" : "▸"}</span>
            </button>
            {expandido === entry.key && (
              <div className="px-4 pb-4">
                <EntryDetail entry={entry} />
                <div className="mt-4 pt-3 border-t flex items-center gap-3" style={{ borderColor: "var(--line)" }}>
                  {confirmando !== entry.key && (
                    <button
                      onClick={() => setConfirmando(entry.key)}
                      className="text-xs font-semibold flex items-center gap-1"
                      style={{ color: "var(--danger)" }}
                    >
                      🗑 Excluir registro
                    </button>
                  )}
                  {confirmando === entry.key && (
                    <>
                      <span className="text-xs" style={{ color: "var(--danger)" }}>Excluir este registro para todos da equipe? Não é possível desfazer.</span>
                      <button
                        onClick={() => excluirRegistro(entry.key)}
                        disabled={excluindo === entry.key}
                        className="text-xs font-semibold px-2.5 py-1"
                        style={{ background: "var(--danger)", color: "white" }}
                      >
                        {excluindo === entry.key ? "Excluindo..." : "Sim, excluir"}
                      </button>
                      <button onClick={() => setConfirmando(null)} className="rdo-btn-outline text-xs px-2.5 py-1">Cancelar</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function condicaoIcon(condicao) {
  if (condicao === "Chuva") return "🌧";
  if (condicao === "Instável") return "💨";
  return "☀";
}

function EntryDetail({ entry }) {
  const efetivoTotal = (obj) => Object.values(obj || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const itensAtivos = (obj) => Object.entries(obj || {}).filter(([, v]) => Number(v) > 0);

  return (
    <div className="border-t pt-3 space-y-4" style={{ borderColor: "var(--line)" }}>
      {entry.locais?.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--ink-soft)" }}>Serviços executados</div>
          {entry.locais.map((l, i) => (
            <div key={i} className="mb-1.5">
              {l.local && <div className="text-xs font-semibold">📍 {l.local}</div>}
              <ul className="text-sm ml-4 list-disc">{l.itens.map((it, ii) => <li key={ii}>{it}</li>)}</ul>
            </div>
          ))}
        </div>
      )}
      {entry.obsFiscalizacao && (
        <div><div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--ink-soft)" }}>Observações da fiscalização</div><p className="text-sm">{entry.obsFiscalizacao}</p></div>
      )}
      {entry.ocorrencias && (
        <div><div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--danger)" }}>Ocorrências</div><p className="text-sm">{entry.ocorrencias}</p></div>
      )}
      {(efetivoTotal(entry.efetivo?.propria) > 0 || efetivoTotal(entry.efetivo?.terceiro) > 0) && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--ink-soft)" }}>👥 Efetivo</div>
          <div className="text-sm grid sm:grid-cols-2 gap-x-4">
            <div><span className="font-medium">Própria: </span>{itensAtivos(entry.efetivo.propria).map(([c, v]) => `${c} (${v})`).join(", ") || "—"}</div>
            <div><span className="font-medium">Terceiro: </span>{itensAtivos(entry.efetivo.terceiro).map(([c, v]) => `${c} (${v})`).join(", ") || "—"}</div>
          </div>
        </div>
      )}
      {(itensAtivos(entry.materialRecebido).length > 0 || itensAtivos(entry.equipamentos).length > 0) && (
        <div className="text-sm grid sm:grid-cols-2 gap-x-4">
          <div><span className="font-medium">Material recebido: </span>{itensAtivos(entry.materialRecebido).map(([c, v]) => `${c} (${v})`).join(", ") || "—"}</div>
          <div><span className="font-medium">Equipamentos: </span>{itensAtivos(entry.equipamentos).map(([c, v]) => `${c} (${v})`).join(", ") || "—"}</div>
        </div>
      )}
      {entry.clima && (entry.clima.temperatura || entry.clima.umidade || entry.clima.condicao) && (
        <div className="text-sm flex items-center gap-3">
          {entry.clima.temperatura && <span>🌡 {entry.clima.temperatura}°C</span>}
          {entry.clima.condicao && <span>{condicaoIcon(entry.clima.condicao)} {entry.clima.condicao}</span>}
          {entry.clima.umidade && <span>UR {entry.clima.umidade}%</span>}
        </div>
      )}
      {entry.fotos?.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {entry.fotos.map((src, i) => <img key={i} src={src} alt="" className="w-full h-24 object-cover border" style={{ borderColor: "var(--line)" }} />)}
        </div>
      )}
    </div>
  );
}

// ---------- Relatório Fotográfico ----------

function GerenciarFotos({ obra, obraConfig }) {
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState("");
  const [servico, setServico] = useState("");
  const [grupo, setGrupo] = useState(GRUPOS_SERVICO[0]);
  const [data, setData] = useState(todayISO());
  const [imgAtual, setImgAtual] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [buscaServico, setBuscaServico] = useState("");
  const cameraRef = useRef(null);
  const galeriaRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const lista = await fsListFotos(obra.slug);
    lista.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
    setFotos(lista);
    setLoading(false);
  }, [obra.slug]);

  useEffect(() => { reload(); }, [reload]);

  const handleImg = async (e) => {
    const file = (e.target.files || [])[0];
    const inputEl = e.target;
    if (!file) return;
    setCompressing(true); setErro("");
    try {
      const dataUrl = await compressImage(file, 1000, 0.6);
      setImgAtual(dataUrl);
    } catch (e) { setErro("Não foi possível processar a imagem."); }
    setCompressing(false);
    if (inputEl) inputEl.value = "";
  };

  const podeSalvar = imgAtual && local.trim() && servico.trim();

  const salvarFoto = async () => {
    if (!podeSalvar) return;
    setSaving(true); setErro("");
    const id = `${obra.slug}__foto__${Date.now()}`;
    const foto = {
      obraSlug: obra.slug, data, local: local.trim(), servico: servico.trim(),
      grupo, imagem: imgAtual, criadoEm: new Date().toISOString(),
    };
    const ok = await fsSaveFoto(id, foto);
    setSaving(false);
    if (ok) {
      setImgAtual(null); setLocal(""); setServico(""); setBuscaServico("");
      reload();
    } else {
      setErro("Não foi possível salvar. Se a imagem for muito grande, tente outra foto.");
    }
  };

  const excluirFoto = async (key) => {
    await fsDeleteFoto(key);
    reload();
  };

  const catalogo = obraConfig.servicosCatalogo || [];
  const filtrados = catalogo.filter((s) => s.toLowerCase().includes(buscaServico.toLowerCase()));

  return (
    <div className="rdo-card p-5 sm:p-6">
      <SectionTitle>Adicionar foto ao relatório</SectionTitle>

      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Data" icon="📅">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="rdo-input px-3 py-2 text-sm mono" />
        </Field>
        <Field label="Grupo do serviço">
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="rdo-input w-full px-3 py-2 text-sm">
            {GRUPOS_SERVICO.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Local" icon="📍">
        <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex: TELHADO BLOCO ESCOLAR" className="rdo-input w-full px-3 py-2 text-sm uppercase" />
      </Field>

      <Field label="Serviço executado">
        <textarea value={servico} onChange={(e) => setServico(e.target.value)} rows={3} placeholder="Descrição do serviço mostrado na foto" className="rdo-input w-full px-3 py-2 text-sm" />
      </Field>

      {catalogo.length > 0 && (
        <div className="mb-4 p-2.5" style={{ background: "var(--bg)" }}>
          <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>Puxar da lista padrão:</div>
          <input type="text" value={buscaServico} onChange={(e) => setBuscaServico(e.target.value)} placeholder="Buscar serviço..." className="rdo-input w-full px-2.5 py-1.5 text-sm mb-2" />
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {filtrados.map((s) => (
              <button key={s} onClick={() => setServico(s)} className="block text-left text-sm w-full hover:underline" style={{ color: "var(--accent)" }}>+ {s}</button>
            ))}
          </div>
        </div>
      )}

      <Field label="Imagem" icon="📷">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleImg} className="hidden" />
        <input ref={galeriaRef} type="file" accept="image/*" onChange={handleImg} className="hidden" />
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => cameraRef.current?.click()} className="rdo-btn-primary text-sm px-3.5 py-2">📷 Tirar foto</button>
          <button type="button" onClick={() => galeriaRef.current?.click()} className="rdo-btn-outline text-sm px-3.5 py-2">Escolher da galeria</button>
        </div>
        {compressing && <div className="flex items-center gap-1.5 text-xs mt-2" style={{ color: "var(--ink-soft)" }}><Spin /> Processando...</div>}
        {imgAtual && <img src={imgAtual} alt="" className="mt-3 w-40 h-32 object-cover border" style={{ borderColor: "var(--line)" }} />}
      </Field>

      {erro && <div className="text-xs mb-3 px-3 py-2" style={{ background: "rgba(179,59,46,0.08)", color: "var(--danger)" }}>{erro}</div>}

      <button onClick={salvarFoto} disabled={!podeSalvar || saving} className="rdo-btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
        {saving && <Spin />} Adicionar foto
      </button>
      {!podeSalvar && <div className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>Preencha local, serviço e escolha uma imagem.</div>}

      <div className="mt-6">
        <SectionTitle>Fotos cadastradas ({fotos.length})</SectionTitle>
        {loading && <div className="flex items-center gap-2 text-sm py-4" style={{ color: "var(--ink-soft)" }}><Spin /> Carregando...</div>}
        {!loading && fotos.length === 0 && <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Nenhuma foto cadastrada ainda.</p>}
        <div className="space-y-2">
          {fotos.map((f) => (
            <div key={f.key} className="flex gap-3 items-start border p-2" style={{ borderColor: "var(--line)" }}>
              <img src={f.imagem} alt="" className="w-20 h-16 object-cover shrink-0" />
              <div className="flex-1 text-xs">
                <div className="mono" style={{ color: "var(--ink-soft)" }}>{formatDateBR(f.data)} · {f.grupo}</div>
                <div className="font-semibold">📍 {f.local}</div>
                <div>{f.servico}</div>
              </div>
              <button onClick={() => excluirFoto(f.key)} className="text-xs shrink-0" style={{ color: "var(--danger)" }}>🗑</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const FOTO_STYLE = `
  .fotorel { width: 100%; max-width: 900px; margin: 0 auto; background: white; font-family: Arial, sans-serif; color: #000; }
  .fotorel .titulo-rel { text-align: center; font-size: 16px; font-weight: bold; border: 1px solid #000; padding: 6px; }
  .fotorel table { width: 100%; border-collapse: collapse; }
  .fotorel td { border: 1px solid #000; padding: 5px 8px; font-size: 11px; vertical-align: top; }
  .fotorel .cab-lbl { font-weight: bold; width: 28%; }
  .fotorel .grupo-tit { font-weight: bold; font-size: 11px; margin-top: 6px; }
  .fotorel .grupo-desc { font-size: 11px; margin-bottom: 4px; }
  .fotorel .foto-bloco { display: flex; border: 1px solid #000; margin-top: -1px; }
  .fotorel .foto-img { width: 55%; border-right: 1px solid #000; padding: 6px; box-sizing: border-box; }
  .fotorel .foto-img img { width: 100%; height: auto; display: block; }
  .fotorel .foto-info { width: 45%; padding: 8px; font-size: 11px; box-sizing: border-box; }
  .fotorel .foto-num { font-weight: bold; margin-bottom: 6px; }
  .fotorel .foto-info .lbl { font-weight: bold; }
  @media print {
    .foto-bloco { page-break-inside: avoid; }
  }
`;

function RelatorioFotografico({ obra, obraConfig }) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [aba, setAba] = useState("gerenciar");
  const [mes, setMes] = useState(defaultMonth);
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(false);

  const carregarFotos = useCallback(async () => {
    setLoading(true);
    const lista = await fsListFotos(obra.slug);
    const filtradas = lista.filter((f) => f.data?.slice(0, 7) === mes);
    filtradas.sort((a, b) => (a.criadoEm > b.criadoEm ? 1 : -1));
    setFotos(filtradas);
    setLoading(false);
  }, [obra.slug, mes]);

  useEffect(() => { if (aba === "gerar") carregarFotos(); }, [aba, carregarFotos]);

  const fc = obraConfig.fotografico || {};
  const [ano, mesNum] = mes.split("-");
  const mesNome = MESES[parseInt(mesNum, 10) - 1];

  // agrupa serviços por grupo (resumo do topo, sem repetição)
  const resumoPorGrupo = {};
  fotos.forEach((f) => {
    const g = f.grupo || "OUTROS";
    if (!resumoPorGrupo[g]) resumoPorGrupo[g] = new Set();
    resumoPorGrupo[g].add(f.servico);
  });

  return (
    <div>
      <div className="no-print flex gap-3 mb-5 flex-wrap items-center">
        <button onClick={() => setAba("gerenciar")} className={`rdo-seg ${aba === "gerenciar" ? "active" : ""}`}>Gerenciar fotos</button>
        <button onClick={() => setAba("gerar")} className={`rdo-seg ${aba === "gerar" ? "active" : ""}`}>Gerar relatório</button>
      </div>

      {aba === "gerenciar" && <GerenciarFotos obra={obra} obraConfig={obraConfig} />}

      {aba === "gerar" && (
        <div>
          <style>{FOTO_STYLE}</style>
          <div className="no-print flex items-center gap-3 mb-5 flex-wrap">
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="rdo-input px-3 py-2 text-sm mono" />
            <button onClick={() => window.print()} disabled={fotos.length === 0} className="rdo-btn-primary px-3.5 py-2 text-sm">🖨 Imprimir / salvar PDF</button>
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{mesNome} de {ano} · {fotos.length} foto(s)</span>
          </div>

          {loading && <div className="flex items-center gap-2 text-sm py-8 justify-center" style={{ color: "var(--ink-soft)" }}><Spin /> Montando...</div>}
          {!loading && fotos.length === 0 && <div className="rdo-card p-8"><EmptyState title="Sem fotos neste mês" subtitle="Cadastre fotos na aba 'Gerenciar fotos' para gerar o relatório." /></div>}

          {!loading && fotos.length > 0 && (
            <div className="fotorel">
              <div className="titulo-rel">RELATÓRIO FOTOGRÁFICO MENSAL</div>
              <table style={{ marginTop: -1 }}>
                <tbody>
                  <tr><td className="cab-lbl">IMÓVEL PÚBLICO:</td><td>{fc.imovel}</td></tr>
                  <tr><td className="cab-lbl">DEMANDANTE (Secretaria):</td><td>{fc.demandante}</td></tr>
                  <tr><td className="cab-lbl">ENDEREÇO:</td><td>{fc.endereco}</td></tr>
                  <tr><td className="cab-lbl">EMPRESA CONTRATADA:</td><td>{fc.empresa}</td></tr>
                  <tr><td className="cab-lbl">RESPONSÁVEL TÉCNICO:</td><td>{fc.respTecnico}</td></tr>
                  <tr><td className="cab-lbl">CREA:</td><td>{fc.crea}</td></tr>
                </tbody>
              </table>

              <table style={{ marginTop: -1 }}>
                <tbody>
                  <tr><td>
                    {GRUPOS_SERVICO.filter((g) => resumoPorGrupo[g]).map((g) => (
                      <div key={g}>
                        <div className="grupo-tit">{g}</div>
                        <div className="grupo-desc">{Array.from(resumoPorGrupo[g]).join(", ")}</div>
                      </div>
                    ))}
                  </td></tr>
                </tbody>
              </table>

              <div style={{ marginTop: 8 }}>
                {fotos.map((f, i) => (
                  <div key={f.key} className="foto-bloco">
                    <div className="foto-img"><img src={f.imagem} alt="" /></div>
                    <div className="foto-info">
                      <div className="foto-num">Foto {String(i + 1).padStart(2, "0")}</div>
                      <div><span className="lbl">Local:</span> {f.local}</div>
                      <div style={{ marginTop: 6 }}><span className="lbl">Serviço:</span> {f.servico}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Relatório Mensal ----------

// ---------- Relatório Mensal (padrão oficial, tabela) ----------


const RDO_STYLE = `
  .rdo-oficial { width: 100%; max-width: 900px; margin: 0 auto; background: white; }
  .rdo-oficial table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .rdo-oficial td, .rdo-oficial th { border: 1px solid #000; padding: 2px 5px; font-size: 10px; vertical-align: top; font-family: Arial, sans-serif; color: #000; }
  .rdo-oficial .lbl { font-weight: bold; font-size: 9px; }
  .rdo-oficial .center { text-align: center; }
  .rdo-oficial .titulo { font-size: 15px; font-weight: bold; text-align: center; }
  .rdo-oficial .local-row { font-weight: bold; background: #f2f2f2; }
  .rdo-oficial .day-block { margin-bottom: 28px; }
  @media print {
    .rdo-oficial .day-block { page-break-after: always; margin-bottom: 0; }
  }
`;

const LINHAS_DESCRICAO_PADRAO = 30;
const ALTURA_LINHA_DESCRICAO = 14;

function montarLinhasDescricao(locais) {
  const linhas = [];
  (locais || []).forEach((l) => {
    if (l.local) linhas.push({ tipo: "local", texto: l.local });
    l.itens.forEach((item) => linhas.push({ tipo: "item", texto: item }));
  });
  const total = Math.max(LINHAS_DESCRICAO_PADRAO, linhas.length);
  while (linhas.length < total) linhas.push({ tipo: "vazio", texto: "" });
  return linhas;
}

function RdoDiaOficial({ entry, obraConfig, obra, prazo }) {
  const totalDias = prazo?.totalDias ?? "";
  const climaCond = entry.clima?.condicao || "";

  return (
    <div className="day-block">
      <table>
        <tbody>
          <tr>
            <td rowSpan={3} style={{ width: "18%" }} className="center">
              <img src="logo.png" alt="Logo" style={{ maxWidth: "90%", maxHeight: 70, height: "auto" }} />
            </td>
            <td colSpan={4} rowSpan={2} className="titulo">RELATÓRIO DIÁRIO DE OBRA</td>
            <td className="lbl" style={{ width: "10%" }}>Data:</td>
            <td style={{ width: "14%" }}>{formatDateBR(entry.data)}</td>
          </tr>
          <tr>
            <td className="lbl">Dia da Semana:</td>
            <td>{entry.diaSemana}</td>
          </tr>
          <tr>
            <td className="lbl center">Contratado</td>
            <td className="lbl center">Contrato Número</td>
            <td colSpan={2} className="lbl center">Nome Obra</td>
            <td colSpan={2} className="center" style={{ fontWeight: "bold" }}>{obra.nome}</td>
          </tr>
          <tr>
            <td>{obraConfig.contratado}</td>
            <td colSpan={2}>{obraConfig.numeroContrato}</td>
            <td colSpan={2}></td>
            <td colSpan={2}></td>
          </tr>
        </tbody>
      </table>

      <table style={{ marginTop: -1 }}>
        <tbody>
          <tr>
            <td className="lbl" style={{ width: "10%" }}>Contrato</td>
            <td className="lbl" style={{ width: "20%" }}>Prazo contratual - {totalDias} Dias</td>
            <td className="lbl" style={{ width: "12%" }}>Dias decorridos</td>
            <td className="lbl" style={{ width: "12%" }}>Dias restantes</td>
          </tr>
          <tr>
            <td className="lbl">Início <span style={{ fontWeight: "normal" }}>{formatDateBR(obraConfig.dataInicio)}</span></td>
            <td rowSpan={2}></td>
            <td rowSpan={2} className="center" style={{ fontSize: 12 }}>{entry.diasDecorridos ?? ""}</td>
            <td rowSpan={2} className="center" style={{ fontSize: 12 }}>{entry.diasRestantes ?? ""}</td>
          </tr>
          <tr>
            <td className="lbl">Término</td>
          </tr>
        </tbody>
      </table>

      <table style={{ marginTop: -1 }}>
        <tbody>
          <tr>
            <td className="lbl" style={{ width: "65%" }}>Descrição dos Serviços Executado</td>
            <td className="lbl" style={{ width: "35%" }}>Observações da Fiscalização</td>
          </tr>
          <tr>
            <td style={{ padding: 0 }}>
              <table style={{ border: "none" }}>
                <tbody>
                  {montarLinhasDescricao(entry.locais).map((linha, i) => (
                    <tr key={i} style={{ height: ALTURA_LINHA_DESCRICAO }}>
                      <td
                        style={{
                          border: "none",
                          borderBottom: "1px solid #000",
                          height: ALTURA_LINHA_DESCRICAO,
                          fontWeight: linha.tipo === "local" ? "bold" : "normal",
                          background: linha.tipo === "local" ? "#f2f2f2" : "transparent",
                        }}
                      >
                        {linha.tipo === "local" ? `LOCAL : ${linha.texto}` : linha.texto || "\u00A0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
            <td>{entry.obsFiscalizacao}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ marginTop: -1 }}>
        <tbody>
          <tr>
            <td className="lbl center" style={{ width: "17%" }}>Equipe propria</td>
            <td className="lbl center" style={{ width: "8%" }}>Efetivo<br/>Total</td>
            <td className="lbl center" style={{ width: "17%" }}>Observações</td>
            <td className="lbl center" style={{ width: "17%" }}>Equipe Terceiro</td>
            <td className="lbl center" style={{ width: "8%" }}>Efetivo<br/>Total</td>
            <td className="lbl center" style={{ width: "17%" }}>Observações</td>
          </tr>
          {CARGOS_PADRAO.map((cargo) => (
            <tr key={cargo}>
              <td>{cargo}</td>
              <td className="center">{entry.efetivo?.propria?.[cargo] || ""}</td>
              <td></td>
              <td>{cargo}</td>
              <td className="center">{entry.efetivo?.terceiro?.[cargo] || ""}</td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ marginTop: -1 }}>
        <tbody>
          <tr><td className="lbl center">Ocorrencia</td></tr>
          <tr><td style={{ height: 40 }}>{entry.ocorrencias}</td></tr>
        </tbody>
      </table>

      <table style={{ marginTop: -1 }}>
        <tbody>
          <tr>
            <td className="lbl center" style={{ width: "38%" }}>Material Recebido</td>
            <td className="lbl center" style={{ width: "12%" }}>Total</td>
            <td className="lbl center" style={{ width: "38%" }}>Equipamentos</td>
            <td className="lbl center" style={{ width: "12%" }}>Total</td>
          </tr>
          {obraConfig.itensCatalogo.map((item) => (
            <tr key={item}>
              <td>{item}</td>
              <td className="center">{entry.materialRecebido?.[item] || "-"}</td>
              <td>{item}</td>
              <td className="center">{entry.equipamentos?.[item] || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ marginTop: -1 }}>
        <tbody>
          <tr>
            <td rowSpan={2} className="lbl center" style={{ width: "20%" }}>Temperatura °C<br/>{entry.clima?.temperatura || ""}</td>
            <td colSpan={3} className="lbl center">Condições do tempo</td>
            <td rowSpan={2} className="lbl center" style={{ width: "20%" }}>Umidade Relativa do Ar<br/>{entry.clima?.umidade ? entry.clima.umidade + "%" : ""}</td>
          </tr>
          <tr>
            <td className="center" style={{ width: "20%" }}>Bom{climaCond === "Bom" ? " (X)" : ""}</td>
            <td className="center" style={{ width: "20%" }}>Chuva{climaCond === "Chuva" ? " (X)" : ""}</td>
            <td className="center" style={{ width: "20%" }}>Instavel{climaCond === "Instável" ? " (X)" : ""}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ marginTop: -1 }}>
        <tbody>
          <tr>
            <td className="lbl center" style={{ width: "50%" }}>Contratada</td>
            <td className="lbl center" style={{ width: "50%" }}>Contratante</td>
          </tr>
          <tr>
            <td style={{ height: 45 }}>
              Carimbo e Assinatura:
              {entry.responsavelTecnico?.nome && <div>{entry.responsavelTecnico.nome}{entry.responsavelTecnico.crea ? " — CREA " + entry.responsavelTecnico.crea : ""}</div>}
            </td>
            <td style={{ height: 45 }}>
              Carimbo e Assinatura:
              {entry.fiscalizacaoResp?.nome && <div>{entry.fiscalizacaoResp.nome}{entry.fiscalizacaoResp.crea ? " — CREA " + entry.fiscalizacaoResp.crea : ""}</div>}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RelatorioMensal({ obra, obraConfig }) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [mes, setMes] = useState(defaultMonth);
  const { entries, loading } = useEntries(obra, mes);

  const [ano, mesNum] = mes.split("-");
  const mesNome = MESES[parseInt(mesNum, 10) - 1];
  const prazo = obraConfig.dataInicio && obraConfig.prazoMeses ? calcularPrazo(obraConfig.dataInicio, obraConfig.prazoMeses, todayISO()) : null;
  const entriesOrdenadas = entries.slice().sort((a, b) => (a.data > b.data ? 1 : a.data < b.data ? -1 : 0));

  return (
    <div>
      <style>{RDO_STYLE}</style>
      <div className="no-print flex items-center gap-3 mb-5 flex-wrap">
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="rdo-input px-3 py-2 text-sm mono" />
        <button onClick={() => window.print()} disabled={entries.length === 0} className="rdo-btn-primary px-3.5 py-2 text-sm">🖨 Imprimir / salvar PDF</button>
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{mesNome} de {ano} · {entries.length} registro(s)</span>
      </div>

      {loading && <div className="flex items-center gap-2 text-sm py-8 justify-center" style={{ color: "var(--ink-soft)" }}><Spin /> Montando relatório...</div>}
      {!loading && entries.length === 0 && <div className="rdo-card p-8"><EmptyState title="Sem dados para este mês" subtitle="Não há registros de RDO no período selecionado." /></div>}

      {!loading && entries.length > 0 && (
        <div className="rdo-oficial">
          {entriesOrdenadas.map((entry) => (
            <RdoDiaOficial key={entry.key} entry={entry} obraConfig={obraConfig} obra={obra} prazo={prazo} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- mount ----------

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<RdoDigital />);
