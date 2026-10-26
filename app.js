'use strict';

/* NeuroFit Performance Lab
   Seguimiento de rendimiento con almacenamiento local de contingencia y sincronización Supabase.
   Recomendaciones orientativas; no sustituye evaluación individual ni supervisión cualificada.
*/

const STORAGE_KEY = 'neurofit-performance-v1';
const LOGO_URL = 'https://i.postimg.cc/yY45rPjP/1-1-1-Photoroom.png';
const CLOUD_ROW_ID = 'shared';
const CLIENT_ID_KEY = 'neurofit-client-id';
let supabaseClient = null;
let currentUser = null;
let cloudReady = false;
let cloudBootingUserId = null;
let applyingCloudData = false;
let cloudSaveTimer = null;
let realtimeChannel = null;
let syncPromise = Promise.resolve();
const CLIENT_ID = (() => { try { let id = sessionStorage.getItem(CLIENT_ID_KEY); if (!id) { id = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; sessionStorage.setItem(CLIENT_ID_KEY, id); } return id; } catch (_) { return `client-${Date.now().toString(36)}`; } })();

const DEFAULT_EXERCISES = [
  { id: 'ex-squat', name: 'Sentadilla goblet', category: 'Fuerza de piernas', equipment: 'Mancuerna / kettlebell', level: 'Inicial', description: 'Controlar el apoyo, la trayectoria y la profundidad tolerada.' },
  { id: 'ex-squat-bar', name: 'Sentadilla con barra', category: 'Fuerza de piernas', equipment: 'Barra y rack', level: 'Intermedio', description: 'Progresar con técnica estable y supervisión.' },
  { id: 'ex-split-squat', name: 'Sentadilla dividida', category: 'Unilateral', equipment: 'Peso corporal / mancuernas', level: 'Inicial', description: 'Mantener control de pelvis, rodilla y equilibrio.' },
  { id: 'ex-hip-hinge', name: 'Peso muerto rumano', category: 'Cadena posterior', equipment: 'Mancuernas / barra', level: 'Intermedio', description: 'Practicar bisagra de cadera y columna estable.' },
  { id: 'ex-hip-thrust', name: 'Puente de glúteos', category: 'Cadena posterior', equipment: 'Peso corporal / carga', level: 'Inicial', description: 'Evitar compensaciones lumbares al extender la cadera.' },
  { id: 'ex-calf', name: 'Elevación de talones', category: 'Tobillo y pie', equipment: 'Peso corporal / carga', level: 'Inicial', description: 'Recorrido controlado y apoyo estable.' },
  { id: 'ex-pushup', name: 'Flexiones de brazos', category: 'Empuje', equipment: 'Peso corporal', level: 'Inicial', description: 'Adaptar la inclinación para conservar una técnica sólida.' },
  { id: 'ex-bench', name: 'Press de banca', category: 'Empuje', equipment: 'Banco y barra', level: 'Intermedio', description: 'Asegurar soportes y asistencia cuando corresponda.' },
  { id: 'ex-row', name: 'Remo con mancuerna', category: 'Tracción', equipment: 'Mancuerna', level: 'Inicial', description: 'Evitar rotaciones no controladas del tronco.' },
  { id: 'ex-pull', name: 'Jalón al pecho', category: 'Tracción', equipment: 'Polea', level: 'Inicial', description: 'Controlar el retorno y evitar balanceos.' },
  { id: 'ex-medball', name: 'Lanzamiento de balón medicinal', category: 'Potencia', equipment: 'Balón medicinal', level: 'Intermedio', description: 'Intención rápida, buena técnica y descansos suficientes.' },
  { id: 'ex-jump', name: 'Salto vertical', category: 'Potencia', equipment: 'Sin material / app de medición', level: 'Inicial', description: 'Pocas repeticiones de calidad, con aterrizaje estable.' },
  { id: 'ex-hop', name: 'Saltos laterales controlados', category: 'Agilidad', equipment: 'Conos / líneas', level: 'Intermedio', description: 'Progresar distancia y velocidad solo si el aterrizaje es consistente.' },
  { id: 'ex-plank', name: 'Plancha frontal', category: 'Control del tronco', equipment: 'Colchoneta', level: 'Inicial', description: 'Mantener respiración y posición sin dolor.' },
  { id: 'ex-mobility', name: 'Movilidad dinámica de cadera y tobillo', category: 'Movilidad', equipment: 'Sin material', level: 'Inicial', description: 'Rango activo y controlado según necesidad.' }
];

const DEFAULT_TESTS = [
  { id: 'test-baseline-net', name: 'Línea de fondo → red', category: 'Velocidad', unit: 's', lowerIsBetter: true, description: 'Cronometra el recorrido y registra la distancia real utilizada.' },
  { id: 'test-10m', name: 'Sprint 10 metros', category: 'Velocidad', unit: 's', lowerIsBetter: true, description: 'Aceleración corta desde una salida siempre igual.' },
  { id: 'test-20m', name: 'Sprint 20 metros', category: 'Velocidad', unit: 's', lowerIsBetter: true, description: 'Mismo protocolo, superficie y método de cronometraje.' },
  { id: 'test-30m', name: 'Sprint 30 metros', category: 'Velocidad', unit: 's', lowerIsBetter: true, description: 'Registrar si la salida es estática o lanzada.' },
  { id: 'test-100m', name: 'Carrera 100 metros', category: 'Velocidad / resistencia', unit: 's', lowerIsBetter: true, description: 'Prueba editable; normaliza superficie, salida y condiciones.' },
  { id: 'test-200m', name: 'Carrera 200 metros', category: 'Velocidad / resistencia', unit: 's', lowerIsBetter: true, description: 'Prueba editable; anota pista, clima y protocolo.' },
  { id: 'test-jump', name: 'Salto horizontal', category: 'Potencia', unit: 'cm', lowerIsBetter: false, description: 'Medir desde la línea de salida al punto de contacto más cercano.' },
  { id: 'test-vertical', name: 'Salto vertical', category: 'Potencia', unit: 'cm', lowerIsBetter: false, description: 'Usar siempre el mismo dispositivo y el mismo protocolo.' },
  { id: 'test-pushups', name: 'Flexiones técnicamente válidas', category: 'Fuerza-resistencia', unit: 'reps', lowerIsBetter: false, description: 'Definir antes el rango de movimiento y el criterio de repetición válida.' },
  { id: 'test-plank', name: 'Plancha frontal', category: 'Control del tronco', unit: 's', lowerIsBetter: false, description: 'Detener cuando se pierde el criterio técnico; evitar competir con dolor.' }
];

