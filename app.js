import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://lbdhyilaqzkrawhloyng.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tx_ezHtUy7wmMxGqSsmjnw_us92WXgV';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const DEFAULT_CATEGORIES = [
  ['Moradia', '🏠'],
  ['Mercado', '🛒'],
  ['Transporte', '🚗'],
  ['Contas', '💡'],
  ['Lazer', '🎉'],
  ['Saúde', '💊'],
  ['Pets', '🐾'],
  ['Compras', '🛍️'],
  ['Assinaturas', '📺'],
  ['Outros', '📦']
];

const POSSIBLE_V2_KEYS = [
  'meu_controle_v2_local',
  'meu-controle-v2',
  'meuControleV2',
  'financeData',
  'meu_controle_data'
];

let selectedMonth = new Date().toISOString().slice(0, 7);
let currentUser = null;
let state = {
  categories: [],
  transactions: [],
  budgets: {}
};

const $ = (id) => document.getElementById(id);
const money = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value) || 0);

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

function setAuthMessage(text, isError = false) {
  const box = $('authmsg');
  box.textContent = text;
  box.classList.remove('hidden');
  box.style.background = isError ? '#fee2e2' : '#f1f5f9';
}

function setSyncStatus(text) {
  $('syncStatus').textContent = text;
}

function showApp() {
  $('auth').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('nav').classList.remove('hidden');
}

function showAuth() {
  $('auth').classList.remove('hidden');
  $('app').classList.add('hidden');
  $('nav').classList.add('hidden');
}

function closeModal() {
  $('modal').classList.remove('open');
}

function normalizeName(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text
    : new Date(value).toISOString().slice(0, 10);
}

function readV2Data() {
  for (const key of POSSIBLE_V2_KEYS) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      if (parsed && typeof parsed === 'object') {
        const hasUsefulData =
          (Array.isArray(parsed.categories) && parsed.categories.length) ||
          (Array.isArray(parsed.transactions) && parsed.transactions.length) ||
          (parsed.budgets && Object.keys(parsed.budgets).length);

        if (hasUsefulData) return { key, data: parsed };
      }
    } catch (error) {
      console.warn(`Dados inválidos na chave ${key}:`, error);
    }
  }
  return null;
}

function migrationMarker(userId) {
  return `meu_controle_v3_migrated_${userId}`;
}

function transactionFingerprint(row) {
  return [
    normalizeName(row.description),
    Number(row.amount).toFixed(2),
    toIsoDate(row.date),
    row.type,
    Number(row.installment_current || row.current || 1),
    Number(row.installment_total || row.installments || 1)
  ].join('|');
}

async function loadCloud() {
  setSyncStatus('Sincronizando…');

  const [categoriesResult, transactionsResult, budgetsResult] = await Promise.all([
    supabase.from('categories').select('*').order('created_at'),
    supabase.from('transactions').select('*').order('date', { ascending: false }),
    supabase.from('budgets').select('*')
  ]);

  const error =
    categoriesResult.error ||
    transactionsResult.error ||
    budgetsResult.error;

  if (error) throw error;

  state.categories = categoriesResult.data || [];
  state.transactions = transactionsResult.data || [];
  state.budgets = {};

  for (const budget of budgetsResult.data || []) {
    const month = String(budget.month).slice(0, 7);
    state.budgets[month] ??= {};
    state.budgets[month][budget.category_id] = Number(budget.amount);
  }

  setSyncStatus('☁ Sincronizado');
  render();
}

async function ensureDefaultCategories() {
  const { data: existing, error } = await supabase
    .from('categories')
    .select('*')
    .order('created_at');

  if (error) throw error;
  if (existing?.length) return existing;

  const rows = DEFAULT_CATEGORIES.map(([name, icon]) => ({
    user_id: currentUser.id,
    name,
    icon
  }));

  const { data: created, error: insertError } = await supabase
    .from('categories')
    .insert(rows)
    .select();

  if (insertError) throw insertError;
  return created || [];
}

