
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Settings, 
  Play, 
  ArrowLeft, 
  LayoutDashboard, 
  Users, 
  MapPin, 
  ClipboardList, 
  CheckCircle, 
  XCircle, 
  LogOut, 
  ChevronRight, 
  Edit2, 
  Database, 
  RefreshCw, 
  Share2, 
  Lock, 
  Copy,
  Clock,
  AlertCircle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { 
  EmployeeType, 
  RequestStatus, 
  Sector, 
  Employee, 
  TimeRequest, 
  AppState,
  TimeRecord 
} from './types';
import { 
  formatCurrency, 
  calculateTimeDiff, 
  getWeekDays 
} from './utils';

// Constantes
const STORAGE_KEY = 'controle_horas_db_v3';
const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbw7IwV4c-dzVDe1gyOzgSM7N4MfSJ3PITjRTHBC-mzpfr7kX7YSU1boQGD7vcmP13Rx/exec';

const App: React.FC = () => {
  // --- Estados do Banco de Dados ---
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<TimeRequest[]>([]);
  const [dbUrl, setDbUrl] = useState(DEFAULT_SHEET_URL);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- Estado Global da Navegação ---
  const [state, setState] = useState<AppState>({
    view: 'HOME',
    flowType: null,
    adminSubView: 'DASHBOARD'
  });

  // --- Estados de Formulários ---
  const [adminPassword, setAdminPassword] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(new Date().toISOString().split('T')[0]);

  // Estados Admin
  const [newSec, setNewSec] = useState({ name: '', fixedRate: 0 });
  const [newEmpData, setNewEmpData] = useState({ name: '', sectorId: '', salary: 0, monthlyHours: 220, type: EmployeeType.REGISTRADO });
  const [modalRecords, setModalRecords] = useState<TimeRecord[]>([]);

  // Edição e Controle de Acesso
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editJustification, setEditJustification] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');

  // --- Lógica de Sincronização de Dados ---

  const loadDatabase = useCallback(async (urlToUse?: string) => {
    const targetUrl = urlToUse || dbUrl;
    if (!targetUrl) return;

    setIsSyncing(true);
    try {
      const response = await fetch(targetUrl);
      const data = await response.json();
      if (data) {
        setSectors(data.sectors || []);
        setEmployees(data.employees || []);
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error("Erro ao carregar banco de dados:", error);
    } finally {
      setIsSyncing(false);
      setIsInitialLoad(false);
    }
  }, [dbUrl]);

  const syncDatabase = useCallback(async (currentData: { sectors: Sector[], employees: Employee[], requests: TimeRequest[] }) => {
    if (!dbUrl) return;

    setIsSyncing(true);
    
    // Preparação de dados FLAT para o Sheets (Célula por Célula)
    // Criamos um array onde cada objeto é uma "linha" de dia trabalhado
    const flattenedRequests = currentData.requests.flatMap(req => 
      req.records.map(rec => ({
        requestId: req.id,
        employeeName: req.employeeName,
        type: req.employeeType,
        sector: req.sectorName,
        weekStarting: req.weekStarting,
        status: req.status,
        calculatedTotal: req.calculatedValue,
        date: rec.date,
        realEntry: rec.realEntry,
        punchEntry: rec.punchEntry,
        punchExit: rec.punchExit,
        realExit: rec.realExit,
        isFolgaVendida: rec.isFolgaVendida ? "SIM" : "NÃO",
        createdAt: req.createdAt
      }))
    );

    try {
      await fetch(dbUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: "SYNC_DATABASE",
          data: {
            ...currentData,
            flattenedRequests // Enviamos a versão detalhada para a planilha
          }
        }),
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...currentData, dbUrl }));
    } catch (error) {
      console.error("Erro na sincronização:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [dbUrl]);

  // Efeito Inicial e Validação de Link Expirável
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('t');

    if (token) {
      const timestamp = parseInt(token, 10);
      const now = Date.now();
      if (isNaN(timestamp) || (now - timestamp > 24 * 60 * 60 * 1000)) {
        setState(prev => ({ ...prev, view: 'EXPIRED' }));
        return;
      }
    }
    loadDatabase(DEFAULT_SHEET_URL);
  }, [loadDatabase]);

  // Sincronização Automática com Debounce
  useEffect(() => {
    if (!isInitialLoad && state.view !== 'EXPIRED') {
      const timer = setTimeout(() => {
        syncDatabase({ sectors, employees, requests });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [sectors, employees, requests, isInitialLoad, syncDatabase, state.view]);

  // Inicializa a semana ao abrir o formulário
  useEffect(() => {
    if (showFormModal && !editingRequestId) {
      const weekDays = getWeekDays(new Date(currentWeek));
      setModalRecords(weekDays.map(date => ({
        date, realEntry: '', punchEntry: '', punchExit: '', realExit: '', isFolgaVendida: false
      })));
    }
  }, [showFormModal, currentWeek, editingRequestId]);

  // --- Handlers ---
  const handleAdminLogin = () => {
    if (adminPassword === '123') {
      setIsAuth(true);
      setState(prev => ({ ...prev, view: 'ADMIN' }));
      setAdminPassword('');
    } else {
      alert('Senha incorreta!');
    }
  };

  const generateAccessLink = () => {
    const timestamp = Date.now();
    const link = `${window.location.origin}${window.location.pathname}?t=${timestamp}`;
    setGeneratedLink(link);
    navigator.clipboard.writeText(link);
    alert('Link de acesso válido por 24h copiado!');
  };

  const submitRequest = () => {
    const employee = employees.find(e => String(e.id) === String(selectedEmployee));
    const sector = sectors.find(s => String(s.id) === String(employee?.sectorId || selectedSector));
    
    if (!employee && state.flowType === EmployeeType.REGISTRADO) return;

    let totalDiffHours = 0;
    let totalPayment = 0;

    if (state.flowType === EmployeeType.REGISTRADO && employee) {
      const hourlyBase = (employee.salary / employee.monthlyHours) * 1.25;
      modalRecords.forEach(r => {
        const diff = r.isFolgaVendida 
          ? calculateTimeDiff(r.realExit, r.realEntry)
          : calculateTimeDiff(r.realEntry, r.punchEntry) + calculateTimeDiff(r.realExit, r.punchExit);
        totalDiffHours += diff;
      });
      totalPayment = totalDiffHours * hourlyBase;
    } else {
      const dailyRate = (sector?.fixedRate || 0) + 12;
      modalRecords.forEach(r => { if (r.realEntry && r.realExit) totalPayment += dailyRate; });
    }

    if (editingRequestId) {
      setRequests(requests.map(r => r.id === editingRequestId ? {
        ...r, records: modalRecords, calculatedValue: totalPayment, editJustification
      } : r));
      setEditingRequestId(null);
    } else {
      const newReq: TimeRequest = {
        id: Math.random().toString(36).substr(2, 9),
        employeeId: employee?.id || 'fixo',
        employeeName: employee?.name || selectedEmployee,
        employeeType: state.flowType!,
        sectorId: sector?.id || '',
        sectorName: sector?.name || '',
        weekStarting: currentWeek,
        records: modalRecords,
        status: RequestStatus.PENDENTE,
        calculatedValue: totalPayment,
        totalTimeDecimal: totalDiffHours,
        createdAt: new Date().toISOString()
      };
      setRequests([newReq, ...requests]);
      setState(prev => ({ ...prev, view: 'HOME' }));
    }
    setShowFormModal(false);
  };

  // --- UI Components ---

  const RequestCard: React.FC<{ req: TimeRequest }> = ({ req }) => (
    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition mb-3 group">
      <div className="flex justify-between items-start mb-2">
        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${req.employeeType === EmployeeType.REGISTRADO ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
          {req.employeeType}
        </span>
        <p className="text-sm font-black text-gray-900">{formatCurrency(req.calculatedValue)}</p>
      </div>
      <h4 className="text-sm font-bold text-gray-800 line-clamp-1">{req.employeeName}</h4>
      <p className="text-[10px] text-gray-400 mb-3">{req.sectorName} • Sem: {new Date(req.weekStarting).toLocaleDateString('pt-BR')}</p>
      
      <div className="flex gap-1">
        {req.status === RequestStatus.PENDENTE && (
          <>
            <button onClick={() => setRequests(requests.map(r => r.id === req.id ? {...r, status: RequestStatus.APROVADO} : r))} className="flex-1 bg-green-50 text-green-600 p-2 rounded-lg hover:bg-green-600 hover:text-white transition flex justify-center"><CheckCircle className="w-4 h-4" /></button>
            <button onClick={() => setRequests(requests.map(r => r.id === req.id ? {...r, status: RequestStatus.REJEITADO} : r))} className="flex-1 bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-600 hover:text-white transition flex justify-center"><XCircle className="w-4 h-4" /></button>
          </>
        )}
        <button onClick={() => {
          setEditingRequestId(req.id);
          setModalRecords(JSON.parse(JSON.stringify(req.records)));
          setCurrentWeek(req.weekStarting);
          setShowFormModal(true);
        }} className="flex-1 bg-gray-50 text-gray-400 p-2 rounded-lg hover:bg-gray-200 transition flex justify-center"><Edit2 className="w-4 h-4" /></button>
        <button onClick={() => setRequests(requests.filter(r => r.id !== req.id))} className="bg-gray-50 text-gray-300 p-2 rounded-lg hover:bg-red-50 hover:text-red-400 transition flex justify-center"><XCircle className="w-4 h-4" /></button>
      </div>
    </div>
  );

  const renderAdminRequestsSubView = () => (
    <div className="h-full flex flex-col gap-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-2xl font-black text-gray-800">Fluxo de Solicitações</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => syncDatabase({ sectors, employees, requests })} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-100"><RefreshCw className="w-4 h-4" /> Forçar Sincronização</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Coluna PENDENTES */}
        <div className="flex flex-col bg-gray-100/50 rounded-3xl p-4 border border-gray-200/50">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-sm font-black text-blue-600 uppercase flex items-center gap-2">
              <Clock className="w-4 h-4" /> Pendentes
            </h3>
            <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
              {requests.filter(r => r.status === RequestStatus.PENDENTE).length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            {requests.filter(r => r.status === RequestStatus.PENDENTE).map(req => <RequestCard key={req.id} req={req} />)}
          </div>
        </div>

        {/* Coluna APROVADOS */}
        <div className="flex flex-col bg-green-50/30 rounded-3xl p-4 border border-green-100/50">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-sm font-black text-green-600 uppercase flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Aprovados
            </h3>
            <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
              {requests.filter(r => r.status === RequestStatus.APROVADO).length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            {requests.filter(r => r.status === RequestStatus.APROVADO).map(req => <RequestCard key={req.id} req={req} />)}
          </div>
        </div>

        {/* Coluna REJEITADOS */}
        <div className="flex flex-col bg-red-50/30 rounded-3xl p-4 border border-red-100/50">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-sm font-black text-red-600 uppercase flex items-center gap-2">
              <XCircle className="w-4 h-4" /> Rejeitados
            </h3>
            <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
              {requests.filter(r => r.status === RequestStatus.REJEITADO).length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            {requests.filter(r => r.status === RequestStatus.REJEITADO).map(req => <RequestCard key={req.id} req={req} />)}
          </div>
        </div>
      </div>
    </div>
  );

  // --- Renderização Principal ---

  if (state.view === 'EXPIRED') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 bg-gray-100">
        <div className="bg-white p-12 rounded-3xl shadow-2xl max-w-lg w-full">
          <div className="bg-red-100 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 text-red-600"><Lock className="w-10 h-10" /></div>
          <h1 className="text-3xl font-bold mb-4">Acesso Expirado</h1>
          <p className="text-gray-500 mb-8">Este link expirou. Peça um novo acesso.</p>
          <button onClick={() => window.location.href = window.location.origin + window.location.pathname} className="bg-gray-800 text-white px-8 py-3 rounded-xl font-bold">Início</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {state.view === 'HOME' && (
        <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
          <div className="bg-white p-12 rounded-3xl shadow-2xl max-w-lg w-full transform transition hover:scale-105 duration-300">
            <div className="bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-200"><ClipboardList className="text-white w-10 h-10" /></div>
            <h1 className="text-4xl font-extrabold text-gray-800 mb-4">Controle de Horas</h1>
            <p className="text-gray-500 mb-10 text-lg">Gerenciamento eficiente de jornadas semanais.</p>
            <button onClick={() => setState(prev => ({ ...prev, view: 'SELECTION' }))} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl transition shadow-xl shadow-blue-100 flex items-center justify-center gap-3 group">
              Começar <Play className="w-5 h-5 group-hover:translate-x-1 transition" />
            </button>
            <div className="mt-8 pt-8 border-t border-gray-100 relative">
              <input type="password" placeholder="Acesso Admin" className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-xl outline-none text-black" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()} />
              <Settings className="absolute left-4 top-[70%] -translate-y-1/2 text-gray-400 w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {state.view === 'SELECTION' && (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
          <button onClick={() => setState(prev => ({ ...prev, view: 'HOME' }))} className="mb-8 flex items-center gap-2 text-gray-500 hover:text-blue-600 transition font-medium"><ArrowLeft className="w-5 h-5" /> Voltar</button>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl w-full">
            <button onClick={() => setState(prev => ({ ...prev, view: 'FLOW', flowType: EmployeeType.REGISTRADO }))} className="bg-white p-10 rounded-3xl shadow-xl hover:border-blue-500 border-2 border-transparent transition-all group text-left">
              <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition"><Users className="text-blue-600 w-8 h-8 group-hover:text-white transition" /></div>
              <h2 className="text-2xl font-bold mb-2">Registrado</h2>
              <p className="text-gray-500">CLT com controle de ponto.</p>
            </button>
            <button onClick={() => setState(prev => ({ ...prev, view: 'FLOW', flowType: EmployeeType.FIXO }))} className="bg-white p-10 rounded-3xl shadow-xl hover:border-green-500 border-2 border-transparent transition-all group text-left">
              <div className="bg-green-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-green-600 transition"><MapPin className="text-green-600 w-8 h-8 group-hover:text-white transition" /></div>
              <h2 className="text-2xl font-bold mb-2">Fixo (Extra)</h2>
              <p className="text-gray-500">Eventuais com diária fixa.</p>
            </button>
          </div>
        </div>
      )}

      {state.view === 'FLOW' && (
        <div className="max-w-xl mx-auto py-12 px-4">
          <button onClick={() => setState(prev => ({ ...prev, view: 'SELECTION' }))} className="mb-8 flex items-center gap-2 text-gray-500 font-medium"><ArrowLeft className="w-5 h-5" /> Voltar</button>
          <div className="bg-white rounded-3xl shadow-xl p-8 space-y-8">
            <h2 className="text-2xl font-bold text-gray-800 border-b pb-4">{state.flowType}</h2>
            <div>
              <label className="block text-sm font-semibold mb-2">Setor</label>
              <select className="w-full p-4 border rounded-xl bg-white text-black" value={selectedSector} onChange={(e) => setSelectedSector(e.target.value)}>
                <option value="">Selecione...</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {selectedSector && (
              <div>
                <label className="block text-sm font-semibold mb-2">Funcionário</label>
                {state.flowType === EmployeeType.REGISTRADO ? (
                  <select className="w-full p-4 border rounded-xl bg-white text-black" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
                    <option value="">Selecione...</option>
                    {employees.filter(e => String(e.sectorId) === String(selectedSector) && e.type === state.flowType).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                ) : (
                  <input type="text" placeholder="Nome" className="w-full p-4 border rounded-xl bg-white text-black" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} />
                )}
              </div>
            )}
            <button disabled={!selectedSector || !selectedEmployee} onClick={() => setShowFormModal(true)} className="w-full bg-blue-600 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl shadow-lg">Lançar Horários</button>
          </div>
        </div>
      )}

      {state.view === 'ADMIN' && (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
          <div className="w-72 bg-white border-r border-gray-100 flex flex-col p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-12"><div className="bg-blue-600 p-2 rounded-lg text-white"><Settings className="w-5 h-5" /></div><h2 className="text-xl font-black">Admin</h2></div>
            <nav className="flex-1 space-y-2">
              {[
                { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
                { id: 'SECTORS', label: 'Setores', icon: MapPin },
                { id: 'EMPLOYEES', label: 'Funcionários', icon: Users },
                { id: 'REQUESTS', label: 'Solicitações', icon: ClipboardList },
                { id: 'INTEGRATIONS', label: 'Planilha', icon: Database },
              ].map(item => (
                <button key={item.id} onClick={() => setState(prev => ({ ...prev, adminSubView: item.id as any }))} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${state.adminSubView === item.id ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <item.icon className="w-5 h-5" />{item.label}
                </button>
              ))}
            </nav>
            <button onClick={() => { setIsAuth(false); setState(prev => ({ ...prev, view: 'HOME' })) }} className="flex items-center gap-3 px-4 py-3 text-red-500 font-bold hover:bg-red-50 rounded-xl transition mt-auto"><LogOut className="w-5 h-5" /> Sair</button>
          </div>
          <div className="flex-1 overflow-y-auto p-10 relative">
            {isSyncing && <div className="absolute top-10 right-10 flex items-center gap-2 text-blue-600 font-bold text-sm bg-blue-50 px-4 py-2 rounded-full border border-blue-100"><RefreshCw className="w-4 h-4 animate-spin" /> Atualizando Planilha...</div>}
            
            {state.adminSubView === 'DASHBOARD' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p className="text-gray-500 text-sm mb-1">Total Aprovado</p><h3 className="text-3xl font-bold">{formatCurrency(requests.filter(r => r.status === RequestStatus.APROVADO).reduce((a, b) => a + b.calculatedValue, 0))}</h3></div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p className="text-gray-500 text-sm mb-1">Pendentes</p><h3 className="text-3xl font-bold text-blue-600">{requests.filter(r => r.status === RequestStatus.PENDENTE).length}</h3></div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p className="text-gray-500 text-sm mb-1">Colaboradores</p><h3 className="text-3xl font-bold text-green-600">{employees.length}</h3></div>
                </div>
              </div>
            )}

            {state.adminSubView === 'REQUESTS' && renderAdminRequestsSubView()}

            {state.adminSubView === 'SECTORS' && (
              <div className="bg-white p-8 rounded-3xl border border-gray-100 space-y-8">
                <h2 className="text-2xl font-bold">Setores</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-6 rounded-2xl">
                  <input type="text" placeholder="Nome" className="p-3 border rounded-xl bg-white text-black" value={newSec.name} onChange={(e) => setNewSec({ ...newSec, name: e.target.value })} />
                  <input type="number" placeholder="Diária Extra" className="p-3 border rounded-xl bg-white text-black" value={newSec.fixedRate || ''} onChange={(e) => setNewSec({ ...newSec, fixedRate: parseFloat(e.target.value) })} />
                  <button onClick={() => { if(newSec.name) { setSectors([...sectors, {...newSec, id: Date.now().toString()}]); setNewSec({name: '', fixedRate: 0}); } }} className="bg-blue-600 text-white font-bold rounded-xl">Adicionar</button>
                </div>
                <table className="w-full text-left"><thead><tr className="text-gray-400 text-xs border-b"><th className="py-4">Setor</th><th className="py-4">Diária</th><th className="py-4 text-right">Ação</th></tr></thead><tbody>{sectors.map(s => (<tr key={s.id} className="border-b"><td className="py-4 font-semibold">{s.name}</td><td className="py-4">{formatCurrency(s.fixedRate)}</td><td className="py-4 text-right"><button onClick={() => setSectors(sectors.filter(sec => sec.id !== s.id))} className="text-red-500"><XCircle className="w-5 h-4" /></button></td></tr>))}</tbody></table>
              </div>
            )}

            {state.adminSubView === 'EMPLOYEES' && (
              <div className="bg-white p-8 rounded-3xl border border-gray-100 space-y-8">
                <h2 className="text-2xl font-bold">Funcionários</h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-gray-50 p-6 rounded-2xl">
                  <input type="text" placeholder="Nome" className="p-3 border rounded-xl bg-white text-black" value={newEmpData.name} onChange={(e) => setNewEmpData({ ...newEmpData, name: e.target.value })} />
                  <select className="p-3 border rounded-xl bg-white text-black" value={newEmpData.sectorId} onChange={(e) => setNewEmpData({ ...newEmpData, sectorId: e.target.value })}><option value="">Setor...</option>{sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <input type="number" placeholder="Salário" className="p-3 border rounded-xl bg-white text-black" value={newEmpData.salary || ''} onChange={(e) => setNewEmpData({ ...newEmpData, salary: parseFloat(e.target.value) })} />
                  <input type="number" placeholder="Horas" className="p-3 border rounded-xl bg-white text-black" value={newEmpData.monthlyHours || ''} onChange={(e) => setNewEmpData({ ...newEmpData, monthlyHours: parseFloat(e.target.value) })} />
                  <button onClick={() => { if(newEmpData.name) { setEmployees([...employees, {...newEmpData, id: Date.now().toString()}]); setNewEmpData({name: '', sectorId: '', salary: 0, monthlyHours: 220, type: EmployeeType.REGISTRADO}); } }} className="bg-blue-600 text-white font-bold rounded-xl">Add</button>
                </div>
                <table className="w-full text-left"><thead><tr className="border-b text-xs text-gray-400"><th className="py-4">Nome</th><th className="py-4">Setor</th><th className="py-4 text-right">Ação</th></tr></thead><tbody>{employees.map(e => (<tr key={e.id} className="border-b"><td className="py-4">{e.name}</td><td className="py-4">{sectors.find(s => s.id === e.sectorId)?.name}</td><td className="py-4 text-right"><button onClick={() => setEmployees(employees.filter(emp => emp.id !== e.id))} className="text-red-400"><XCircle className="w-4 h-4" /></button></td></tr>))}</tbody></table>
              </div>
            )}

            {state.adminSubView === 'INTEGRATIONS' && (
              <div className="bg-white p-8 rounded-3xl border border-gray-100 space-y-8">
                <h2 className="text-2xl font-bold flex items-center gap-2"><Database className="text-blue-600" /> Sincronização Detalhada</h2>
                <div className="p-8 border-2 border-dashed border-blue-200 rounded-3xl bg-blue-50/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div><h3 className="text-xl font-bold text-gray-800">Link de Acesso (24h)</h3><p className="text-sm text-gray-500">Cria um link temporário para preenchimento externo.</p></div>
                    <button onClick={generateAccessLink} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-blue-700 transition"><Share2 className="w-5 h-5" /> Gerar Link</button>
                  </div>
                  {generatedLink && <div className="flex items-center gap-2 bg-white p-4 rounded-xl border border-blue-100"><input readOnly value={generatedLink} className="flex-1 text-xs text-gray-400 bg-transparent outline-none font-mono" /><button onClick={() => { navigator.clipboard.writeText(generatedLink); alert('Copiado!'); }} className="text-blue-600 p-2"><Copy className="w-4 h-4" /></button></div>}
                </div>
                <div className="p-8 border border-gray-100 rounded-3xl bg-gray-50/50 space-y-4">
                  <h3 className="text-xl font-bold text-gray-800">Endpoint da Planilha</h3>
                  <p className="text-xs text-gray-400 flex items-center gap-2"><AlertCircle className="w-3 h-3" /> Certifique-se que o script no Sheets suporte a ação 'SYNC_DATABASE' com os campos detalhados.</p>
                  <input type="text" className="w-full p-4 border rounded-xl bg-white text-black outline-none" value={dbUrl} onChange={(e) => setDbUrl(e.target.value)} />
                  <div className="flex gap-2">
                    <button onClick={() => loadDatabase()} className="bg-white border border-blue-600 text-blue-600 px-6 py-3 rounded-xl font-bold">Importar do Sheets</button>
                    <button onClick={() => syncDatabase({ sectors, employees, requests })} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg">Exportar para o Sheets</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showFormModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-8 relative">
            <button onClick={() => { setShowFormModal(false); setEditingRequestId(null); }} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600"><XCircle className="w-8 h-8" /></button>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <h2 className="text-2xl font-bold">Fechamento Semanal</h2>
              <div className="flex items-center gap-4"><span className="text-sm font-medium text-gray-500">Semana de:</span><input type="date" className="p-2 border rounded-lg bg-white text-black" value={currentWeek} onChange={(e) => !editingRequestId && setCurrentWeek(e.target.value)} disabled={!!editingRequestId} /></div>
            </div>
            <div className="space-y-4">
              {modalRecords.map((r, idx) => (
                <div key={idx} className="bg-gray-50 p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="font-bold text-gray-700 capitalize">{new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}</span>
                    {(state.flowType === EmployeeType.REGISTRADO || (editingRequestId && requests.find(x => x.id === editingRequestId)?.employeeType === EmployeeType.REGISTRADO)) && (
                      <button onClick={() => { const n = [...modalRecords]; n[idx].isFolgaVendida = !n[idx].isFolgaVendida; setModalRecords(n); }} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border-2 ${r.isFolgaVendida ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-400'}`}>Folga Vendida</button>
                    )}
                  </div>
                  <div className={`grid gap-4 ${state.flowType === EmployeeType.REGISTRADO && !r.isFolgaVendida ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'}`}>
                    <div><label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Entrada Real</label><input type="time" className="w-full p-2 border rounded-lg bg-white text-black" value={r.realEntry} onChange={(e) => { const n = [...modalRecords]; n[idx].realEntry = e.target.value; setModalRecords(n); }} /></div>
                    {state.flowType === EmployeeType.REGISTRADO && !r.isFolgaVendida && (
                      <>
                        <div><label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Entrada Ponto</label><input type="time" className="w-full p-2 border rounded-lg bg-white text-black" value={r.punchEntry} onChange={(e) => { const n = [...modalRecords]; n[idx].punchEntry = e.target.value; setModalRecords(n); }} /></div>
                        <div><label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Saída Ponto</label><input type="time" className="w-full p-2 border rounded-lg bg-white text-black" value={r.punchExit} onChange={(e) => { const n = [...modalRecords]; n[idx].punchExit = e.target.value; setModalRecords(n); }} /></div>
                      </>
                    )}
                    <div><label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Saída Real</label><input type="time" className="w-full p-2 border rounded-lg bg-white text-black" value={r.realExit} onChange={(e) => { const n = [...modalRecords]; n[idx].realExit = e.target.value; setModalRecords(n); }} /></div>
                  </div>
                </div>
              ))}
            </div>
            {editingRequestId && <div className="mt-8"><label className="block text-sm font-semibold mb-2">Justificativa</label><textarea className="w-full p-4 border rounded-xl bg-white text-black" rows={2} value={editJustification} onChange={(e) => setEditJustification(e.target.value)} /></div>}
            <div className="mt-10 flex justify-end gap-4"><button onClick={() => { setShowFormModal(false); setEditingRequestId(null); }} className="px-8 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">Cancelar</button><button onClick={submitRequest} className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg">Confirmar e Enviar</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