function blankDB() {
  return { students: [], strengthLogs: [], tests: [], exercises: DEFAULT_EXERCISES.map(x => ({ ...x })), testDefs: DEFAULT_TESTS.map(x => ({ ...x })), version: 1 };
}
function normalizeDB(parsed) {
  if (!parsed || !Array.isArray(parsed.students)) return blankDB();
  return {
    students: Array.isArray(parsed.students) ? parsed.students : [],
    strengthLogs: Array.isArray(parsed.strengthLogs) ? parsed.strengthLogs : [],
    tests: Array.isArray(parsed.tests) ? parsed.tests : [],
    exercises: Array.isArray(parsed.exercises) && parsed.exercises.length ? parsed.exercises : DEFAULT_EXERCISES.map(x => ({ ...x })),
    testDefs: Array.isArray(parsed.testDefs) && parsed.testDefs.length ? parsed.testDefs : DEFAULT_TESTS.map(x => ({ ...x })),
    version: 1
  };
}
function loadDB() {
  try { return normalizeDB(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
  catch (e) { return blankDB(); }
}
let db = loadDB();
let currentPage = 'dashboard';
let activeStudentId = null;
let studentSearch = '';
let strengthSearch = '';
let testSearch = '';
let exerciseSearch = '';
let profileChartMode = 'test';
let profileTrendId = null;
let dashboardStudentId = '';
let dashboardTrendMode = 'tests';
let modalState = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const pageContent = $('#pageContent');
const modalBackdrop = $('#modalBackdrop');

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function saveDB() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    if (cloudReady && !applyingCloudData) queueCloudSave();
    return true;
  } catch (error) {
    toast('No se pudo guardar en este navegador', 'Exporta un respaldo y libera espacio.');
    return false;
  }
}
function fmtNum(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-PE', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
function fmtDate(value, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-PE', opts);
}
function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}
function getStudent(id) { return db.students.find(s => s.id === id); }
function getExercise(id) { return db.exercises.find(e => e.id === id); }
function getTestDef(id) { return db.testDefs.find(t => t.id === id); }
function initials(name) {
  return String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || '?';
}
function sortedByDate(arr, dir = 'desc') {
  return [...arr].sort((a, b) => (dir === 'asc' ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date))));
}
function studentName(id) { return getStudent(id)?.name || 'Alumno eliminado'; }
function toast(message, sub = '') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${esc(message)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  $('#toastRegion').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
function setPage(page) {
  currentPage = page;
  activeStudentId = null;
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page));
  const labels = { dashboard: 'Panel general', students: 'Mis alumnos', strength: 'Cargas de fuerza', tests: 'Pruebas físicas', library: 'Biblioteca', reports: 'Reportes y datos' };
  $('#pageCrumb').textContent = labels[page] || 'Perfil del alumno';
  renderPage();
  closeMobileMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderPage() {
  $('#studentNavCount').textContent = db.students.length;
  if (activeStudentId) return renderProfile(activeStudentId);
  const renderers = { dashboard: renderDashboard, students: renderStudents, strength: renderStrength, tests: renderTests, library: renderLibrary, reports: renderReports };
  (renderers[currentPage] || renderDashboard)();
}
function pageHeading(eyebrow, title, subtitle, actions = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function emptyState(icon, title, description, buttonLabel = '', action = '') {
  return `<div class="empty-state"><div class="empty-graphic">${icon}</div><h3>${title}</h3><p>${description}</p>${buttonLabel ? `<button class="button button-primary" data-action="${action}"><span>＋</span>${buttonLabel}</button>` : ''}</div>`;
}
function monthStartISO() {
  const d = new Date(); d.setDate(1); const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}
function allActivity() {
  const strength = db.strengthLogs.map(x => ({ ...x, type: 'strength', date: x.date, name: getExercise(x.exerciseId)?.name || 'Ejercicio', studentId: x.studentId }));
  const tests = db.tests.map(x => ({ ...x, type: 'test', date: x.date, name: getTestDef(x.testId)?.name || 'Prueba', studentId: x.studentId }));
  return sortedByDate([...strength, ...tests]);
}
function renderDashboard() {
  const monthStart = monthStartISO();
  const sessionsMonth = db.strengthLogs.filter(x => x.date >= monthStart).length;
  const testsMonth = db.tests.filter(x => x.date >= monthStart).length;
  const recentActivity = allActivity().slice(0, 6);
  const actions = `<button class="button button-secondary" data-action="go-reports">↧ Exportar datos</button><button class="button button-primary" data-action="new-student"><span>＋</span> Registrar alumno</button>`;
  pageContent.innerHTML = `${pageHeading('VISIÓN DEL EQUIPO', 'Panel general', 'Un resumen claro del trabajo realizado y de la evolución de tus deportistas.', actions)}
    <div class="stats-grid">
      <article class="stat-card"><div class="stat-top"><span>Alumnos registrados</span><span class="stat-icon">♙</span></div><div class="stat-value">${db.students.length}</div><div class="stat-foot"><span class="positive">●</span> Perfiles individuales</div></article>
      <article class="stat-card"><div class="stat-top"><span>Registros de fuerza este mes</span><span class="stat-icon">↗</span></div><div class="stat-value">${sessionsMonth}</div><div class="stat-foot">Cargas, series y repeticiones</div></article>
      <article class="stat-card"><div class="stat-top"><span>Pruebas este mes</span><span class="stat-icon">◷</span></div><div class="stat-value">${testsMonth}</div><div class="stat-foot">Resultados físicos registrados</div></article>
      <article class="stat-card"><div class="stat-top"><span>Ejercicios en biblioteca</span><span class="stat-icon">▤</span></div><div class="stat-value">${db.exercises.length}</div><div class="stat-foot">Catálogo personal y editable</div></article>
    </div>
    <div class="quick-actions">
      <button class="quick-action" data-action="new-strength"><span class="quick-action-icon">↗</span><span><strong>Registrar fuerza</strong><small>Anota carga, series, repeticiones y RIR.</small></span></button>
      <button class="quick-action" data-action="new-test"><span class="quick-action-icon">◷</span><span><strong>Registrar una prueba</strong><small>Velocidad, saltos y pruebas configurables.</small></span></button>
      <button class="quick-action" data-action="go-students"><span class="quick-action-icon">♙</span><span><strong>Ver evolución individual</strong><small>Gráficos e historial por alumno.</small></span></button>
    </div>
    <div class="content-grid">
      <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Evolución de un alumno</h2><p class="panel-subtitle">Compara mediciones repetidas de la misma prueba.</p></div><div class="chart-legend"><span class="legend-dot"></span> Resultado</div></div><div class="panel-body"><div class="inline-filters" style="margin-bottom:10px"><select class="toolbar-select" id="dashboardStudentSelect" aria-label="Seleccionar alumno"><option value="">Selecciona un alumno</option>${db.students.map(s => `<option value="${esc(s.id)}" ${dashboardStudentId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select><select class="toolbar-select" id="dashboardTestSelect" aria-label="Seleccionar prueba">${db.testDefs.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></div><div class="chart-wrap"><canvas id="dashboardChart"></canvas><div class="chart-empty" id="dashboardChartEmpty" ${db.tests.length ? 'hidden' : ''}><div><strong>Tu gráfico aparecerá aquí</strong>Registra una misma prueba en distintas fechas.</div></div></div></div></section>
      <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Actividad reciente</h2><p class="panel-subtitle">Últimos registros añadidos.</p></div><button class="button button-ghost button-small" data-action="go-reports">Ver datos ↗</button></div><div class="panel-body"><div class="activity-list">${recentActivity.length ? recentActivity.map(a => {
        const isTest = a.type === 'test'; const def = isTest ? getTestDef(a.testId) : null; const value = isTest ? `${fmtNum(a.value, 2)} ${def?.unit || ''}` : `${fmtNum(a.load, 1)} kg`;
        return `<div class="activity-item"><div class="activity-symbol">${isTest ? '◷' : '↗'}</div><div><span class="activity-name">${esc(a.name)}</span><span class="activity-meta">${esc(studentName(a.studentId))} · ${fmtDate(a.date, { day: '2-digit', month: 'short' })}</span></div><div class="activity-value">${value}<small>${isTest ? 'Prueba física' : `${a.sets} × ${a.reps}`}</small></div></div>`;
      }).join('') : `<div class="text-muted" style="text-align:center;padding:24px 6px;font-size:11px;line-height:1.8">Aún no hay registros.<br>Empieza con una prueba o una sesión de fuerza.</div>`}</div></div></section>
    </div>
    <div class="info-banner"><span class="info-icon">ⓘ</span><div><strong>Para que el progreso sea fiable:</strong> utiliza el mismo protocolo, superficie, dispositivo y criterios técnicos al repetir una prueba. Registra también el contexto (fatiga, molestias, descanso o condiciones) para interpretar los resultados, no solo el número.</div></div>
    <div class="section-bar"><h2>Alumnos recientes</h2><button class="button button-secondary button-small" data-action="go-students">Ver todos →</button></div>
    ${db.students.length ? `<section class="panel table-panel"><div class="table-scroll"><table><thead><tr><th>Alumno</th><th>Deporte</th><th>Edad</th><th>Registros</th><th>Última actividad</th><th></th></tr></thead><tbody>${[...db.students].slice(-5).reverse().map(s => {
      const count = db.strengthLogs.filter(x => x.studentId === s.id).length + db.tests.filter(x => x.studentId === s.id).length;
      const latest = allActivity().find(x => x.studentId === s.id);
      return `<tr><td><div class="table-person"><span class="person-avatar">${esc(initials(s.name))}</span><span><strong>${esc(s.name)}</strong><small>${esc(s.goal || 'Objetivo no definido')}</small></span></div></td><td>${esc(s.sport || '—')}</td><td>${s.age ? `${s.age} años` : '—'}</td><td>${count}</td><td>${latest ? fmtDate(latest.date) : 'Sin registros'}</td><td><button class="table-action" data-action="view-profile" data-id="${esc(s.id)}">Ver perfil →</button></td></tr>`;
    }).join('')}</tbody></table></div></section>` : `<section class="panel">${emptyState('♙', 'Todavía no hay alumnos', 'Crea el primer perfil para registrar sus pruebas y cargas de entrenamiento.', 'Añadir primer alumno', 'new-student')}</section>`}`;
  const testSelect = $('#dashboardTestSelect');
  if (testSelect && profileTrendId && db.testDefs.some(t => t.id === profileTrendId)) testSelect.value = profileTrendId;
  if (testSelect && !profileTrendId && db.testDefs.length) profileTrendId = testSelect.value;
  requestAnimationFrame(drawDashboardChart);
}
function drawDashboardChart() {
  const canvas = $('#dashboardChart'); const empty = $('#dashboardChartEmpty');
  if (!canvas) return;
  const studentId = $('#dashboardStudentSelect')?.value || dashboardStudentId;
  const testId = $('#dashboardTestSelect')?.value || db.testDefs[0]?.id;
  const def = getTestDef(testId);
  const rows = sortedByDate(db.tests.filter(x => x.studentId === studentId && x.testId === testId), 'asc');
  if (empty) empty.hidden = rows.length > 0;
  drawLineChart(canvas, rows.map(r => ({ label: fmtDate(r.date, { day: '2-digit', month: 'short' }), value: Number(r.value) })), def?.unit || '', { lowerIsBetter: Boolean(def?.lowerIsBetter) });
}
function renderStudents() {
  const filtered = db.students.filter(s => `${s.name} ${s.sport} ${s.goal}`.toLowerCase().includes(studentSearch.toLowerCase()));
  pageContent.innerHTML = `${pageHeading('GESTIÓN DE DEPORTISTAS', 'Mis alumnos', 'Crea perfiles individuales y accede a su historial de entrenamiento.', `<button class="button button-primary" data-action="new-student"><span>＋</span> Añadir alumno</button>`)}
    <div class="info-banner"><span class="info-icon">ⓘ</span><div>Registra solo la información necesaria para el seguimiento deportivo. Esta versión guarda los datos en el almacenamiento local del navegador: no se sincronizan automáticamente con otros dispositivos.</div></div>
    <section class="panel table-panel"><div class="table-toolbar"><div class="search-box"><span class="search-symbol">⌕</span><input id="studentSearch" type="search" placeholder="Buscar por nombre, deporte u objetivo..." value="${esc(studentSearch)}" /></div><span class="text-muted" style="font-size:11px">${filtered.length} de ${db.students.length} alumnos</span></div>
    ${filtered.length ? `<div class="table-scroll"><table><thead><tr><th>Alumno</th><th>Deporte</th><th>Edad</th><th>Peso</th><th>Estatura</th><th>Objetivo</th><th>Registros</th><th>Acciones</th></tr></thead><tbody>${filtered.map(s => {
      const count = db.strengthLogs.filter(x => x.studentId === s.id).length + db.tests.filter(x => x.studentId === s.id).length;
      return `<tr><td><div class="table-person"><span class="person-avatar">${esc(initials(s.name))}</span><span><strong>${esc(s.name)}</strong><small>Perfil individual</small></span></div></td><td>${esc(s.sport || '—')}</td><td>${s.age ? `${s.age} años` : '—'}</td><td>${s.weight ? `${fmtNum(s.weight, 1)} kg` : '—'}</td><td>${s.height ? `${fmtNum(s.height, 1)} cm` : '—'}</td><td><span class="tag cyan">${esc(s.goal || 'General')}</span></td><td>${count}</td><td><div class="row-actions"><button class="table-action" data-action="view-profile" data-id="${esc(s.id)}">Perfil ↗</button><button class="table-action" data-action="edit-student" data-id="${esc(s.id)}">Editar</button></div></td></tr>`;
    }).join('')}</tbody></table></div>` : emptyState('♙', studentSearch ? 'No hay coincidencias' : 'Añade tu primer alumno', studentSearch ? 'Prueba con otro nombre o deporte.' : 'El perfil servirá para unir sus mediciones, cargas y recomendaciones.', studentSearch ? '' : 'Crear alumno', studentSearch ? '' : 'new-student')}</section>`;
}
function renderStrength() {
  const rows = sortedByDate(db.strengthLogs.filter(x => {
    const s = getStudent(x.studentId); const e = getExercise(x.exerciseId);
    return `${s?.name || ''} ${e?.name || ''} ${x.notes || ''}`.toLowerCase().includes(strengthSearch.toLowerCase());
  }));
  pageContent.innerHTML = `${pageHeading('REGISTRO DE FUERZA', 'Cargas de entrenamiento', 'Controla carga externa, volumen, repeticiones y RIR para cada sesión.', `<button class="button button-primary" data-action="new-strength"><span>＋</span> Nuevo registro</button>`)}
    <div class="stats-grid"><article class="stat-card"><div class="stat-top"><span>Registros totales</span><span class="stat-icon">↗</span></div><div class="stat-value">${db.strengthLogs.length}</div><div class="stat-foot">Historial de sesiones / ejercicios</div></article><article class="stat-card"><div class="stat-top"><span>Ejercicios disponibles</span><span class="stat-icon">▤</span></div><div class="stat-value">${db.exercises.length}</div><div class="stat-foot">En la biblioteca editable</div></article><article class="stat-card"><div class="stat-top"><span>Alumnos con registros</span><span class="stat-icon">♙</span></div><div class="stat-value">${new Set(db.strengthLogs.map(x => x.studentId)).size}</div><div class="stat-foot">Con al menos un registro</div></article><article class="stat-card"><div class="stat-top"><span>Registros de este mes</span><span class="stat-icon">▦</span></div><div class="stat-value">${db.strengthLogs.filter(x => x.date >= monthStartISO()).length}</div><div class="stat-foot">Desde el día 1 del mes</div></article></div>
    <section class="panel table-panel"><div class="table-toolbar"><div class="search-box"><span class="search-symbol">⌕</span><input id="strengthSearch" type="search" placeholder="Buscar alumno o ejercicio..." value="${esc(strengthSearch)}" /></div><button class="button button-secondary button-small" data-action="new-exercise">＋ Añadir ejercicio</button></div>
    ${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Alumno</th><th>Ejercicio</th><th>Carga</th><th>Series × reps</th><th>Volumen</th><th>RIR</th><th></th></tr></thead><tbody>${rows.map(x => {
      const volume = Number(x.load) > 0 ? Number(x.load) * Number(x.sets) * Number(x.reps) : Number(x.sets) * Number(x.reps);
      return `<tr><td>${fmtDate(x.date)}</td><td>${esc(studentName(x.studentId))}</td><td><strong style="color:#263a50">${esc(getExercise(x.exerciseId)?.name || 'Ejercicio eliminado')}</strong></td><td>${fmtNum(x.load, 1)} kg</td><td>${x.sets} × ${x.reps}</td><td>${fmtNum(volume, 0)} ${Number(x.load) > 0 ? 'kg·reps' : 'reps'}</td><td>${x.rir === '' || x.rir == null ? '—' : x.rir}</td><td><button class="table-action" data-action="delete-strength" data-id="${esc(x.id)}">Eliminar</button></td></tr>`;
    }).join('')}</tbody></table></div>` : emptyState('↗', db.strengthLogs.length ? 'No se encontraron registros' : 'Aún no hay cargas guardadas', db.strengthLogs.length ? 'Cambia la búsqueda.' : 'Registra la primera sesión para comenzar a visualizar la evolución.', db.strengthLogs.length ? '' : 'Registrar carga', db.strengthLogs.length ? '' : 'new-strength')}</section>
    <div class="info-banner" style="margin-top:17px"><span class="info-icon">ⓘ</span><div><strong>Interpretación:</strong> un aumento de carga no implica automáticamente mejora si cambian las repeticiones, el rango de movimiento, la técnica o el RIR. Compara registros con condiciones similares y adapta el trabajo a la experiencia y maduración del deportista.</div></div>`;
}
function renderTests() {
  const rows = sortedByDate(db.tests.filter(x => {
    const s = getStudent(x.studentId); const t = getTestDef(x.testId);
    return `${s?.name || ''} ${t?.name || ''} ${x.notes || ''}`.toLowerCase().includes(testSearch.toLowerCase());
  }));
  pageContent.innerHTML = `${pageHeading('EVALUACIÓN DEL RENDIMIENTO', 'Pruebas físicas', 'Registra tiempos y resultados; crea pruebas propias con su unidad y criterio de mejora.', `<button class="button button-secondary" data-action="new-testdef">＋ Configurar prueba</button><button class="button button-primary" data-action="new-test"><span>＋</span> Registrar resultado</button>`)}
    <div class="info-banner"><span class="info-icon">ⓘ</span><div><strong>Comparaciones válidas:</strong> repite el mismo protocolo de salida, calentamiento, superficie, medición y recuperación. En pruebas cronometradas, un tiempo menor suele ser mejor; en distancia, altura o repeticiones, normalmente un resultado mayor es mejor. El criterio puede editarse por prueba.</div></div>
    <div class="stats-grid"><article class="stat-card"><div class="stat-top"><span>Resultados registrados</span><span class="stat-icon">◷</span></div><div class="stat-value">${db.tests.length}</div><div class="stat-foot">Todas las pruebas</div></article><article class="stat-card"><div class="stat-top"><span>Pruebas configuradas</span><span class="stat-icon">▤</span></div><div class="stat-value">${db.testDefs.length}</div><div class="stat-foot">Editables por el entrenador</div></article><article class="stat-card"><div class="stat-top"><span>Alumnos evaluados</span><span class="stat-icon">♙</span></div><div class="stat-value">${new Set(db.tests.map(x => x.studentId)).size}</div><div class="stat-foot">Con al menos un resultado</div></article><article class="stat-card"><div class="stat-top"><span>Resultados este mes</span><span class="stat-icon">▦</span></div><div class="stat-value">${db.tests.filter(x => x.date >= monthStartISO()).length}</div><div class="stat-foot">Desde el día 1 del mes</div></article></div>
    <section class="panel table-panel"><div class="table-toolbar"><div class="search-box"><span class="search-symbol">⌕</span><input id="testSearch" type="search" placeholder="Buscar alumno o prueba..." value="${esc(testSearch)}" /></div><span class="text-muted" style="font-size:11px">${rows.length} resultados</span></div>
    ${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Alumno</th><th>Prueba</th><th>Resultado</th><th>Vs. anterior</th><th>Observaciones</th><th></th></tr></thead><tbody>${rows.map(x => {
      const def = getTestDef(x.testId); const history = sortedByDate(db.tests.filter(y => y.studentId === x.studentId && y.testId === x.testId && y.id !== x.id && y.date <= x.date), 'desc');
      const prev = history[0]; let compare = '<span class="text-muted">Primera medición</span>';
      if (prev) { const diff = Number(x.value) - Number(prev.value); const improved = def?.lowerIsBetter ? diff < 0 : diff > 0; const same = diff === 0; const pct = Number(prev.value) ? Math.abs(diff / Number(prev.value) * 100) : 0; compare = `<span class="tag ${same ? '' : improved ? 'green' : 'amber'}">${same ? 'Sin cambio' : improved ? 'Mejoró' : 'Bajó'} ${fmtNum(pct, 1)}%</span>`; }
      return `<tr><td>${fmtDate(x.date)}</td><td>${esc(studentName(x.studentId))}</td><td><strong style="color:#263a50">${esc(def?.name || 'Prueba eliminada')}</strong></td><td><strong style="color:#20384f">${fmtNum(x.value, 2)} ${esc(def?.unit || '')}</strong></td><td>${compare}</td><td title="${esc(x.notes || '')}">${esc((x.notes || '—').slice(0, 35))}${(x.notes || '').length > 35 ? '…' : ''}</td><td><button class="table-action" data-action="delete-test" data-id="${esc(x.id)}">Eliminar</button></td></tr>`;
    }).join('')}</tbody></table></div>` : emptyState('◷', db.tests.length ? 'No hay coincidencias' : 'Registra la primera prueba', db.tests.length ? 'Prueba con otro nombre.' : 'Puedes usar las pruebas preconfiguradas o crear una específica para tu deporte.', db.tests.length ? '' : 'Registrar prueba', db.tests.length ? '' : 'new-test')}</section>`;
}
function renderLibrary() {
  const exercises = db.exercises.filter(e => `${e.name} ${e.category} ${e.equipment}`.toLowerCase().includes(exerciseSearch.toLowerCase()));
  const categories = [...new Set(db.exercises.map(e => e.category))].length;
  pageContent.innerHTML = `${pageHeading('RECURSOS DEL ENTRENADOR', 'Biblioteca de ejercicios', 'Catálogo inicial editable. Añade variantes adaptadas a cada deporte, edad y material.', `<button class="button button-primary" data-action="new-exercise"><span>＋</span> Nuevo ejercicio</button>`)}
    <div class="stats-grid"><article class="stat-card"><div class="stat-top"><span>Ejercicios</span><span class="stat-icon">▤</span></div><div class="stat-value">${db.exercises.length}</div><div class="stat-foot">Recursos disponibles</div></article><article class="stat-card"><div class="stat-top"><span>Categorías</span><span class="stat-icon">◈</span></div><div class="stat-value">${categories}</div><div class="stat-foot">Patrones y capacidades</div></article><article class="stat-card"><div class="stat-top"><span>Pruebas configuradas</span><span class="stat-icon">◷</span></div><div class="stat-value">${db.testDefs.length}</div><div class="stat-foot">Catálogo de evaluaciones</div></article><article class="stat-card"><div class="stat-top"><span>Consejos rápidos</span><span class="stat-icon">✦</span></div><div class="stat-value">${db.students.length}</div><div class="stat-foot">Perfiles para personalizar</div></article></div>
    <div class="table-toolbar panel" style="margin-bottom:15px"><div class="search-box"><span class="search-symbol">⌕</span><input id="exerciseSearch" type="search" placeholder="Buscar ejercicio o categoría..." value="${esc(exerciseSearch)}" /></div><span class="text-muted" style="font-size:11px">${exercises.length} ejercicios</span></div>
    ${exercises.length ? `<div class="exercise-card-grid">${exercises.map(e => `<article class="exercise-card"><div class="exercise-card-top"><h3>${esc(e.name)}</h3><span class="tag cyan">${esc(e.level || 'Personalizado')}</span></div><p>${esc(e.description || 'Sin descripción adicional.')}</p><div class="exercise-card-foot"><span>${esc(e.category)} · ${esc(e.equipment || 'No indicado')}</span><button class="table-action" data-action="edit-exercise" data-id="${esc(e.id)}">Editar</button></div></article>`).join('')}</div>` : `<section class="panel">${emptyState('▤', 'No se encontraron ejercicios', 'Cambia la búsqueda o registra uno nuevo.', 'Añadir ejercicio', 'new-exercise')}</section>`}
    <div class="section-bar"><h2>Pruebas personalizadas</h2><button class="button button-secondary button-small" data-action="new-testdef">＋ Configurar prueba</button></div>
    <section class="panel table-panel"><div class="table-scroll"><table><thead><tr><th>Prueba</th><th>Categoría</th><th>Unidad</th><th>Interpretación</th><th></th></tr></thead><tbody>${db.testDefs.map(t => `<tr><td><strong style="color:#263a50">${esc(t.name)}</strong><div class="text-muted" style="font-size:10px;margin-top:3px">${esc(t.description || '')}</div></td><td>${esc(t.category)}</td><td>${esc(t.unit)}</td><td><span class="tag ${t.lowerIsBetter ? 'amber' : 'green'}">${t.lowerIsBetter ? 'Menor es mejor' : 'Mayor es mejor'}</span></td><td><button class="table-action" data-action="edit-testdef" data-id="${esc(t.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div></section>`;
}
function renderReports() {
  const options = db.students.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.sport ? ` · ${esc(s.sport)}` : ''}</option>`).join('');
  pageContent.innerHTML = `${pageHeading('INFORMES PROFESIONALES', 'Reportes y exportaciones', 'Genera PDF individuales para compartir el progreso y un informe grupal con las fichas completas.', `<button class="button button-primary" data-action="export-group-pdf"><span>↓</span> Informe grupal PDF</button>`)}
    <div class="info-banner"><span class="info-icon">✦</span><div><strong>Informes en PDF:</strong> cada ficha puede incluir edad, deporte, medidas, IMC orientativo, estimación energética si procede, registros de fuerza, pruebas físicas, evolución y recomendaciones. Incluye la fecha de elaboración y notas de interpretación responsable.</div></div>
    <div class="report-grid">
      <article class="panel report-card"><div class="report-icon">♙</div><h3>Informe individual de alumno</h3><p class="report-description">Ficha personalizada con antropometría, cargas, pruebas realizadas, comparación entre primera y última medición y gráficos de progreso cuando hay suficientes datos.</p><label for="pdfStudentSelect" class="field-label">Selecciona al alumno</label><select id="pdfStudentSelect" class="pdf-select" ${db.students.length ? '' : 'disabled'}>${options || '<option value="">Primero registra un alumno</option>'}</select><div class="report-actions"><button class="button button-primary button-small" data-action="export-student-pdf" ${db.students.length ? '' : 'disabled'}>Generar PDF individual</button></div></article>
      <article class="panel report-card"><div class="report-icon">▤</div><h3>Informe grupal completo</h3><p class="report-description">Resumen del grupo y un apartado individual por cada alumno, con historial deportivo y evolución. Adecuado para archivar el seguimiento del equipo.</p><div class="report-actions"><button class="button button-primary button-small" data-action="export-group-pdf" ${db.students.length ? '' : 'disabled'}>Generar PDF grupal</button></div></article>
      <article class="panel report-card"><div class="report-icon">◈</div><h3>Copia de seguridad</h3><p class="report-description">El archivo JSON permite restaurar toda la base de datos de NeuroFit si necesitas una copia adicional. No sustituye los informes PDF para compartir resultados.</p><div class="report-actions"><button class="button button-secondary button-small" data-action="export-json">Descargar respaldo JSON</button></div></article>
      <article class="panel report-card"><div class="report-icon">☁</div><h3>Estado de sincronización</h3><p class="report-description">Los cambios se sincronizan con Supabase. Para usarlo en otros dispositivos, inicia sesión con un correo autorizado y mantén la conexión a internet.</p><div class="kpi-mini-grid"><div class="kpi-mini"><span>Alumnos</span><strong>${db.students.length}</strong></div><div class="kpi-mini"><span>Cargas</span><strong>${db.strengthLogs.length}</strong></div><div class="kpi-mini"><span>Pruebas</span><strong>${db.tests.length}</strong></div></div></article>
      <article class="panel report-card"><div class="report-icon">⚠</div><h3>Privacidad y datos</h3><p class="report-description">Los informes pueden contener información personal y de menores. Compártelos solo con personas autorizadas, evita publicarlos y conserva los archivos en lugares protegidos.</p><div class="report-actions"><span class="tag cyan">Acceso restringido</span></div></article>
      <article class="panel report-card"><div class="report-icon">↻</div><h3>Restablecer el conjunto de datos</h3><p class="report-description">Elimina los alumnos y registros compartidos en la nube para todos los usuarios autorizados. Esta acción no se puede deshacer sin un respaldo previo.</p><div class="report-actions"><button class="button button-danger button-small" data-action="clear-all">Eliminar todos los datos</button></div></article>
    </div>`;
}
function renderProfile(id) {
  const s = getStudent(id);
  if (!s) { activeStudentId = null; setPage('students'); return; }
  const bmi = s.height && s.weight ? Number(s.weight) / ((Number(s.height) / 100) ** 2) : null;
  const age = Number(s.age) || 0;
  const strengthRows = db.strengthLogs.filter(x => x.studentId === id);
  const testRows = db.tests.filter(x => x.studentId === id);
  const sessions = strengthRows.length;
  const uniqueExercises = new Set(strengthRows.map(x => x.exerciseId)).size;
  const latestTests = sortedByDate(testRows).slice(0, 4);
  const recs = recommendationsFor(s);
  const chartOptionMarkup = profileChartMode === 'test'
    ? db.testDefs.map(t => `<option value="${esc(t.id)}" ${t.id === profileTrendId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')
    : db.exercises.map(e => `<option value="${esc(e.id)}" ${e.id === profileTrendId ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  if (!profileTrendId || !(profileChartMode === 'test' ? db.testDefs : db.exercises).some(x => x.id === profileTrendId)) profileTrendId = (profileChartMode === 'test' ? db.testDefs[0]?.id : db.exercises[0]?.id) || null;
  const finalOptions = profileChartMode === 'test'
    ? db.testDefs.map(t => `<option value="${esc(t.id)}" ${t.id === profileTrendId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')
    : db.exercises.map(e => `<option value="${esc(e.id)}" ${e.id === profileTrendId ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  const sexLabel = s.sex === 'male' ? 'Masculino' : s.sex === 'female' ? 'Femenino' : 'No indicado';
  const activityLabel = ({ inactive: 'Baja', low: 'Ligera', active: 'Activa', very: 'Muy activa' })[s.activity] || 'No indicado';
  const actions = `<button class="button button-secondary button-small" data-action="edit-student" data-id="${esc(s.id)}">Editar perfil</button><button class="button button-secondary button-small" data-action="export-student-pdf" data-id="${esc(s.id)}">↓ Informe PDF</button><button class="button button-primary button-small" data-action="new-test"><span>＋</span> Prueba</button><button class="button button-primary button-small" data-action="new-strength"><span>＋</span> Fuerza</button>`;
  pageContent.innerHTML = `<div class="page-heading"><div><p class="eyebrow">PERFIL INDIVIDUAL</p><h1>Seguimiento del alumno</h1><p>Un historial de mediciones, no una comparación con otros deportistas.</p></div><div class="heading-actions"><button class="button button-ghost button-small" data-action="go-students">← Volver a alumnos</button></div></div>
    <section class="profile-hero"><div class="profile-avatar">${esc(initials(s.name))}</div><div class="profile-main"><h1>${esc(s.name)}</h1><div class="profile-meta"><span>${esc(s.sport || 'Deporte no indicado')}</span><span>${s.age ? `${s.age} años` : 'Edad sin registrar'}</span><span>${esc(s.goal || 'Objetivo general')}</span><span>${sexLabel}</span></div></div><div class="profile-actions">${actions}</div></section>
    <div class="stats-grid"><article class="stat-card"><div class="stat-top"><span>Peso registrado</span><span class="stat-icon">↕</span></div><div class="stat-value">${s.weight ? fmtNum(s.weight, 1) : '—'}<span style="font-size:13px;color:#8b99a8">${s.weight ? ' kg' : ''}</span></div><div class="stat-foot">${s.weight ? 'Último dato del perfil' : 'Añade el peso en editar perfil'}</div></article><article class="stat-card"><div class="stat-top"><span>Estatura</span><span class="stat-icon">↕</span></div><div class="stat-value">${s.height ? fmtNum(s.height, 1) : '—'}<span style="font-size:13px;color:#8b99a8">${s.height ? ' cm' : ''}</span></div><div class="stat-foot">${s.height ? 'Último dato del perfil' : 'Añade la estatura en editar perfil'}</div></article><article class="stat-card"><div class="stat-top"><span>IMC calculado</span><span class="stat-icon">◈</span></div><div class="stat-value">${bmi ? fmtNum(bmi, 1) : '—'}</div><div class="stat-foot">${age && age < 20 ? 'En menores de 20, usar IMC por edad' : 'Indicador de cribado, no diagnóstico'}</div></article><article class="stat-card"><div class="stat-top"><span>Registros deportivos</span><span class="stat-icon">▦</span></div><div class="stat-value">${sessions + testRows.length}</div><div class="stat-foot">${sessions} de fuerza · ${testRows.length} pruebas</div></article></div>
    ${age && age < 20 ? `<div class="info-banner warning"><span class="info-icon">ⓘ</span><div><strong>Interpretación del IMC:</strong> en niños y adolescentes, el IMC se interpreta con percentiles según edad y sexo, no con las categorías de adultos. El número mostrado es solo el cálculo kg/m²; no diagnostica ni clasifica composición corporal. <a href="https://www.cdc.gov/bmi/child-teen-calculator/index.html" target="_blank" rel="noopener noreferrer">Consultar referencia CDC ↗</a></div></div>` : ''}
    <div class="profile-grid"><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Curva de evolución</h2><p class="panel-subtitle">Solo compara la misma prueba o ejercicio a lo largo del tiempo.</p></div><span class="tag cyan">Historial individual</span></div><div class="panel-body"><div class="metric-choices" style="margin-bottom:10px"><button class="segment-button ${profileChartMode === 'test' ? 'active' : ''}" data-action="profile-chart-mode" data-mode="test">Pruebas físicas</button><button class="segment-button ${profileChartMode === 'strength' ? 'active' : ''}" data-action="profile-chart-mode" data-mode="strength">Cargas de fuerza</button><select class="toolbar-select" id="profileTrendSelect" style="margin-left:auto">${finalOptions}</select></div><div class="chart-wrap"><canvas id="profileProgressChart"></canvas><div class="chart-empty" id="profileChartEmpty"><div><strong>Sin suficientes datos</strong>Registra dos o más mediciones de esta misma prueba o ejercicio para ver una tendencia.</div></div></div><div id="profileProgressSummary"></div></div></section>
      <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Recomendaciones de seguimiento</h2><p class="panel-subtitle">Orientaciones generales según edad y objetivo.</p></div><span class="tag">Orientativo</span></div><div class="panel-body"><div class="recommendation-list">${recs.map(r => `<div class="recommendation"><span class="recommendation-icon">${r.icon}</span><div><strong>${esc(r.title)}</strong><p>${esc(r.text)}</p></div></div>`).join('')}</div><hr class="divider"><div class="text-muted" style="font-size:10px;line-height:1.7">Ajusta las decisiones al nivel técnico, maduración, historial y respuesta real del deportista. Suspende o modifica una tarea ante dolor o síntomas preocupantes.</div></div></section></div>
    <div class="two-column"><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Últimas pruebas</h2><p class="panel-subtitle">Resultados recientes de ${esc(s.name)}.</p></div><button class="button button-secondary button-small" data-action="new-test">＋ Registrar</button></div><div class="panel-body">${latestTests.length ? `<div class="activity-list">${latestTests.map(t => { const def = getTestDef(t.testId); return `<div class="activity-item"><div class="activity-symbol">◷</div><div><span class="activity-name">${esc(def?.name || 'Prueba eliminada')}</span><span class="activity-meta">${fmtDate(t.date)}</span></div><div class="activity-value">${fmtNum(t.value, 2)} ${esc(def?.unit || '')}<small>${esc(t.notes || 'Sin observaciones').slice(0, 28)}</small></div></div>`; }).join('')}</div>` : `<div class="text-muted" style="font-size:11px;padding:14px 0">Todavía no hay pruebas. Registra una para empezar a medir la evolución.</div>`}</div></section>
      <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Perfil y requerimientos</h2><p class="panel-subtitle">Datos de referencia para contextualizar el entrenamiento.</p></div><button class="table-action" data-action="edit-student" data-id="${esc(s.id)}">Editar ↗</button></div><div class="panel-body"><div class="kpi-mini-grid"><div class="kpi-mini"><span>Actividad declarada</span><strong style="font-size:15px">${activityLabel}</strong><small>Clasificación aproximada</small></div><div class="kpi-mini"><span>Ejercicios registrados</span><strong>${uniqueExercises}</strong><small>Distintos en el historial</small></div><div class="kpi-mini"><span>Sesiones/registros</span><strong>${sessions}</strong><small>Entradas de fuerza</small></div></div><div style="margin-top:14px">${renderEnergyEstimate(s)}</div></div></section></div>
    ${s.notes ? `<section class="panel" style="margin-top:17px"><div class="panel-header"><div><h2 class="panel-title">Notas del entrenador</h2><p class="panel-subtitle">Observaciones no clínicas del seguimiento.</p></div></div><div class="panel-body" style="font-size:12px;color:#63758a;white-space:pre-wrap">${esc(s.notes)}</div></section>` : ''}`;
  requestAnimationFrame(drawProfileChart);
}

function recommendationsFor(s) {
  const age = Number(s.age) || 0;
  const goal = (s.goal || '').toLowerCase();
  const recs = [];
  if (age > 0 && age < 13) {
    recs.push({ icon: '◎', title: 'Aprendizaje motor y técnica', text: 'Prioriza variedad de movimientos, coordinación, equilibrio y tareas lúdicas con objetivos claros; evita que la fatiga degrade la ejecución.' });
    recs.push({ icon: '↗', title: 'Fuerza con supervisión', text: 'La fuerza puede trabajarse con progresión y técnica apropiadas para el desarrollo, supervisión competente y cargas que el alumno controle.' });
  } else if (age >= 13 && age < 18) {
    recs.push({ icon: '◎', title: 'Individualiza por maduración', text: 'La edad cronológica no representa por sí sola la maduración. Observa coordinación, experiencia, crecimiento reciente, carga escolar/deportiva y recuperación.' });
    recs.push({ icon: '↗', title: 'Progresión de fuerza', text: 'Prioriza técnica repetible, sobrecarga gradual, descansos suficientes y registro de RIR/esfuerzo. Evita perseguir máximos cuando el protocolo y la supervisión no lo justifican.' });
  } else if (age >= 18) {
    recs.push({ icon: '↗', title: 'Progresión medible', text: 'Define objetivos, conserva criterios técnicos y ajusta volumen e intensidad según respuesta, experiencia y calendario competitivo.' });
    recs.push({ icon: '◷', title: 'Controla recuperación', text: 'Registra sueño, percepción de esfuerzo y molestias cuando resulte útil; interpreta los datos junto al contexto, no de manera aislada.' });
  } else {
    recs.push({ icon: '◎', title: 'Completa la edad', text: 'Registra una edad aproximada correcta para adaptar mejor las recomendaciones de desarrollo.' });
  }
  if (goal.includes('velocidad') || goal.includes('potencia')) recs.push({ icon: '⚡', title: 'Calidad antes que fatiga', text: 'En velocidad y potencia, usa pocas repeticiones de calidad, descansos amplios y criterios claros para terminar si cae la técnica o el rendimiento.' });
  else if (goal.includes('fuerza') || goal.includes('masa')) recs.push({ icon: '↗', title: 'Usa contexto además de kilos', text: 'Compara carga con repeticiones, series, RIR, rango de movimiento y técnica. Un número aislado no demuestra adaptación.' });
  else if (goal.includes('resistencia')) recs.push({ icon: '◷', title: 'Progresa gradualmente', text: 'Aumenta la carga de resistencia según tolerancia y planificación; combina el registro con sensaciones y recuperación.' });
  else recs.push({ icon: '✦', title: 'Desarrollo integral', text: 'Combina fuerza, velocidad, coordinación, movilidad y resistencia según las necesidades del deporte y la etapa de desarrollo.' });
  recs.push({ icon: '✓', title: 'Evalúa con el mismo protocolo', text: 'Repite las pruebas en condiciones parecidas, toma nota de molestias y evita concluir una tendencia por una sola medición.' });
  return recs.slice(0, 4);
}

function calculateEER(s) {
  const age = Number(s.age), h = Number(s.height), w = Number(s.weight), sex = s.sex, activity = s.activity || 'active';
  if (!age || !h || !w || h <= 0 || w <= 0 || age < 3 || !['male', 'female'].includes(sex)) return null;
  const cm = h;
  const act = ['inactive', 'low', 'active', 'very'].includes(activity) ? activity : 'active';
  let result = 0;
  if (age < 19) {
    const plus = age < 4 ? (sex === 'male' ? 20 : 15) : age < 9 ? 15 : age < 14 ? (sex === 'male' ? 25 : 30) : 20;
    if (sex === 'male') {
      const terms = {
        inactive: -447.51 + 3.68 * age + 13.01 * cm + 13.15 * w,
        low: 19.12 + 3.68 * age + 8.62 * cm + 20.28 * w,
        active: -388.19 + 3.68 * age + 12.66 * cm + 20.46 * w,
        very: -671.75 + 3.68 * age + 15.38 * cm + 23.25 * w
      };
      result = terms[act] + plus;
    } else {
      const terms = {
        inactive: 55.59 - 22.25 * age + 8.43 * cm + 17.07 * w,
        low: -297.54 - 22.25 * age + 12.77 * cm + 14.73 * w,
        active: -189.55 - 22.25 * age + 11.74 * cm + 18.34 * w,
        very: -709.59 - 22.25 * age + 18.22 * cm + 14.25 * w
      };
      result = terms[act] + plus;
    }
  } else {
    if (sex === 'male') {
      const terms = {
        inactive: 753.07 - 10.83 * age + 6.50 * cm + 14.10 * w,
        low: 581.47 - 10.83 * age + 8.30 * cm + 14.94 * w,
        active: 1004.82 - 10.83 * age + 6.52 * cm + 15.91 * w,
        very: -517.88 - 10.83 * age + 15.61 * cm + 19.11 * w
      };
      result = terms[act];
    } else {
      const terms = {
        inactive: 584.90 - 7.01 * age + 5.72 * cm + 11.71 * w,
        low: 575.77 - 7.01 * age + 6.60 * cm + 12.14 * w,
        active: 710.25 - 7.01 * age + 6.54 * cm + 12.34 * w,
        very: 511.83 - 7.01 * age + 9.07 * cm + 12.56 * w
      };
      result = terms[act];
    }
  }
  return Number.isFinite(result) && result > 0 ? Math.round(result) : null;
}
function renderEnergyEstimate(s) {
  const estimate = calculateEER(s);
  if (!estimate) return `<div class="info-banner" style="margin:0"><span class="info-icon">ⓘ</span><div><strong>Estimación energética no disponible.</strong> Completa edad, estatura, peso y sexo utilizado por la ecuación. No es una prescripción nutricional.</div></div>`;
  const age = Number(s.age) || 0;
  const goal = String(s.goal || '').toLowerCase();
  let goalNote;
  if (age < 18) {
    goalNote = 'En etapa de crecimiento, esta cifra es una referencia y NO una meta dietética. No se ajusta para déficit o pérdida de peso. En deportistas jóvenes, cualquier planificación nutricional individual debe realizarse con un profesional cualificado y con participación de su familia/tutores.';
  } else if (goal.includes('masa')) {
    goalNote = 'Prioridad: ganar masa muscular. La cifra es mantenimiento estimado; no añade un superávit automático. Ajustar alimentación de forma gradual según entrenamiento, evolución y tolerancia, idealmente con un nutricionista deportivo.';
  } else if (goal.includes('composición')) {
    goalNote = 'Prioridad: composición corporal. La cifra es mantenimiento estimado; no aplica un déficit automático. Cualquier ajuste debe considerar salud, rendimiento, adherencia y evaluación profesional.';
  } else if (goal.includes('velocidad') || goal.includes('potencia') || goal.includes('resistencia') || goal.includes('rendimiento')) {
    goalNote = 'Prioridad: rendimiento. Usa el cálculo como referencia de mantenimiento; las necesidades pueden variar con los días de carga y competición. Observa energía, recuperación y rendimiento, sin tomar el número como una medición exacta.';
  } else {
    goalNote = 'Es un punto de partida para mantenimiento estimado, no una medición individual. Ajustar según salud, apetito, actividad real y evolución, idealmente con asesoría profesional.';
  }
  return `<div class="nutrition-result"><p class="eyebrow">REQUERIMIENTO ENERGÉTICO ESTIMADO</p><div class="calorie-number">${estimate.toLocaleString('es-PE')} <span style="font-size:12px;font-weight:600;letter-spacing:0">kcal/día</span></div><p>Estimación de energía diaria de referencia según edad, estatura, peso, sexo de la ecuación y nivel de actividad declarada.</p><p class="small-rule">${esc(goalNote)}</p></div>`;
}

function drawProfileChart() {
  const canvas = $('#profileProgressChart');
  if (!canvas || !activeStudentId) return;
  let rows, unit = '', lowerIsBetter = false, metricName = '';
  if (profileChartMode === 'test') {
    const def = getTestDef(profileTrendId);
    rows = sortedByDate(db.tests.filter(x => x.studentId === activeStudentId && x.testId === profileTrendId), 'asc');
    unit = def?.unit || ''; lowerIsBetter = Boolean(def?.lowerIsBetter); metricName = def?.name || 'Prueba';
  } else {
    const ex = getExercise(profileTrendId);
    rows = sortedByDate(db.strengthLogs.filter(x => x.studentId === activeStudentId && x.exerciseId === profileTrendId), 'asc');
    unit = 'kg'; metricName = ex?.name || 'Ejercicio';
  }
  const chartRows = rows.map(r => ({ label: fmtDate(r.date, { day: '2-digit', month: 'short' }), value: profileChartMode === 'test' ? Number(r.value) : Number(r.load) }));
  const empty = $('#profileChartEmpty');
  if (empty) empty.hidden = chartRows.length >= 2;
  drawLineChart(canvas, chartRows, unit, { lowerIsBetter });
  const summary = $('#profileProgressSummary');
  if (summary) {
    if (chartRows.length >= 2) {
      const first = chartRows[0].value, last = chartRows[chartRows.length - 1].value;
      const diff = last - first;
      const improved = profileChartMode === 'test' && lowerIsBetter ? diff < 0 : diff > 0;
      const same = Math.abs(diff) < 0.00001;
      const percent = first ? Math.abs(diff / first * 100) : 0;
      const status = same ? 'Sin cambio neto' : improved ? (profileChartMode === 'test' && lowerIsBetter ? 'Menor tiempo: mejora' : 'Mejora en el valor') : (profileChartMode === 'test' && lowerIsBetter ? 'Mayor tiempo: revisar contexto' : 'Menor valor: revisar contexto');
      summary.innerHTML = `<div class="progress-summary"><strong class="${same ? '' : improved ? '' : 'decline'}">${same ? '0%' : `${improved ? '+' : '−'}${fmtNum(percent, 1)}%`}</strong><p><strong>${esc(status)}</strong><br>${esc(metricName)} · ${fmtNum(first, 2)} → ${fmtNum(last, 2)} ${esc(unit)} · ${chartRows.length} mediciones. La interpretación depende del protocolo y la técnica.</p></div>`;
    } else {
      summary.innerHTML = `<div class="progress-summary"><strong style="color:#73869b">${chartRows.length}/2</strong><p><strong>Aún no hay una tendencia comparable</strong><br>Necesitas al menos dos mediciones de ${esc(metricName)} en fechas distintas.</p></div>`;
    }
  }
}

function drawLineChart(canvas, rows, unit = '', options = {}) {
  const ctx = canvas.getContext('2d');
  const cssWidth = Math.max(280, canvas.clientWidth || 600);
  const cssHeight = Math.max(180, canvas.clientHeight || 245);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr); canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const valid = rows.filter(r => Number.isFinite(r.value));
  const pad = { left: 44, right: 12, top: 15, bottom: 31 };
  const w = cssWidth - pad.left - pad.right, h = cssHeight - pad.top - pad.bottom;
  ctx.font = '10px DM Sans, sans-serif';
  ctx.textBaseline = 'middle';
  if (valid.length < 1) {
    ctx.fillStyle = '#a5b1bf'; ctx.textAlign = 'center';
    ctx.fillText('Sin datos suficientes', cssWidth / 2, cssHeight / 2);
    return;
  }
  let min = Math.min(...valid.map(r => r.value)); let max = Math.max(...valid.map(r => r.value));
  if (min === max) { const spread = Math.abs(min) * .08 || 1; min -= spread; max += spread; }
  const margin = (max - min) * .16; min -= margin; max += margin;
  const x = i => pad.left + (valid.length === 1 ? w / 2 : i / (valid.length - 1) * w);
  const y = v => pad.top + (max - v) / (max - min) * h;
  ctx.strokeStyle = '#edf1f5'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yy = pad.top + h * i / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(cssWidth - pad.right, yy); ctx.stroke();
    const val = max - (max - min) * i / 4;
    ctx.fillStyle = '#94a1b0'; ctx.textAlign = 'right';
    ctx.fillText(`${fmtNum(val, 1)}${unit ? ` ${unit}` : ''}`, pad.left - 7, yy);
  }
  ctx.beginPath(); valid.forEach((r, i) => { if (i === 0) ctx.moveTo(x(i), y(r.value)); else ctx.lineTo(x(i), y(r.value)); });
  ctx.strokeStyle = '#38bdd6'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  if (valid.length > 1) {
    ctx.lineTo(x(valid.length - 1), pad.top + h); ctx.lineTo(x(0), pad.top + h); ctx.closePath();
    ctx.fillStyle = 'rgba(94,214,238,.10)'; ctx.fill();
    ctx.beginPath(); valid.forEach((r, i) => { if (i === 0) ctx.moveTo(x(i), y(r.value)); else ctx.lineTo(x(i), y(r.value)); }); ctx.strokeStyle = '#38bdd6'; ctx.lineWidth = 2.5; ctx.stroke();
  }
  valid.forEach((r, i) => {
    ctx.beginPath(); ctx.arc(x(i), y(r.value), i === valid.length - 1 ? 4 : 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#28a9c4'; ctx.stroke();
  });
  ctx.fillStyle = '#8997a7'; ctx.textAlign = 'center';
  const labelIndexes = valid.length <= 5 ? valid.map((_, i) => i) : [0, Math.floor((valid.length - 1) / 2), valid.length - 1];
  [...new Set(labelIndexes)].forEach(i => ctx.fillText(valid[i].label, x(i), cssHeight - 12));
}

function studentOptions(selected = '') {
  return `<option value="">Seleccionar alumno...</option>${db.students.map(s => `<option value="${esc(s.id)}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)} · ${esc(s.sport || 'Deporte no indicado')}</option>`).join('')}`;
}
function exerciseOptions(selected = '') {
  return db.exercises.map(e => `<option value="${esc(e.id)}" ${e.id === selected ? 'selected' : ''}>${esc(e.name)} (${esc(e.category)})</option>`).join('');
}
function testOptions(selected = '') {
  return db.testDefs.map(t => `<option value="${esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)} · ${esc(t.unit)}</option>`).join('');
}
function openModal(title, eyebrow, content, state = null) {
  modalState = state;
  $('#modalTitle').textContent = title;
  $('#modalEyebrow').textContent = eyebrow;
  $('#modalBody').innerHTML = content;
  modalBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#modalBody input:not([type="hidden"]), #modalBody select, #modalBody textarea')?.focus(), 40);
}
function closeModal() {
  modalBackdrop.hidden = true;
  document.body.style.overflow = '';
  modalState = null;
}
function modalFooter(cancelLabel = 'Cancelar', saveLabel = 'Guardar registro') {
  return `<div class="modal-footer"><button type="button" class="button button-secondary" data-action="close-modal">${cancelLabel}</button><button type="submit" class="button button-primary"><span>✓</span>${saveLabel}</button></div>`;
}
function openStudentForm(studentId = null) {
  const s = studentId ? getStudent(studentId) : null;
  const f = s || { name: '', sport: 'Tenis', age: '', sex: '', height: '', weight: '', goal: 'Rendimiento deportivo', activity: 'active', notes: '' };
  const goals = ['Rendimiento deportivo', 'Fuerza', 'Velocidad', 'Potencia', 'Resistencia', 'Ganar masa muscular', 'Mejorar composición corporal', 'Coordinación y agilidad', 'Salud y desarrollo general', 'Movilidad'];
  const content = `<form id="studentForm" data-form="student"><input type="hidden" name="id" value="${esc(f.id || '')}"/><div class="form-grid">
    <div class="field full"><label for="studentName">Nombre del alumno *</label><input id="studentName" name="name" required maxlength="90" value="${esc(f.name)}" placeholder="Nombre y apellido" /></div>
    <div class="field"><label for="studentSport">Deporte principal</label><select id="studentSport" name="sport"><option ${f.sport === 'Tenis' ? 'selected' : ''}>Tenis</option><option ${f.sport === 'Fútbol' ? 'selected' : ''}>Fútbol</option><option ${f.sport === 'Baloncesto' ? 'selected' : ''}>Baloncesto</option><option ${f.sport === 'Vóley' ? 'selected' : ''}>Vóley</option><option ${f.sport === 'Atletismo' ? 'selected' : ''}>Atletismo</option><option ${f.sport === 'Natación' ? 'selected' : ''}>Natación</option><option ${f.sport === 'Multideporte' ? 'selected' : ''}>Multideporte</option><option value="Otro" ${!['Tenis','Fútbol','Baloncesto','Vóley','Atletismo','Natación','Multideporte'].includes(f.sport) ? 'selected' : ''}>Otro</option></select></div>
    <div class="field"><label for="studentAge">Edad (años) *</label><input id="studentAge" name="age" type="number" min="3" max="100" step="1" required value="${esc(f.age)}" placeholder="Ej. 13" /><small>Para ajustar las recomendaciones por etapa de desarrollo.</small></div>
    <div class="field"><label for="studentSex">Sexo utilizado por ecuación energética</label><select id="studentSex" name="sex"><option value="" ${!f.sex ? 'selected' : ''}>No indicar</option><option value="male" ${f.sex === 'male' ? 'selected' : ''}>Masculino</option><option value="female" ${f.sex === 'female' ? 'selected' : ''}>Femenino</option></select><small>Opcional; sin este dato no se calcula la estimación de kcal.</small></div>
    <div class="field"><label for="studentHeight">Estatura (cm)</label><input id="studentHeight" name="height" type="number" min="50" max="250" step="0.1" value="${esc(f.height)}" placeholder="Ej. 158" /></div>
    <div class="field"><label for="studentWeight">Peso (kg)</label><input id="studentWeight" name="weight" type="number" min="10" max="350" step="0.1" value="${esc(f.weight)}" placeholder="Ej. 48.5" /></div>
    <div class="field"><label for="studentGoal">Prioridad de entrenamiento</label><select id="studentGoal" name="goal">${goals.map(g => `<option ${g === f.goal ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
    <div class="field"><label for="studentActivity">Nivel de actividad general</label><select id="studentActivity" name="activity"><option value="inactive" ${f.activity === 'inactive' ? 'selected' : ''}>Inactivo</option><option value="low" ${f.activity === 'low' ? 'selected' : ''}>Poco activo</option><option value="active" ${!f.activity || f.activity === 'active' ? 'selected' : ''}>Activo</option><option value="very" ${f.activity === 'very' ? 'selected' : ''}>Muy activo</option></select><small>Escoge el nivel más parecido a la actividad habitual total, no solo al entrenamiento de hoy.</small></div>
    <div class="field full"><label for="studentNotes">Notas del entrenador (opcional)</label><textarea id="studentNotes" name="notes" maxlength="1200" placeholder="Observaciones de entrenamiento, objetivos y criterios de seguimiento. Evita registrar información privada innecesaria.">${esc(f.notes || '')}</textarea></div>
    <div class="full"><div class="info-banner" style="margin:0"><span class="info-icon">ⓘ</span><div>Si el alumno es menor, la estimación energética y el IMC son referencias limitadas. No se generan objetivos de pérdida de peso ni dietas automáticas.</div></div></div>
    </div>${modalFooter('Cancelar', s ? 'Guardar cambios' : 'Crear perfil')}</form>`;
  openModal(s ? 'Editar alumno' : 'Nuevo alumno', 'PERFIL DEPORTIVO', content, { type: 'student', id: studentId });
}
function openStrengthForm() {
  if (!db.students.length) { toast('Primero registra un alumno'); openStudentForm(); return; }
  if (!db.exercises.length) { toast('Añade un ejercicio a la biblioteca'); openExerciseForm(); return; }
  const preselectedStudent = activeStudentId || db.students[0].id;
  const content = `<form id="strengthForm" data-form="strength"><div class="form-grid">
    <div class="field full"><label>Alumno *</label><select name="studentId" required>${studentOptions(preselectedStudent)}</select></div>
    <div class="field"><label>Fecha *</label><input type="date" name="date" value="${todayISO()}" required /></div>
    <div class="field"><label>Ejercicio *</label><select name="exerciseId" required>${exerciseOptions()}</select></div>
    <div class="field"><label>Carga externa (kg)</label><input type="number" name="load" min="0" max="1000" step="0.25" value="0" required /><small>Si es peso corporal/sin carga externa, deja 0.</small></div>
    <div class="field"><label>Series *</label><input type="number" name="sets" min="1" max="100" step="1" value="3" required /></div>
    <div class="field"><label>Repeticiones por serie *</label><input type="number" name="reps" min="1" max="500" step="1" value="8" required /></div>
    <div class="field"><label>RIR al terminar las series</label><select name="rir"><option value="">No registrado</option>${[0,1,2,3,4,5,6].map(n => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${n} RIR</option>`).join('')}</select><small>RIR = repeticiones estimadas en reserva; es una percepción, no una medición exacta.</small></div>
    <div class="field full"><label>Notas de sesión</label><textarea name="notes" maxlength="800" placeholder="Técnica, descanso, esfuerzo, contexto o modificación realizada..."></textarea></div>
    </div>${modalFooter('Cancelar', 'Guardar carga')}</form>`;
  openModal('Registrar carga', 'SESIÓN DE FUERZA', content, { type: 'strength' });
}
function openTestForm() {
  if (!db.students.length) { toast('Primero registra un alumno'); openStudentForm(); return; }
  if (!db.testDefs.length) { toast('Configura al menos una prueba'); openTestDefForm(); return; }
  const preselectedStudent = activeStudentId || db.students[0].id;
  const preselectedTest = db.testDefs.find(x => x.id === 'test-baseline-net')?.id || db.testDefs[0].id;
  const content = `<form id="testForm" data-form="test"><div class="form-grid">
    <div class="field full"><label>Alumno *</label><select name="studentId" required>${studentOptions(preselectedStudent)}</select></div>
    <div class="field"><label>Fecha *</label><input type="date" name="date" value="${todayISO()}" required /></div>
    <div class="field"><label>Prueba *</label><select name="testId" id="testFormDefSelect" required>${testOptions(preselectedTest)}</select></div>
    <div class="field"><label>Resultado numérico *</label><input type="number" name="value" step="any" required min="0" placeholder="Ej. 2.45" /></div>
    <div class="field"><label>Intento</label><input type="text" name="attempt" maxlength="40" placeholder="Ej. intento 1 / mejor de 3" /></div>
    <div class="field full"><label>Protocolo / observaciones</label><textarea name="notes" maxlength="1000" placeholder="Distancia real, salida, superficie, dispositivo, condiciones, descanso entre intentos..."> </textarea><small>Registra siempre la distancia y las condiciones cuando afecten el resultado. No compares cronometraje manual con electrónico como si fueran idénticos.</small></div>
    </div>${modalFooter('Cancelar', 'Guardar resultado')}</form>`;
  openModal('Registrar prueba física', 'EVALUACIÓN', content, { type: 'test' });
}
function openExerciseForm(exerciseId = null) {
  const ex = exerciseId ? getExercise(exerciseId) : null;
  const f = ex || { name: '', category: 'Fuerza de piernas', equipment: '', level: 'Inicial', description: '' };
  const cats = ['Fuerza de piernas', 'Unilateral', 'Cadena posterior', 'Empuje', 'Tracción', 'Potencia', 'Velocidad', 'Agilidad', 'Movilidad', 'Control del tronco', 'Coordinación', 'Resistencia', 'Otro'];
  const content = `<form id="exerciseForm" data-form="exercise"><input type="hidden" name="id" value="${esc(f.id || '')}"/><div class="form-grid">
    <div class="field full"><label>Nombre del ejercicio *</label><input name="name" required maxlength="100" value="${esc(f.name)}" placeholder="Ej. Salida lateral y aceleración" /></div>
    <div class="field"><label>Categoría</label><select name="category">${cats.map(c => `<option ${c === f.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label>Nivel sugerido</label><select name="level"><option ${f.level === 'Inicial' ? 'selected' : ''}>Inicial</option><option ${f.level === 'Intermedio' ? 'selected' : ''}>Intermedio</option><option ${f.level === 'Avanzado' ? 'selected' : ''}>Avanzado</option><option ${f.level === 'Personalizado' ? 'selected' : ''}>Personalizado</option></select></div>
    <div class="field full"><label>Material necesario</label><input name="equipment" maxlength="120" value="${esc(f.equipment)}" placeholder="Ej. conos, escalera, balón medicinal..." /></div>
    <div class="field full"><label>Descripción / criterio técnico</label><textarea name="description" maxlength="500" placeholder="Objetivo, consigna técnica y variantes...">${esc(f.description)}</textarea></div>
    </div>${modalFooter('Cancelar', ex ? 'Guardar cambios' : 'Añadir ejercicio')}</form>`;
  openModal(ex ? 'Editar ejercicio' : 'Añadir ejercicio', 'BIBLIOTECA', content, { type: 'exercise', id: exerciseId });
}
function openTestDefForm(testId = null) {
  const t = testId ? getTestDef(testId) : null;
  const f = t || { name: '', category: 'Velocidad', unit: 's', lowerIsBetter: true, description: '' };
  const cats = ['Velocidad', 'Fuerza', 'Fuerza-resistencia', 'Potencia', 'Resistencia', 'Agilidad', 'Movilidad', 'Control del tronco', 'Composición / medidas', 'Otro'];
  const content = `<form id="testDefForm" data-form="testdef"><input type="hidden" name="id" value="${esc(f.id || '')}"/><div class="form-grid">
    <div class="field full"><label>Nombre de la prueba *</label><input name="name" required maxlength="100" value="${esc(f.name)}" placeholder="Ej. Desplazamiento lateral 5-5-5" /></div>
    <div class="field"><label>Categoría</label><select name="category">${cats.map(c => `<option ${c === f.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label>Unidad de medida *</label><select name="unit"><option value="s" ${f.unit === 's' ? 'selected' : ''}>Segundos (s)</option><option value="m" ${f.unit === 'm' ? 'selected' : ''}>Metros (m)</option><option value="cm" ${f.unit === 'cm' ? 'selected' : ''}>Centímetros (cm)</option><option value="kg" ${f.unit === 'kg' ? 'selected' : ''}>Kilogramos (kg)</option><option value="reps" ${f.unit === 'reps' ? 'selected' : ''}>Repeticiones</option><option value="min" ${f.unit === 'min' ? 'selected' : ''}>Minutos (min)</option><option value="pts" ${f.unit === 'pts' ? 'selected' : ''}>Puntos</option></select></div>
    <div class="field full"><label>Qué significa mejorar *</label><select name="lowerIsBetter"><option value="true" ${f.lowerIsBetter ? 'selected' : ''}>Menor valor es mejor (ej. tiempo)</option><option value="false" ${!f.lowerIsBetter ? 'selected' : ''}>Mayor valor es mejor (ej. distancia)</option></select><small>El criterio se utiliza para mostrar la tendencia; no es un juicio clínico.</small></div>
    <div class="field full"><label>Protocolo sugerido</label><textarea name="description" maxlength="600" placeholder="Distancia, salida, material y criterios de medición...">${esc(f.description || '')}</textarea></div>
    </div>${modalFooter('Cancelar', t ? 'Guardar cambios' : 'Crear prueba')}</form>`;
  openModal(t ? 'Editar prueba' : 'Configurar prueba', 'CATÁLOGO DE EVALUACIONES', content, { type: 'testdef', id: testId });
}

function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportJSON() {
  const backup = { ...db, exportedAt: new Date().toISOString(), app: 'NeuroFit Performance Lab' };
  downloadFile(`neurofit-copia-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
  toast('Copia de seguridad preparada', 'Guárdala en un lugar privado y seguro.');
}
function toCSV(rows) {
  return '\ufeff' + rows.map(row => row.map(v => {
    const str = String(v ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}
function exportStudentsCSV() {
  const rows = [['ID', 'Nombre', 'Deporte', 'Edad', 'Sexo ecuación', 'Estatura_cm', 'Peso_kg', 'Objetivo', 'Actividad', 'Notas']];
  db.students.forEach(s => rows.push([s.id, s.name, s.sport, s.age, s.sex, s.height, s.weight, s.goal, s.activity, s.notes]));
  downloadFile(`neurofit-alumnos-${todayISO()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}
function exportStrengthCSV() {
  const rows = [['ID', 'Fecha', 'Alumno', 'Ejercicio', 'Carga_kg', 'Series', 'Repeticiones', 'RIR', 'Notas']];
  db.strengthLogs.forEach(x => rows.push([x.id, x.date, studentName(x.studentId), getExercise(x.exerciseId)?.name, x.load, x.sets, x.reps, x.rir, x.notes]));
  downloadFile(`neurofit-cargas-${todayISO()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}
function exportTestsCSV() {
  const rows = [['ID', 'Fecha', 'Alumno', 'Prueba', 'Resultado', 'Unidad', 'Menor_es_mejor', 'Intento', 'Observaciones']];
  db.tests.forEach(x => { const t = getTestDef(x.testId); rows.push([x.id, x.date, studentName(x.studentId), t?.name, x.value, t?.unit, t?.lowerIsBetter, x.attempt, x.notes]); });
  downloadFile(`neurofit-pruebas-${todayISO()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}
function importJSONFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed || !Array.isArray(parsed.students) || !Array.isArray(parsed.strengthLogs) || !Array.isArray(parsed.tests) || !Array.isArray(parsed.exercises) || !Array.isArray(parsed.testDefs)) throw new Error('Formato incorrecto');
      if (!confirm('La restauración reemplazará los datos actuales de este navegador. ¿Has guardado una copia de seguridad y deseas continuar?')) return;
      db = { students: parsed.students, strengthLogs: parsed.strengthLogs, tests: parsed.tests, exercises: parsed.exercises, testDefs: parsed.testDefs, version: 1 };
      saveDB(); studentSearch = ''; strengthSearch = ''; testSearch = ''; exerciseSearch = ''; activeStudentId = null; currentPage = 'dashboard';
      renderPage(); toast('Copia restaurada correctamente');
    } catch (e) { toast('No se pudo importar el archivo', 'Comprueba que sea una copia JSON válida de NeuroFit.'); }
  };
  reader.onerror = () => toast('No se pudo leer el archivo');
  reader.readAsText(file);
}

function formValues(form) {
  const data = new FormData(form); const obj = {};
  for (const [key, val] of data.entries()) obj[key] = typeof val === 'string' ? val.trim() : val;
  return obj;
}
function handleFormSubmit(form) {
  const type = form.dataset.form;
  const v = formValues(form);
  if (type === 'student') {
    const student = { id: v.id || uid('student'), name: v.name, sport: v.sport || 'Otro', age: Number(v.age), sex: v.sex || '', height: v.height ? Number(v.height) : '', weight: v.weight ? Number(v.weight) : '', goal: v.goal || 'Rendimiento deportivo', activity: v.activity || 'active', notes: v.notes || '' };
    if (!student.name || !Number.isFinite(student.age) || student.age < 3 || student.age > 100) { toast('Revisa el nombre y la edad'); return; }
    const i = db.students.findIndex(x => x.id === student.id);
    if (i >= 0) db.students[i] = student; else db.students.push(student);
    activeStudentId = student.id; currentPage = 'students'; profileChartMode = 'test'; profileTrendId = db.testDefs[0]?.id || null;
    saveDB(); closeModal(); renderPage(); updateNavAndCrumb(); toast(i >= 0 ? 'Perfil actualizado' : 'Alumno registrado', student.name);
  } else if (type === 'strength') {
    if (!getStudent(v.studentId) || !getExercise(v.exerciseId)) { toast('Selecciona un alumno y un ejercicio válidos'); return; }
    const row = { id: uid('load'), studentId: v.studentId, date: v.date || todayISO(), exerciseId: v.exerciseId, load: Number(v.load), sets: Number(v.sets), reps: Number(v.reps), rir: v.rir === '' ? '' : Number(v.rir), notes: v.notes || '' };
    if (![row.load, row.sets, row.reps].every(Number.isFinite) || row.load < 0 || row.sets < 1 || row.reps < 1) { toast('Revisa los valores de carga, series y repeticiones'); return; }
    db.strengthLogs.push(row); saveDB(); closeModal(); renderPage(); toast('Carga guardada', `${studentName(row.studentId)} · ${getExercise(row.exerciseId).name}`);
  } else if (type === 'test') {
    if (!getStudent(v.studentId) || !getTestDef(v.testId)) { toast('Selecciona un alumno y una prueba válidos'); return; }
    const row = { id: uid('test'), studentId: v.studentId, date: v.date || todayISO(), testId: v.testId, value: Number(v.value), attempt: v.attempt || '', notes: (v.notes || '').trim() };
    if (!Number.isFinite(row.value) || row.value < 0) { toast('Introduce un resultado numérico válido'); return; }
    db.tests.push(row); saveDB(); closeModal(); profileChartMode = 'test'; profileTrendId = row.testId; renderPage(); toast('Resultado guardado', `${studentName(row.studentId)} · ${getTestDef(row.testId).name}`);
  } else if (type === 'exercise') {
    const item = { id: v.id || uid('exercise'), name: v.name, category: v.category || 'Otro', equipment: v.equipment || '', level: v.level || 'Inicial', description: v.description || '' };
    if (!item.name) { toast('Escribe el nombre del ejercicio'); return; }
    const i = db.exercises.findIndex(x => x.id === item.id);
    if (i >= 0) db.exercises[i] = item; else db.exercises.push(item);
    saveDB(); closeModal(); currentPage = 'library'; activeStudentId = null; renderPage(); toast(i >= 0 ? 'Ejercicio actualizado' : 'Ejercicio añadido', item.name);
  } else if (type === 'testdef') {
    const item = { id: v.id || uid('testdef'), name: v.name, category: v.category || 'Otro', unit: v.unit || 'pts', lowerIsBetter: v.lowerIsBetter === 'true', description: v.description || '' };
    if (!item.name) { toast('Escribe el nombre de la prueba'); return; }
    const i = db.testDefs.findIndex(x => x.id === item.id);
    if (i >= 0) db.testDefs[i] = item; else db.testDefs.push(item);
    saveDB(); closeModal(); currentPage = 'library'; activeStudentId = null; profileTrendId = item.id; profileChartMode = 'test'; renderPage(); toast(i >= 0 ? 'Prueba actualizada' : 'Prueba configurada', item.name);
  }
}
function updateNavAndCrumb() {
  $('#studentNavCount').textContent = db.students.length;
  if (activeStudentId) $('#pageCrumb').textContent = studentName(activeStudentId);
}
function deleteStrength(id) {
  if (!confirm('¿Eliminar este registro de carga? Esta acción no se puede deshacer sin una copia.')) return;
  db.strengthLogs = db.strengthLogs.filter(x => x.id !== id); saveDB(); renderPage(); toast('Registro de fuerza eliminado');
}
function deleteTest(id) {
  if (!confirm('¿Eliminar este resultado de prueba? Esta acción no se puede deshacer sin una copia.')) return;
  db.tests = db.tests.filter(x => x.id !== id); saveDB(); renderPage(); toast('Resultado eliminado');
}
function deleteStudent(id) {
  const s = getStudent(id); if (!s) return;
  if (!confirm(`Se eliminará el perfil de ${s.name}, junto con sus registros de fuerza y pruebas. ¿Continuar?`)) return;
  db.students = db.students.filter(x => x.id !== id); db.strengthLogs = db.strengthLogs.filter(x => x.studentId !== id); db.tests = db.tests.filter(x => x.studentId !== id);
  saveDB(); activeStudentId = null; currentPage = 'students'; renderPage(); toast('Perfil eliminado');
}
function viewProfile(id) {
  if (!getStudent(id)) return;
  activeStudentId = id; currentPage = 'students'; $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === 'students'));
  $('#pageCrumb').textContent = studentName(id); renderProfile(id); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function closeMobileMenu() { $('#sidebar').classList.remove('open'); $('#mobileScrim').classList.remove('show'); }


// ---------------------- Supabase: correo autorizado + base compartida ----------------------
function setAuthMessage(message, type = '') {
  const el = $('#authMessage'); if (!el) return;
  el.textContent = message; el.className = `auth-message ${type}`.trim();
}
function setSyncStatus(message, state = 'ok') {
  const badge = $('#syncBadge');
  if (badge) { badge.className = `local-badge sync-${state}`; badge.innerHTML = `<span class="status-dot"></span> ${esc(message)}`; }
  const foot = $('.sidebar-footer');
  if (foot) foot.innerHTML = `<span class="status-dot"></span><span>${esc(message)}</span>`;
}
function showAuthGate() {
  $('#authGate').hidden = false; $('#authGate').style.display = 'grid';
  $('#appShell').hidden = true; $('#appShell').style.display = 'none';
}
function showApplication(user) {
  $('#authGate').hidden = true; $('#authGate').style.display = 'none';
  $('#appShell').hidden = false; $('#appShell').style.display = 'flex';
  if ($('#accountEmail')) $('#accountEmail').textContent = user.email || 'Cuenta autorizada';
  if ($('#accountAvatar')) $('#accountAvatar').textContent = initials(user.email || 'PF');
}
async function initializeAuth() {
  const url = String(window.NEUROFIT_SUPABASE_URL || '');
  const key = String(window.NEUROFIT_SUPABASE_ANON_KEY || '');
  const configured = url.startsWith('https://') && !url.includes('TU-PROYECTO') && key.length > 20 && !key.includes('PEGA_AQUI');
  const form = $('#authForm');
  if (!configured || !window.supabase?.createClient) {
    if ($('#authSubmit')) $('#authSubmit').disabled = true;
    showAuthGate();
    setAuthMessage('Supabase todavía no está configurado. Completa supabase-config.js y ejecuta supabase-setup.sql en tu proyecto antes de iniciar sesión.');
    return;
  }
  if ($('#authSubmit')) $('#authSubmit').disabled = false;
  supabaseClient = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = String($('#authEmail')?.value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) { setAuthMessage('Escribe un correo electrónico válido.', 'error'); return; }
    const btn = $('#authSubmit'); if (btn) { btn.disabled = true; btn.textContent = 'Enviando enlace…'; }
    setAuthMessage('Solicitando el enlace seguro de acceso…');
    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}${window.location.pathname}` }
      });
      if (error) throw error;
      setAuthMessage('Solicitud enviada. Revisa la bandeja de entrada y el correo no deseado. Solo pueden acceder correos que ya hayan sido autorizados en Supabase.', 'success');
    } catch (error) {
      setAuthMessage(`No se pudo enviar el enlace: ${error.message || 'error de autenticación'}. Comprueba que el correo esté invitado y que la URL de redirección esté permitida en Supabase.`, 'error');
    } finally { if (btn) { btn.disabled = false; btn.innerHTML = 'Enviar enlace de acceso <span>→</span>'; } }
  });
  $('#signOutButton')?.addEventListener('click', async () => {
    setSyncStatus('Cerrando sesión…', 'pending');
    const { error } = await supabaseClient.auth.signOut();
    if (error) toast('No se pudo cerrar la sesión', error.message);
    else { cloudReady = false; currentUser = null; cloudBootingUserId = null; if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel); showAuthGate(); setAuthMessage('Sesión cerrada. Ingresa con un correo autorizado para continuar.'); }
  });
  supabaseClient.auth.onAuthStateChange((event, session) => {
    // Evita ejecutar operaciones de base de datos dentro del callback de Auth.
    setTimeout(() => {
      if (session?.user) bootCloudSession(session.user);
      else if (event === 'SIGNED_OUT') { cloudReady = false; currentUser = null; showAuthGate(); }
    }, 0);
  });
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) { showAuthGate(); setAuthMessage(`No se pudo comprobar la sesión: ${error.message}`, 'error'); return; }
  if (data.session?.user) await bootCloudSession(data.session.user);
  else showAuthGate();
}
let cloudBootPromise = null;
async function bootCloudSession(user) {
  if (!supabaseClient || !user) return;
  if (cloudReady && currentUser?.id === user.id) { showApplication(user); return; }
  if (cloudBootingUserId === user.id && cloudBootPromise) return cloudBootPromise;
  cloudBootingUserId = user.id; currentUser = user;
  setAuthMessage('Verificando acceso y cargando los datos de NeuroFit…');
  cloudBootPromise = (async () => {
    try {
      const { data: row, error } = await supabaseClient.from('neurofit_data').select('payload, updated_at').eq('id', CLOUD_ROW_ID).maybeSingle();
      if (error) throw error;
      if (row?.payload && Array.isArray(row.payload.students)) {
        applyingCloudData = true;
        db = normalizeDB(row.payload);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        applyingCloudData = false;
      } else {
        // Primera conexión: migra los registros locales existentes a la nube.
        db = loadDB();
        const { error: seedError } = await supabaseClient.from('neurofit_data').upsert({
          id: CLOUD_ROW_ID, payload: db, updated_at: new Date().toISOString(), updated_by: user.id, source_id: CLIENT_ID
        }, { onConflict: 'id' });
        if (seedError) throw seedError;
      }
      cloudReady = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      subscribeToCloud();
      showApplication(user);
      setSyncStatus('Sincronizado en la nube', 'ok');
      renderPage();
    } catch (error) {
      applyingCloudData = false; cloudReady = false;
      showAuthGate();
      setAuthMessage(`No se pudo conectar a la base de datos: ${error.message || 'error desconocido'}. Revisa que hayas ejecutado supabase-setup.sql y que el proyecto/clave sean correctos.`, 'error');
    } finally {
      if (cloudBootingUserId === user.id) cloudBootingUserId = null;
      cloudBootPromise = null;
    }
  })();
  return cloudBootPromise;
}
function subscribeToCloud() {
  if (!supabaseClient) return;
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = supabaseClient.channel('neurofit-cloud-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'neurofit_data', filter: `id=eq.${CLOUD_ROW_ID}` }, payload => {
      const remote = payload.new;
      if (!remote?.payload || remote.source_id === CLIENT_ID || !Array.isArray(remote.payload.students)) return;
      applyingCloudData = true;
      db = normalizeDB(remote.payload);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch (_) {}
      applyingCloudData = false;
      setSyncStatus('Cambios recibidos', 'ok');
      if (modalBackdrop.hidden) renderPage();
      toast('Datos actualizados desde la nube', 'Se recibieron cambios de otro dispositivo.');
    }).subscribe(status => {
      if (status === 'SUBSCRIBED') setSyncStatus('Sincronizado en la nube', 'ok');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncStatus('Revisar conexión', 'error');
    });
}
function queueCloudSave() {
  if (!cloudReady || applyingCloudData || !supabaseClient || !currentUser) return;
  setSyncStatus('Guardando cambios…', 'pending');
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    syncPromise = syncPromise.catch(() => {}).then(syncDBToCloud);
  }, 500);
}
async function syncDBToCloud() {
  if (!cloudReady || !currentUser || !supabaseClient) return;
  const payload = JSON.parse(JSON.stringify(db));
  const { error } = await supabaseClient.from('neurofit_data').upsert({
    id: CLOUD_ROW_ID, payload, updated_at: new Date().toISOString(), updated_by: currentUser.id, source_id: CLIENT_ID
  }, { onConflict: 'id' });
  if (error) {
    setSyncStatus('Error de sincronización', 'error');
    toast('No se pudo sincronizar', error.message || 'Comprueba tu conexión a internet.');
    return;
  }
  setSyncStatus('Sincronizado en la nube', 'ok');
}

// ---------------------- Exportaciones PDF de marca ----------------------
const PDF_NAVY = [7, 23, 45];
const PDF_CYAN = [45, 184, 211];
const PDF_MUTED = [102, 119, 139];
const PDF_LIGHT = [241, 246, 250];
let PDF_LOGO_DATA = null;
let pdfLogoAttempted = false;
async function loadPdfLogo() {
  if (pdfLogoAttempted) return PDF_LOGO_DATA;
  pdfLogoAttempted = true;
  try {
    PDF_LOGO_DATA = await new Promise(resolve => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { try { const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth || 256; canvas.height = img.naturalHeight || 256; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL('image/png')); } catch (_) { resolve(null); } };
      img.onerror = () => resolve(null); img.src = LOGO_URL;
    });
  } catch (_) { PDF_LOGO_DATA = null; }
  return PDF_LOGO_DATA;
}
function getPdfLibrary() {
  if (!window.jspdf?.jsPDF) { toast('No se cargó la biblioteca PDF', 'Verifica tu conexión a internet y recarga la página.'); return null; }
  const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  if (typeof doc.autoTable !== 'function') { toast('No se cargó el módulo de tablas PDF', 'Verifica tu conexión a internet y recarga la página.'); return null; }
  return doc;
}
function pdfHeader(doc, heading, subheading = '') {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_NAVY); doc.rect(0, 0, width, 27, 'F');
  let brandX = 20;
  if (PDF_LOGO_DATA) {
    doc.setFillColor(255, 255, 255); doc.roundedRect(13, 5, 13, 14, 1.5, 1.5, 'F');
    try { doc.addImage(PDF_LOGO_DATA, 'PNG', 14, 6, 11, 12); brandX = 30; } catch (_) { doc.setFillColor(...PDF_CYAN); doc.roundedRect(13, 7, 2.2, 13, .8, .8, 'F'); }
  } else { doc.setFillColor(...PDF_CYAN); doc.roundedRect(13, 7, 2.2, 13, .8, .8, 'F'); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('NEUROFIT', brandX, 13);
  doc.setTextColor(...PDF_CYAN); doc.setFontSize(7); doc.text('PERFORMANCE LAB', brandX, 19);
  doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.text(heading, width - 14, 11, { align: 'right', maxWidth: 105 });
  doc.setTextColor(208, 224, 239); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(subheading || 'Seguimiento del rendimiento deportivo', width - 14, 18, { align: 'right', maxWidth: 110 });
  doc.setDrawColor(...PDF_CYAN); doc.setLineWidth(.7); doc.line(14, 27, width - 14, 27);
}
function pdfFooterAllPages(doc) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); const width = doc.internal.pageSize.getWidth(); const height = doc.internal.pageSize.getHeight();
    doc.setDrawColor(220, 228, 236); doc.setLineWidth(.25); doc.line(14, height - 13, width - 14, height - 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...PDF_MUTED);
    doc.text(`CONFIDENCIAL · NEUROFIT PERFORMANCE LAB · ${fmtDate(todayISO())}`, 14, height - 7);
    doc.text(`Página ${i} de ${total}`, width - 14, height - 7, { align: 'right' });
  }
}
function pdfSection(doc, label, y, heading, subtitle) {
  if (y > 264) { doc.addPage(); pdfHeader(doc, heading, subtitle); y = 39; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PDF_NAVY); doc.text(label, 14, y);
  doc.setDrawColor(...PDF_CYAN); doc.setLineWidth(.45); doc.line(14, y + 2.2, 196, y + 2.2);
  return y + 7;
}
function pdfKpi(doc, x, y, w, label, value, detail = '') {
  doc.setFillColor(...PDF_LIGHT); doc.setDrawColor(225, 233, 240); doc.roundedRect(x, y, w, 20, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...PDF_MUTED); doc.text(label.toUpperCase(), x + 3, y + 5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...PDF_NAVY); doc.text(String(value), x + 3, y + 11.5, { maxWidth: w - 6 });
  if (detail) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...PDF_MUTED); doc.text(String(detail), x + 3, y + 16.5, { maxWidth: w - 6 }); }
}
function pdfTable(doc, heading, subtitle, title, headers, rows, y, widths = undefined) {
  y = pdfSection(doc, title, y, heading, subtitle);
  doc.autoTable({
    startY: y, head: [headers], body: rows.length ? rows : [['Sin registros', ...Array(Math.max(0, headers.length - 1)).fill('')]],
    theme: 'striped', margin: { top: 34, bottom: 18, left: 14, right: 14 },
    styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 2.4, textColor: [38, 54, 72], lineColor: [225, 233, 240], lineWidth: .15, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: PDF_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.4 },
    alternateRowStyles: { fillColor: [247, 250, 252] },
    columnStyles: widths || {},
    didDrawPage: () => pdfHeader(doc, heading, subtitle),
    rowPageBreak: 'avoid'
  });
  return (doc.lastAutoTable?.finalY || y) + 10;
}
function testProgressRows(student) {
  return db.testDefs.map(def => {
    const rows = sortedByDate(db.tests.filter(t => t.studentId === student.id && t.testId === def.id), 'asc');
    if (rows.length < 2) return null;
    const first = rows[0], last = rows[rows.length - 1];
    const diff = Number(last.value) - Number(first.value);
    const improved = def.lowerIsBetter ? diff < 0 : diff > 0;
    const pct = Number(first.value) ? Math.abs(diff / Number(first.value) * 100) : 0;
    const status = diff === 0 ? 'Sin cambio' : improved ? `Mejora ${fmtNum(pct, 1)}%` : `Revisar (${fmtNum(pct, 1)}%)`;
    return [def.name, `${fmtNum(first.value, 2)} ${def.unit}`, `${fmtNum(last.value, 2)} ${def.unit}`, status, `${rows.length} medidas`];
  }).filter(Boolean);
}
function pdfDrawTestChart(doc, student, def, rows, heading, subheading) {
  doc.addPage(); pdfHeader(doc, 'EVOLUCIÓN DE PRUEBA', `${student.name} · ${def.name}`);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_NAVY); doc.setFontSize(14); doc.text(def.name, 14, 42, { maxWidth: 180 });
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_MUTED); doc.setFontSize(8); doc.text(`Unidad: ${def.unit} · ${def.lowerIsBetter ? 'Menor es mejor' : 'Mayor es mejor'} · ${rows.length} mediciones`, 14, 49);
  const x = 22, y = 65, w = 166, h = 102;
  const values = rows.map(r => Number(r.value)); const min = Math.min(...values), max = Math.max(...values); const spread = max - min || Math.max(Math.abs(max) * .1, 1); const low = min - spread * .15, high = max + spread * .15;
  doc.setFillColor(248, 251, 253); doc.setDrawColor(228, 235, 241); doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  doc.setDrawColor(224, 232, 239); doc.setLineWidth(.2);
  for (let i = 0; i <= 4; i++) { const gy = y + 10 + i * ((h - 25) / 4); doc.line(x + 12, gy, x + w - 7, gy); const val = high - i * ((high - low) / 4); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...PDF_MUTED); doc.text(fmtNum(val, 2), x + 9, gy + 2.2, { align: 'right' }); }
  const px = values.map((_, i) => x + 16 + (values.length === 1 ? 0 : i * ((w - 26) / (values.length - 1))));
  const py = values.map(v => y + 10 + ((high - v) / (high - low)) * (h - 25));
  doc.setDrawColor(...PDF_CYAN); doc.setLineWidth(.9);
  for (let i = 0; i < values.length - 1; i++) doc.line(px[i], py[i], px[i + 1], py[i + 1]);
  values.forEach((v, i) => { doc.setFillColor(...PDF_NAVY); doc.circle(px[i], py[i], 1.3, 'F'); if (i === 0 || i === values.length - 1 || values.length <= 5) { doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...PDF_NAVY); doc.text(`${fmtNum(v, 2)} ${def.unit}`, px[i], py[i] - 3, { align: i === 0 ? 'left' : i === values.length - 1 ? 'right' : 'center', maxWidth: 30 }); } });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...PDF_MUTED);
  doc.text(fmtDate(rows[0].date), x + 12, y + h - 8); doc.text(fmtDate(rows[rows.length - 1].date), x + w - 7, y + h - 8, { align: 'right' });
  const first = values[0], last = values[values.length - 1], diff = last - first; const improved = def.lowerIsBetter ? diff < 0 : diff > 0; const pct = first ? Math.abs(diff / first * 100) : 0;
  doc.setFillColor(...PDF_LIGHT); doc.roundedRect(22, 178, 166, 25, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PDF_NAVY); doc.text(diff === 0 ? 'Resultado sin cambio neto' : `${improved ? 'Mejora observada' : 'Cambio a revisar'}: ${fmtNum(pct, 1)}%`, 27, 188);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_MUTED); doc.text('La tendencia describe las mediciones registradas; su interpretación depende de protocolo, superficie, cronometraje y condiciones comparables.', 27, 195, { maxWidth: 155 });
}
function addStudentReportToPDF(doc, student, addNewPage = false) {
  if (addNewPage) doc.addPage();
  const heading = 'INFORME INDIVIDUAL'; const subtitle = `${student.name} · ${student.sport || 'Deporte no indicado'}`;
  pdfHeader(doc, heading, subtitle);
  const age = Number(student.age) || 0, height = Number(student.height) || 0, weight = Number(student.weight) || 0;
  const bmi = height > 0 && weight > 0 ? weight / ((height / 100) ** 2) : null;
  const calories = calculateEER(student);
  let y = 38;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...PDF_NAVY); doc.text(student.name || 'Alumno/a', 14, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...PDF_MUTED); doc.text(`Ficha elaborada el ${fmtDate(todayISO())} · Objetivo: ${student.goal || 'No indicado'}`, 14, y + 6);
  y += 12;
  const sex = student.sex === 'male' ? 'Masculino' : student.sex === 'female' ? 'Femenino' : 'No indicado';
  const activity = ({ inactive: 'Baja', low: 'Ligera', active: 'Activa', very: 'Muy activa' })[student.activity] || 'No indicada';
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(45, 61, 78);
  const metaLines = [
    `Deporte: ${student.sport || 'No indicado'}   |   Edad: ${age ? `${age} años` : 'No indicada'}   |   Sexo en ecuación energética: ${sex}`,
    `Actividad general: ${activity}   |   Estatura: ${height ? `${fmtNum(height, 1)} cm` : 'No registrada'}   |   Peso: ${weight ? `${fmtNum(weight, 1)} kg` : 'No registrado'}`
  ];
  doc.text(metaLines[0], 14, y, { maxWidth: 182 }); doc.text(metaLines[1], 14, y + 5, { maxWidth: 182 });
  y += 11;
  const total = db.strengthLogs.filter(r => r.studentId === student.id).length + db.tests.filter(r => r.studentId === student.id).length;
  const kpiW = 43.8, gap = 2.7;
  pdfKpi(doc, 14, y, kpiW, 'Peso', weight ? `${fmtNum(weight, 1)} kg` : '—', 'Dato del perfil');
  pdfKpi(doc, 14 + (kpiW + gap), y, kpiW, 'Estatura', height ? `${fmtNum(height, 1)} cm` : '—', 'Dato del perfil');
  pdfKpi(doc, 14 + 2 * (kpiW + gap), y, kpiW, 'IMC (kg/m²)', bmi ? fmtNum(bmi, 1) : '—', age && age < 20 ? 'Interpretar por edad' : 'No es diagnóstico');
  pdfKpi(doc, 14 + 3 * (kpiW + gap), y, kpiW, 'Registros', total, 'Fuerza + pruebas');
  y += 29;
  if (age && age < 20) {
    doc.setFillColor(255, 248, 229); doc.roundedRect(14, y - 2, 182, 12, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(116, 83, 27); doc.text('IMC en menores: este PDF muestra únicamente kg/m²; no clasifica peso ni composición corporal. La interpretación requiere edad exacta, sexo y referencias por edad.', 17, y + 2.5, { maxWidth: 176 });
    y += 15;
  }
  const progressRows = testProgressRows(student);
  y = pdfTable(doc, heading, subtitle, 'Progreso en pruebas con al menos dos mediciones', ['Prueba', 'Primera medición', 'Última medición', 'Cambio orientativo', 'N.º'], progressRows, y, { 0: { cellWidth: 52 }, 1: { cellWidth: 32 }, 2: { cellWidth: 32 }, 3: { cellWidth: 43 }, 4: { cellWidth: 18 } });
  const recs = recommendationsFor(student);
  y = pdfSection(doc, 'Recomendaciones de seguimiento', y, heading, subtitle);
  recs.forEach((r, i) => {
    if (y > 264) { doc.addPage(); pdfHeader(doc, heading, subtitle); y = 39; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...PDF_NAVY); doc.text(`${i + 1}. ${r.title}`, 15, y, { maxWidth: 180 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.4); doc.setTextColor(59, 77, 96);
    const lines = doc.splitTextToSize(r.text, 177); doc.text(lines, 18, y + 4.5); y += 7 + lines.length * 3.4;
  });
  if (calories) {
    if (y > 259) { doc.addPage(); pdfHeader(doc, heading, subtitle); y = 40; }
    y = pdfSection(doc, 'Contexto energético (orientativo)', y + 2, heading, subtitle);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_NAVY); doc.text(`${calories.toLocaleString('es-PE')} kcal/día estimadas`, 15, y + 1);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.3); doc.setTextColor(...PDF_MUTED);
    const note = age < 18 ? 'Referencia de mantenimiento, no meta dietética. En menores no se deben aplicar déficits automáticos; consultar a un profesional cualificado y considerar crecimiento y familia/tutores.' : 'Estimación poblacional, no medición exacta ni dieta personalizada. Ajustar con contexto, evolución y asesoría profesional.';
    doc.text(doc.splitTextToSize(note, 178), 15, y + 6); y += 17;
  }
  if (student.notes) {
    if (y > 260) { doc.addPage(); pdfHeader(doc, heading, subtitle); y = 40; }
    y = pdfSection(doc, 'Notas del entrenador', y + 2, heading, subtitle);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(51, 68, 86); doc.text(doc.splitTextToSize(String(student.notes), 178), 15, y, { maxWidth: 178 }); y += 8;
  }
  const strengthRows = sortedByDate(db.strengthLogs.filter(r => r.studentId === student.id)).map(r => {
    const ex = getExercise(r.exerciseId); const volume = Number(r.load) > 0 ? Number(r.load) * Number(r.sets) * Number(r.reps) : Number(r.sets) * Number(r.reps);
    return [fmtDate(r.date), ex?.name || 'Ejercicio eliminado', Number(r.load) > 0 ? `${fmtNum(r.load, 2)} kg` : 'Peso corporal / sin carga', `${r.sets} × ${r.reps}`, `${fmtNum(volume, 0)} ${Number(r.load) > 0 ? 'kg·reps' : 'reps'}`, r.rir === '' || r.rir == null ? '—' : String(r.rir), r.notes || '—'];
  });
  y = pdfTable(doc, heading, subtitle, 'Historial de cargas de fuerza', ['Fecha', 'Ejercicio', 'Carga', 'Series × reps', 'Volumen', 'RIR', 'Notas'], strengthRows, y, { 0: { cellWidth: 19 }, 1: { cellWidth: 42 }, 2: { cellWidth: 25 }, 3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: 12 }, 6: { cellWidth: 40 } });
  const testRows = sortedByDate(db.tests.filter(r => r.studentId === student.id)).map(r => {
    const def = getTestDef(r.testId); return [fmtDate(r.date), def?.name || 'Prueba eliminada', `${fmtNum(r.value, 2)} ${def?.unit || ''}`, r.attempt || '—', r.notes || '—'];
  });
  pdfTable(doc, heading, subtitle, 'Historial completo de pruebas físicas', ['Fecha', 'Prueba', 'Resultado', 'Intento', 'Protocolo / observaciones'], testRows, y, { 0: { cellWidth: 21 }, 1: { cellWidth: 45 }, 2: { cellWidth: 27 }, 3: { cellWidth: 25 }, 4: { cellWidth: 64 } });
  const testsWithTrend = db.testDefs.map(def => ({ def, rows: sortedByDate(db.tests.filter(r => r.studentId === student.id && r.testId === def.id), 'asc') })).filter(x => x.rows.length >= 2);
  testsWithTrend.forEach(x => pdfDrawTestChart(doc, student, x.def, x.rows, heading, subtitle));
}
async function exportStudentPDF(studentId) {
  await loadPdfLogo();
  const student = getStudent(studentId || $('#pdfStudentSelect')?.value || activeStudentId);
  if (!student) { toast('Selecciona un alumno', 'Primero registra o selecciona un perfil.'); return; }
  const doc = getPdfLibrary(); if (!doc) return;
  addStudentReportToPDF(doc, student, false); pdfFooterAllPages(doc);
  doc.save(`NeuroFit-informe-${String(student.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}-${todayISO()}.pdf`);
  toast('Informe PDF generado', `${student.name} · Perfil, fuerza, pruebas y progreso.`);
}
async function exportGroupPDF() {
  await loadPdfLogo();
  if (!db.students.length) { toast('No hay alumnos que exportar'); return; }
  const doc = getPdfLibrary(); if (!doc) return;
  const heading = 'INFORME GRUPAL'; const subtitle = `${db.students.length} alumnos · elaborado ${fmtDate(todayISO())}`;
  pdfHeader(doc, heading, subtitle);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_NAVY); doc.setFontSize(17); doc.text('Resumen del grupo', 14, 41);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_MUTED); doc.setFontSize(8); doc.text('Vista general del grupo y fichas individuales completas en las siguientes páginas.', 14, 48);
  pdfKpi(doc, 14, 56, 42, 'Alumnos', db.students.length);
  pdfKpi(doc, 59, 56, 42, 'Registros de fuerza', db.strengthLogs.length);
  pdfKpi(doc, 104, 56, 42, 'Resultados de pruebas', db.tests.length);
  pdfKpi(doc, 149, 56, 47, 'Fecha', fmtDate(todayISO()));
  const roster = db.students.map(st => {
    const age = Number(st.age) || 0, h = Number(st.height) || 0, w = Number(st.weight) || 0; const bmi = h > 0 && w > 0 ? w / ((h / 100) ** 2) : null;
    const strength = db.strengthLogs.filter(x => x.studentId === st.id).length, tests = db.tests.filter(x => x.studentId === st.id).length;
    return [st.name, st.sport || '—', age ? `${age}` : '—', w ? `${fmtNum(w, 1)} kg` : '—', h ? `${fmtNum(h, 1)} cm` : '—', bmi ? fmtNum(bmi, 1) : '—', String(strength), String(tests)];
  });
  doc.autoTable({ startY: 85, head: [['Alumno', 'Deporte', 'Edad', 'Peso', 'Estatura', 'IMC*', 'Fuerza', 'Pruebas']], body: roster,
    theme: 'striped', margin: { top: 34, bottom: 18, left: 14, right: 14 },
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.5, textColor: [38, 54, 72], lineColor: [225, 233, 240], lineWidth: .15 },
    headStyles: { fillColor: PDF_NAVY, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [247, 250, 252] },
    didDrawPage: () => pdfHeader(doc, heading, subtitle)
  });
  let y = (doc.lastAutoTable?.finalY || 85) + 8;
  if (y > 266) { doc.addPage(); pdfHeader(doc, heading, subtitle); y = 40; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...PDF_MUTED);
  doc.text('*El IMC es un dato de referencia calculado; en menores de 20 años no debe interpretarse con rangos de adultos. No es diagnóstico ni medida directa de composición corporal.', 14, y, { maxWidth: 181 });
  db.students.forEach(student => addStudentReportToPDF(doc, student, true));
  pdfFooterAllPages(doc);
  doc.save(`NeuroFit-informe-grupal-${todayISO()}.pdf`);
  toast('Informe grupal PDF generado', `${db.students.length} fichas incluidas.`);
}

// Single delegated handler keeps controls working after each view re-render.
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-page]');
  if (nav) { setPage(nav.dataset.page); return; }
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  switch (action) {
    case 'new-student': openStudentForm(); break;
    case 'edit-student': openStudentForm(actionEl.dataset.id); break;
    case 'new-strength': openStrengthForm(); break;
    case 'new-test': openTestForm(); break;
    case 'new-exercise': openExerciseForm(); break;
    case 'edit-exercise': openExerciseForm(actionEl.dataset.id); break;
    case 'new-testdef': openTestDefForm(); break;
    case 'edit-testdef': openTestDefForm(actionEl.dataset.id); break;
    case 'view-profile': viewProfile(actionEl.dataset.id); break;
    case 'go-students': setPage('students'); break;
    case 'go-reports': setPage('reports'); break;
    case 'close-modal': closeModal(); break;
    case 'delete-strength': deleteStrength(actionEl.dataset.id); break;
    case 'delete-test': deleteTest(actionEl.dataset.id); break;
    case 'profile-chart-mode': profileChartMode = actionEl.dataset.mode; profileTrendId = (profileChartMode === 'test' ? db.testDefs[0]?.id : db.exercises[0]?.id) || null; renderProfile(activeStudentId); break;
    case 'export-json': exportJSON(); break;
    case 'export-students-csv': exportStudentsCSV(); toast('CSV de alumnos descargado'); break;
    case 'export-strength-csv': exportStrengthCSV(); toast('CSV de cargas descargado'); break;
    case 'export-tests-csv': exportTestsCSV(); toast('CSV de pruebas descargado'); break;
    case 'export-student-pdf': exportStudentPDF(actionEl.dataset.id || $('#pdfStudentSelect')?.value || activeStudentId); break;
    case 'export-group-pdf': exportGroupPDF(); break;
    case 'clear-all':
      if (confirm('¿Eliminar TODOS los alumnos, registros y configuraciones compartidos en la nube para todos los usuarios? Esta acción afecta a todos los dispositivos conectados. Exporta primero un respaldo JSON.')) {
        db = blankDB(); saveDB(); activeStudentId = null; currentPage = 'dashboard'; profileTrendId = null; renderPage(); toast('Almacenamiento restablecido');
      }
      break;
  }
});

document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  if (form.reportValidity()) handleFormSubmit(form);
});

document.addEventListener('input', event => {
  const id = event.target.id;
  if (id === 'studentSearch') { studentSearch = event.target.value; const pos = event.target.selectionStart; renderStudents(); const el = $('#studentSearch'); el?.focus(); if (el && pos != null) el.setSelectionRange(pos, pos); }
  if (id === 'strengthSearch') { strengthSearch = event.target.value; const pos = event.target.selectionStart; renderStrength(); const el = $('#strengthSearch'); el?.focus(); if (el && pos != null) el.setSelectionRange(pos, pos); }
  if (id === 'testSearch') { testSearch = event.target.value; const pos = event.target.selectionStart; renderTests(); const el = $('#testSearch'); el?.focus(); if (el && pos != null) el.setSelectionRange(pos, pos); }
  if (id === 'exerciseSearch') { exerciseSearch = event.target.value; const pos = event.target.selectionStart; renderLibrary(); const el = $('#exerciseSearch'); el?.focus(); if (el && pos != null) el.setSelectionRange(pos, pos); }
});

document.addEventListener('change', event => {
  if (event.target.id === 'dashboardStudentSelect') { dashboardStudentId = event.target.value; drawDashboardChart(); }
  if (event.target.id === 'dashboardTestSelect') { profileTrendId = event.target.value; drawDashboardChart(); }
  if (event.target.id === 'profileTrendSelect') { profileTrendId = event.target.value; drawProfileChart(); }
  if (event.target.id === 'importBackupFile') { importJSONFile(event.target.files?.[0]); event.target.value = ''; }
});
$('#modalClose').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', event => { if (event.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modalBackdrop.hidden) closeModal(); });
$('#menuToggle').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#mobileScrim').classList.add('show'); });
$('#sidebarClose').addEventListener('click', closeMobileMenu);
$('#mobileScrim').addEventListener('click', closeMobileMenu);
window.addEventListener('resize', () => {
  if (currentPage === 'dashboard' && !activeStudentId) drawDashboardChart();
  if (activeStudentId) drawProfileChart();
});

// Primero se valida la sesión y se carga el conjunto de datos remoto antes de mostrar la aplicación.
initializeAuth();