async function migrateV2Automatically() {
  const marker = migrationMarker(currentUser.id);
  if (localStorage.getItem(marker) === 'done') return false;

  const legacy = readV2Data();
  if (!legacy) {
    localStorage.setItem(marker, 'done');
    return false;
  }

  setSyncStatus('Migrando dados da V2…');

  const local = legacy.data;
  const { data: cloudCategories, error: categoryReadError } = await supabase
    .from('categories')
    .select('*');

  if (categoryReadError) throw categoryReadError;

  const categoryMap = new Map();
  const categoriesByName = new Map(
    (cloudCategories || []).map((category) => [normalizeName(category.name), category])
  );

  const localCategories = Array.isArray(local.categories) ? local.categories : [];

  for (const localCategory of localCategories) {
    const name = String(localCategory.name || localCategory.title || 'Outros').trim();
    const icon = localCategory.icon || localCategory.emoji || '📌';
    let cloudCategory = categoriesByName.get(normalizeName(name));

    if (!cloudCategory) {
      const { data: created, error } = await supabase
        .from('categories')
        .insert({
          user_id: currentUser.id,
          name,
          icon
        })
        .select()
        .single();

      if (error) throw error;
      cloudCategory = created;
      categoriesByName.set(normalizeName(name), created);
    }

    const oldId = localCategory.id ?? localCategory.categoryId ?? name;
    categoryMap.set(String(oldId), cloudCategory.id);
    categoryMap.set(normalizeName(name), cloudCategory.id);
  }

  let fallbackCategory =
    categoriesByName.get('outros') ||
    categoriesByName.values().next().value;

  if (!fallbackCategory) {
    const { data: created, error } = await supabase
      .from('categories')
      .insert({
        user_id: currentUser.id,
        name: 'Outros',
        icon: '📦'
      })
      .select()
      .single();

    if (error) throw error;
    fallbackCategory = created;
  }

  const { data: cloudTransactions, error: transactionReadError } = await supabase
    .from('transactions')
    .select('description,amount,date,type,installment_current,installment_total');

  if (transactionReadError) throw transactionReadError;

  const existingFingerprints = new Set(
    (cloudTransactions || []).map(transactionFingerprint)
  );

  const sourceTransactions = Array.isArray(local.transactions)
    ? local.transactions
    : [];

  const transactionRows = [];

  for (const transaction of sourceTransactions) {
    const description =
      transaction.description ||
      transaction.name ||
      transaction.title ||
      'Lançamento migrado';

    const amount = Number(
      transaction.amount ??
      transaction.value ??
      transaction.valor ??
      0
    );

    if (!amount) continue;

    const type =
      transaction.type === 'income' ||
      transaction.type === 'entrada' ||
      transaction.kind === 'income'
        ? 'income'
        : 'expense';

    const oldCategoryId =
      transaction.categoryId ??
      transaction.category_id ??
      transaction.category ??
      '';

    const categoryId =
      categoryMap.get(String(oldCategoryId)) ||
      categoryMap.get(normalizeName(oldCategoryId)) ||
      fallbackCategory.id;

    const row = {
      user_id: currentUser.id,
      description: String(description),
      amount,
      date: toIsoDate(transaction.date),
      type,
      category_id: categoryId,
      installment_group:
        transaction.installment_group ||
        transaction.installmentGroup ||
        null,
      installment_current: Number(
        transaction.installment_current ??
        transaction.current ??
        1
      ),
      installment_total: Number(
        transaction.installment_total ??
        transaction.installments ??
        1
      )
    };

    const fingerprint = transactionFingerprint(row);
    if (!existingFingerprints.has(fingerprint)) {
      existingFingerprints.add(fingerprint);
      transactionRows.push(row);
    }
  }

  if (transactionRows.length) {
    const { error } = await supabase
      .from('transactions')
      .insert(transactionRows);

    if (error) throw error;
  }

  const budgetRows = [];
  const localBudgets = local.budgets || {};

  for (const [month, categoryValues] of Object.entries(localBudgets)) {
    if (!categoryValues || typeof categoryValues !== 'object') continue;

    for (const [oldCategoryId, rawAmount] of Object.entries(categoryValues)) {
      const amount = Number(rawAmount);
      if (!amount) continue;

      const categoryId =
        categoryMap.get(String(oldCategoryId)) ||
        categoryMap.get(normalizeName(oldCategoryId));

      if (!categoryId) continue;

      budgetRows.push({
        user_id: currentUser.id,
        month: `${String(month).slice(0, 7)}-01`,
        category_id: categoryId,
        amount
      });
    }
  }

  if (budgetRows.length) {
    const { error } = await supabase
      .from('budgets')
      .upsert(budgetRows, {
        onConflict: 'user_id,month,category_id'
      });

    if (error) throw error;
  }

  localStorage.setItem(marker, 'done');
  localStorage.setItem(
    `${marker}_summary`,
    JSON.stringify({
      sourceKey: legacy.key,
      migratedAt: new Date().toISOString(),
      transactions: transactionRows.length,
      budgets: budgetRows.length
    })
  );

  return true;
}

async function initializeAccount() {
  await ensureDefaultCategories();
  const migrated = await migrateV2Automatically();
  await loadCloud();

  if (migrated) {
    setSyncStatus('✓ V2 migrada e sincronizada');
  }
}

async function start() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    setAuthMessage(error.message, true);
    showAuth();
    return;
  }

  if (!session) {
    showAuth();
    return;
  }

  currentUser = session.user;
  showApp();

  try {
    await initializeAccount();
  } catch (error) {
    console.error(error);
    setSyncStatus('Erro de sincronização');
    alert(`Não foi possível sincronizar: ${error.message}`);
  }
}

$('loginBtn').onclick = async () => {
  const email = $('email').value.trim();
  const password = $('password').value;

  if (!email || !password) {
    setAuthMessage('Informe o e-mail e a senha.', true);
    return;
  }

  setAuthMessage('Entrando…');

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) setAuthMessage(error.message, true);
};

$('signupBtn').onclick = async () => {
  const email = $('email').value.trim();
  const password = $('password').value;

  if (!email || password.length < 6) {
    setAuthMessage(
      'Use um e-mail válido e uma senha de pelo menos 6 caracteres.',
      true
    );
    return;
  }

  setAuthMessage('Criando conta…');

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    setAuthMessage(error.message, true);
    return;
  }

  if (data.session) {
    setAuthMessage('Conta criada. Entrando…');
  } else {
    setAuthMessage('Conta criada. Confira seu e-mail para confirmar.');
  }
};

$('logout').onclick = async () => {
  await supabase.auth.signOut();
  currentUser = null;
  showAuth();
};

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    showAuth();
    return;
  }

  if (session && (!currentUser || currentUser.id !== session.user.id)) {
    currentUser = session.user;
    showApp();

    try {
      await initializeAccount();
    } catch (error) {
      console.error(error);
      setSyncStatus('Erro de sincronização');
      alert(`Não foi possível sincronizar: ${error.message}`);
    }
  }
});

$('month').onchange = (event) => {
  selectedMonth = event.target.value;
  render();
};

const categories = () => state.categories;

const monthTransactions = () =>
  state.transactions.filter((transaction) =>
    String(transaction.date).startsWith(selectedMonth)
  );

const spentByCategory = (categoryId) =>
  monthTransactions()
    .filter(
      (transaction) =>
        transaction.type === 'expense' &&
        transaction.category_id === categoryId
    )
    .reduce((total, transaction) => total + Number(transaction.amount), 0);

function render() {
  $('month').value = selectedMonth;

  const current = monthTransactions();
  const expenses = current
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const income = current
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const budget = Object.values(state.budgets[selectedMonth] || {})
    .reduce((sum, value) => sum + Number(value || 0), 0);

  $('summary').innerHTML = `
    <div class="card hero">
      <div class="label">Disponível do orçamento</div>
      <div class="value">${money(budget - expenses)}</div>
      <div class="small" style="color:#cbd5e1">${selectedMonth}</div>
    </div>
    <div class="card">
      <div class="label">Entradas</div>
      <div class="value green">${money(income)}</div>
    </div>
    <div class="card">
      <div class="label">Gastos</div>
      <div class="value red">${money(expenses)}</div>
    </div>
    <div class="card">
      <div class="label">Orçamento</div>
      <div class="value">${money(budget)}</div>
    </div>
    <div class="card">
      <div class="label">Resultado</div>
      <div class="value">${money(income - expenses)}</div>
    </div>
  `;

  renderBudgets();
  renderLists();
  renderAnalysis();
  renderFilters();
}

function renderBudgets() {
  const budget = state.budgets[selectedMonth] || {};

  $('budgets').innerHTML = categories()
    .map((category) => {
      const limit = Number(budget[category.id] || 0);
      const spent = spentByCategory(category.id);
      const percentage = limit ? Math.min(100, (spent / limit) * 100) : 0;

      return `
        <div style="margin-bottom:14px">
          <div class="row">
            <span>${category.icon} ${escapeHtml(category.name)}</span>
            <span class="small">
              ${money(spent)} / ${limit ? money(limit) : 'sem limite'}
            </span>
          </div>
          ${
            limit
              ? `<div class="progress">
                   <div class="bar" style="width:${percentage}%"></div>
                 </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

function transactionItem(transaction) {
  const category = categories().find(
    (item) => item.id === transaction.category_id
  );

  return `
    <div class="item">
      <div>
        <div class="title">
          ${category?.icon || '•'} ${escapeHtml(transaction.description)}
        </div>
        <div class="meta">
          ${new Date(`${transaction.date}T12:00:00`).toLocaleDateString('pt-BR')}
          · ${escapeHtml(category?.name || 'Sem categoria')}
          ${
            transaction.installment_total > 1
              ? `· ${transaction.installment_current}/${transaction.installment_total}`
              : ''
          }
        </div>
      </div>
      <div style="text-align:right">
        <b class="${transaction.type === 'expense' ? 'red' : 'green'}">
          ${transaction.type === 'expense' ? '-' : '+'}
          ${money(transaction.amount)}
        </b>
        <br>
        <button class="small" onclick="deleteTransaction('${transaction.id}')">
          excluir
        </button>
      </div>
    </div>
  `;
}

function renderLists() {
  const recent = [...monthTransactions()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 6);

  $('recent').innerHTML =
    recent.map(transactionItem).join('') ||
    '<div class="empty">Nenhum lançamento.</div>';

  let filtered = [...monthTransactions()];
  const categoryFilter = $('fcat').value;
  const typeFilter = $('ftype').value;

  if (categoryFilter) {
    filtered = filtered.filter(
      (transaction) => transaction.category_id === categoryFilter
    );
  }

  if (typeFilter) {
    filtered = filtered.filter(
      (transaction) => transaction.type === typeFilter
    );
  }

  $('all').innerHTML =
    filtered.map(transactionItem).join('') ||
    '<div class="empty">Nenhum lançamento encontrado.</div>';

  const today = new Date().toISOString().slice(0, 10);
  const futureInstallments = state.transactions
    .filter(
      (transaction) =>
        transaction.type === 'expense' &&
        transaction.installment_total > 1 &&
        transaction.date >= today
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 8);

  $('installments').innerHTML =
    futureInstallments.map(transactionItem).join('') ||
    '<div class="card empty">Nenhuma parcela futura cadastrada.</div>';
}

function renderAnalysis() {
  const current = monthTransactions();

  const expenses = current
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const income = current
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const budget = Object.values(state.budgets[selectedMonth] || {})
    .reduce((sum, value) => sum + Number(value || 0), 0);

  $('analysisBox').innerHTML = `
    <div class="row"><span>Entradas</span><b class="green">${money(income)}</b></div>
    <hr>
    <div class="row"><span>Gastos</span><b class="red">${money(expenses)}</b></div>
    <hr>
    <div class="row"><span>Resultado</span><b>${money(income - expenses)}</b></div>
    <hr>
    <div class="row"><span>Orçamento</span><b>${money(budget)}</b></div>
  `;

  $('catsBox').innerHTML =
    categories()
      .map((category) => ({
        category,
        value: spentByCategory(category.id)
      }))
      .filter((item) => item.value)
      .sort((a, b) => b.value - a.value)
      .map(
        (item) => `
          <div class="row" style="padding:8px 0">
            <span>${item.category.icon} ${escapeHtml(item.category.name)}</span>
            <b>${money(item.value)}</b>
          </div>
        `
      )
      .join('') ||
    '<div class="empty">Sem dados.</div>';
}

function renderFilters() {
  const currentValue = $('fcat').value;

  $('fcat').innerHTML =
    '<option value="">Todas as categorias</option>' +
    categories()
      .map(
        (category) =>
          `<option value="${category.id}">
            ${category.icon} ${escapeHtml(category.name)}
          </option>`
      )
      .join('');

  $('fcat').value = currentValue;
}

function openTransactionForm(type) {
  $('modal').classList.add('open');

  $('sheet').innerHTML = `
    <h2>${type === 'expense' ? 'Novo gasto' : 'Nova entrada'}</h2>

    <label>Descrição</label>
    <input id="desc" class="field">

    <label>Valor</label>
    <input id="amount" class="field" type="number" step="0.01" min="0.01">

    <label>Data</label>
    <input
      id="date"
      class="field"
      type="date"
      value="${new Date().toISOString().slice(0, 10)}"
    >

    <label>Categoria</label>
    <select id="cat" class="field">
      ${categories()
        .map(
          (category) =>
            `<option value="${category.id}">
              ${category.icon} ${escapeHtml(category.name)}
            </option>`
        )
        .join('')}
    </select>

    ${
      type === 'expense'
        ? `
          <label>Parcelas</label>
          <select id="inst" class="field">
            ${Array.from({ length: 24 }, (_, index) => {
              const value = index + 1;
              return `<option value="${value}">
                ${value === 1 ? 'À vista' : `${value}x`}
              </option>`;
            }).join('')}
          </select>
          <div class="small">O valor informado é o valor de cada parcela.</div>
        `
        : ''
    }

    <div class="actions">
      <button class="btn alt" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveTransaction('${type}')">Salvar</button>
    </div>
  `;
}

window.expenseModal = () => openTransactionForm('expense');
window.incomeModal = () => openTransactionForm('income');
window.closeModal = closeModal;

window.saveTransaction = async (type) => {
  const description = $('desc').value.trim();
  const amount = Number($('amount').value);
  const date = $('date').value;
  const categoryId = $('cat').value;
  const installments =
    type === 'expense' ? Number($('inst').value) : 1;

  if (!description || !amount || !date || !categoryId) {
    alert('Preencha todos os campos obrigatórios.');
    return;
  }

  setSyncStatus('Salvando…');

  const baseDate = new Date(`${date}T12:00:00`);
  const installmentGroup = crypto.randomUUID();
  const rows = [];

  for (let index = 0; index < installments; index += 1) {
    const installmentDate = new Date(baseDate);
    installmentDate.setMonth(installmentDate.getMonth() + index);

    rows.push({
      user_id: currentUser.id,
      description,
      amount,
      date: installmentDate.toISOString().slice(0, 10),
      type,
      category_id: categoryId,
      installment_group: installmentGroup,
      installment_current: index + 1,
      installment_total: installments
    });
  }

  const { error } = await supabase
    .from('transactions')
    .insert(rows);

  if (error) {
    setSyncStatus('Erro ao salvar');
    alert(error.message);
    return;
  }

  closeModal();
  await loadCloud();
};

window.deleteTransaction = async (id) => {
  if (!confirm('Excluir este lançamento?')) return;

  setSyncStatus('Excluindo…');

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) {
    setSyncStatus('Erro ao excluir');
    alert(error.message);
    return;
  }

  await loadCloud();
};

window.budgetModal = () => {
  $('modal').classList.add('open');
  const currentBudget = state.budgets[selectedMonth] || {};

  $('sheet').innerHTML = `
    <h2>Orçamento mensal</h2>

    ${categories()
      .map(
        (category) => `
          <label>${category.icon} ${escapeHtml(category.name)}</label>
          <input
            data-id="${category.id}"
            class="field budget-input"
            type="number"
            step="0.01"
            min="0"
            value="${currentBudget[category.id] || ''}"
          >
        `
      )
      .join('')}

    <div class="actions">
      <button class="btn alt" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveBudget()">Salvar</button>
    </div>
  `;
};

window.saveBudget = async () => {
  setSyncStatus('Salvando orçamento…');

  const inputs = [...document.querySelectorAll('.budget-input')];
  const rows = inputs
    .filter((input) => Number(input.value) > 0)
    .map((input) => ({
      user_id: currentUser.id,
      month: `${selectedMonth}-01`,
      category_id: input.dataset.id,
      amount: Number(input.value)
    }));

  const categoryIdsWithValue = new Set(
    rows.map((row) => row.category_id)
  );

  const idsToDelete = inputs
    .filter(
      (input) =>
        !categoryIdsWithValue.has(input.dataset.id) &&
        state.budgets[selectedMonth]?.[input.dataset.id]
    )
    .map((input) => input.dataset.id);

  if (idsToDelete.length) {
    const { error: deleteError } = await supabase
      .from('budgets')
      .delete()
      .eq('month', `${selectedMonth}-01`)
      .in('category_id', idsToDelete);

    if (deleteError) {
      setSyncStatus('Erro no orçamento');
      alert(deleteError.message);
      return;
    }
  }

  if (rows.length) {
    const { error } = await supabase
      .from('budgets')
      .upsert(rows, {
        onConflict: 'user_id,month,category_id'
      });

    if (error) {
      setSyncStatus('Erro no orçamento');
      alert(error.message);
      return;
    }
  }

  closeModal();
  await loadCloud();
};

window.categoryModal = () => {
  $('modal').classList.add('open');

  $('sheet').innerHTML = `
    <h2>Nova categoria</h2>

    <label>Nome</label>
    <input id="categoryName" class="field">

    <label>Ícone</label>
    <input id="categoryIcon" class="field" value="📌">

    <div class="actions">
      <button class="btn alt" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveCategory()">Adicionar</button>
    </div>
  `;
};

window.saveCategory = async () => {
  const name = $('categoryName').value.trim();
  const icon = $('categoryIcon').value || '📌';

  if (!name) {
    alert('Digite o nome da categoria.');
    return;
  }

  const duplicate = categories().some(
    (category) => normalizeName(category.name) === normalizeName(name)
  );

  if (duplicate) {
    alert('Já existe uma categoria com esse nome.');
    return;
  }

  setSyncStatus('Salvando categoria…');

  const { error } = await supabase
    .from('categories')
    .insert({
      user_id: currentUser.id,
      name,
      icon
    });

  if (error) {
    setSyncStatus('Erro ao salvar');
    alert(error.message);
    return;
  }

  closeModal();
  await loadCloud();
};

$('fcat').onchange = render;
$('ftype').onchange = render;

$('modal').onclick = (event) => {
  if (event.target.id === 'modal') closeModal();
};

document.querySelectorAll('.tab').forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach((item) =>
      item.classList.remove('active')
    );

    tab.classList.add('active');

    document.querySelectorAll('.screen').forEach((screen) =>
      screen.classList.remove('active')
    );

    $(tab.dataset.s).classList.add('active');
    render();
  };
});

window.addEventListener('online', async () => {
  if (!currentUser) return;

  try {
    await loadCloud();
  } catch (error) {
    console.error(error);
    setSyncStatus('Sem conexão');
  }
});

window.addEventListener('offline', () => {
  if (currentUser) setSyncStatus('Offline');
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

start();
