
// ========== 认证 ==========
// 维护提示：后续新增功能时，失败分支请顺手调用 reportFrontendError，便于排错。

async function reportFrontendError(payload) {
  try {
    await fetch('/api/frontend-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

window.addEventListener('error', function(e) {
  reportFrontendError({
    kind: 'window_error',
    page: location.href,
    message: e.message,
    source: e.filename,
    line: e.lineno,
    column: e.colno,
    stack: e.error && e.error.stack ? e.error.stack : ''
  });
});

window.addEventListener('unhandledrejection', function(e) {
  reportFrontendError({
    kind: 'promise_rejection',
    page: location.href,
    message: e.reason && e.reason.message ? e.reason.message : String(e.reason),
    stack: e.reason && e.reason.stack ? e.reason.stack : ''
  });
});


var currentUser = null;
var previewRecords = [];
var allProjects = [];
var accountBalance = 0;
var reportBalance = 0;
var allRecords = [];
var reportSort = { field: 'date', asc: false };
var reportDirty = {};
var reportSelected = {};
var orgStructureData = null;
var orgEditingName = false;
var initialBalanceSet = false;
var allOrganizations = [];
var allSystemUsers = [];
var selectedOrgId = null;
var reportMeta = { view: 'mine', parentView: 'mine', ownerUserId: null, ownerOptions: [], balanceLabel: '当前余额' };
var adminDashboardData = null;

function resetClientState() {
  previewRecords = [];
  allProjects = [];
  allRecords = [];
  reportDirty = {};
  reportSelected = {};
  accountBalance = 0;
  reportBalance = 0;
  var inputBox = document.getElementById('inputBox');
  if (inputBox) inputBox.value = '';
  var tableWrap = document.getElementById('tableWrap');
  if (tableWrap) tableWrap.innerHTML = '<div class="empty-hint">输入记账文字，点击「转换」生成预览</div>';
  var reportWrap = document.getElementById('reportTableWrap');
  if (reportWrap) reportWrap.innerHTML = '<div class="empty-hint" id="reportEmpty">暂无数据</div>';
  var recentList = document.getElementById('recentList');
  if (recentList) recentList.innerHTML = '加载中...';
  var filterText = document.getElementById('filterText');
  if (filterText) filterText.value = '';
  var filterProject = document.getElementById('filterProject');
  if (filterProject) filterProject.innerHTML = '<option value="">全部项目</option>';
  var filterMonth = document.getElementById('filterMonth');
  if (filterMonth) filterMonth.value = '';
  var reportOwnerFilter = document.getElementById('reportOwnerFilter');
  if (reportOwnerFilter) reportOwnerFilter.innerHTML = '<option value="">全部项目主管</option>';
  allOrganizations = [];
  allSystemUsers = [];
  selectedOrgId = null;
  reportMeta = { view: 'mine', parentView: 'mine', ownerUserId: null, ownerOptions: [], balanceLabel: '当前余额' };
  adminDashboardData = null;
  initialBalanceSet = false;
  setBalanceModalVisible(false);
  setPreviewActionState(false);
  setReportSaveButtonVisible(false);
  setReportDeleteButtonVisible();
  updateDashboardStats();
}

function setBalanceModalVisible(visible) {
  var modal = document.getElementById('balanceModal');
  if (!modal) return;
  modal.classList[visible ? 'add' : 'remove']('show');
}

function setBottomBarVisible(visible) {
  var bottomBar = document.getElementById('bottomBar');
  if (!bottomBar) return;
  bottomBar.style.display = visible ? '' : 'none';
}

function shouldShowInitBalanceModal(data) {
  return data.records.length === 0 && !allProjects.length && !initialBalanceSet;
}

function setPreviewActionState(hasPreview) {
  var saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.disabled = !hasPreview;
  var clearBtn = document.getElementById('clearBtn');
  if (clearBtn) clearBtn.style.display = hasPreview ? 'inline-flex' : 'none';
}

function setReportDeleteButtonVisible() {
  var reportDeleteBtn = document.getElementById('reportDeleteBtn');
  if (!reportDeleteBtn) return;
  reportDeleteBtn.style.display = Object.keys(reportSelected).length ? 'inline-flex' : 'none';
}

function setReportSaveButtonVisible(hasDirty) {
  var reportSaveBtn = document.getElementById('reportSaveBtn');
  if (!reportSaveBtn) return;
  reportSaveBtn.style.display = hasDirty ? 'inline-flex' : 'none';
  if (!hasDirty) {
    reportSaveBtn.disabled = false;
    reportSaveBtn.textContent = '💾 保存修改';
  }
}

function applyAuthenticatedUser(user) {
  resetClientState();
  currentUser = user;
  selectedOrgId = user && user.organization_id ? user.organization_id : null;
  document.getElementById('loginOverlay').classList.remove('show');
  document.getElementById('userName').textContent = currentUser.display_name || currentUser.username;
  var roleText = document.getElementById('userRoleText');
  if (roleText) roleText.textContent = getRoleLabel(currentUser);
  syncRoleAwareUi();
}

function isSystemAdmin() {
  return !!(currentUser && (currentUser.is_admin || currentUser.role === 'admin'));
}

function isBossUser() {
  return !!(currentUser && !isSystemAdmin() && currentUser.role === 'boss');
}

function isStaffUser() {
  return !!(currentUser && !isSystemAdmin() && currentUser.role === 'staff');
}

function getDefaultReportView() {
  if (isBossUser()) return 'mine';
  if (isStaffUser()) return 'mine';
  if (isSystemAdmin()) return 'all';
  return 'mine';
}

function getRoleLabel(user) {
  if (!user) return '';
  if (user.is_admin || user.role === 'admin') return '开发人员';
  if (user.role === 'boss') return 'Boss';
  if (user.role === 'staff') return '项目主管';
  return '普通账号';
}

function syncRoleAwareUi() {
  var navOrgLabel = document.querySelector('#nav-org .side-label');
  if (navOrgLabel) {
    navOrgLabel.textContent = isSystemAdmin() ? '全局管理' : (isBossUser() ? '组织管理' : '我的组织');
  }

  var roleSummary = document.getElementById('settingsRoleSummary');
  if (roleSummary) {
    if (isSystemAdmin()) roleSummary.textContent = '你当前使用的是开发人员账号，可以查看全部组织、创建 Boss 组织，并为选中组织补项目主管账号。';
    else if (isBossUser()) roleSummary.textContent = '你当前使用的是 Boss 账号，可以管理自己组织、添加项目主管、改组织名称，并切换查看自己或项目主管的账目。';
    else if (isStaffUser()) roleSummary.textContent = '你当前使用的是项目主管账号，这里只保留你自己的记账和报表流程，不显示组织管理或团队账目入口。';
    else roleSummary.textContent = '当前可以在这里安全退出账号。';
  }

  var usageSummary = document.getElementById('settingsUsageSummary');
  if (usageSummary) {
    if (isSystemAdmin()) usageSummary.textContent = '建议先去“全局管理”里选组织，再创建 Boss 组织或项目主管账号。这个账号主要用于维护系统，不负责日常记账。';
    else if (isBossUser()) usageSummary.textContent = '建议先在“组织管理”里维护项目主管，再到“财务报表”里用固定卡片和项目主管筛选查看账目。你看到的是自己组织内的数据。';
    else if (isStaffUser()) usageSummary.textContent = '你的主流程是：输入记账内容、预览、保存，再去“财务报表”查看你自己的记录。界面里不会出现团队切换入口。';
    else usageSummary.textContent = '桌面端采用左右双栏，更适合同时看输入与预览；手机端自动切换为上下布局，方便竖屏操作。';
  }

  var modeTag = document.getElementById('settingsModeTag');
  if (modeTag) {
    modeTag.textContent = isSystemAdmin() ? '当前模式：开发人员' : (isBossUser() ? '当前模式：Boss' : (isStaffUser() ? '当前模式：项目主管' : '当前已启用自动适配'));
  }

  var orgMeta = document.getElementById('orgPanelMeta');
  if (orgMeta) {
    if (isSystemAdmin()) orgMeta.textContent = '开发人员账号可切换全部组织，创建 Boss 组织，并为选中组织补项目主管账号。';
    else if (isBossUser()) orgMeta.textContent = 'Boss 账号可以管理自己组织：改组织名称、添加项目主管、删除无账单项目主管。';
    else if (isStaffUser()) orgMeta.textContent = '项目主管账号在这里仅查看自己组织成员，不能修改组织和成员。';
    else orgMeta.textContent = 'Boss 管理自己组织，项目主管只读，开发人员账号可看全局。';
  }
}

function getActiveOrganizationId() {
  if (selectedOrgId !== null && selectedOrgId !== undefined && selectedOrgId !== '') return selectedOrgId;
  return currentUser ? currentUser.organization_id : null;
}

async function checkAuth() {
  try {
    var resp = await fetch('/api/me');
    var data = await resp.json();
    if (data.user) {
      applyAuthenticatedUser(data.user);
      await init();
    } else {
      showLogin();
    }
  } catch (e) { showLogin(); }
}

function showLogin() {
  currentUser = null;
  var roleText = document.getElementById('userRoleText');
  if (roleText) roleText.textContent = '--';
  document.getElementById('loginOverlay').classList.add('show');
}

async function doLogin() {
  var username = document.getElementById('loginUsername').value.trim();
  var password = document.getElementById('loginPassword').value;
  var btn = document.getElementById('loginBtn');
  var err = document.getElementById('loginErr');
  if (!username || !password) { err.textContent = '请输入账号和密码'; return; }
  btn.disabled = true; btn.textContent = '登录中...'; err.textContent = '';
  try {
    var resp = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });
    var data = await resp.json();
    if (!resp.ok) { err.textContent = data.detail || '登录失败'; return; }
    applyAuthenticatedUser(data.user);
    await init();
  } catch (e) { reportFrontendError({ kind: 'login_error', page: location.href, message: e.message, stack: e.stack || '' }); err.textContent = '网络错误，请重试'; }
  finally { btn.disabled = false; btn.textContent = '登录'; }
}

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  resetClientState();
  currentUser = null;
  showLogin();
}

async function changeMyPassword() {
  var currentPassword = document.getElementById('currentPassword').value;
  var newPassword = document.getElementById('newPassword').value;
  var confirmPassword = document.getElementById('confirmPassword').value;
  if (!currentPassword || !newPassword || !confirmPassword) {
    alert('请填写当前密码、新密码和确认密码');
    return;
  }
  try {
    var resp = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      })
    });
    var data = await resp.json();
    if (!resp.ok) {
      alert(data.detail || '修改密码失败');
      return;
    }
    ['currentPassword', 'newPassword', 'confirmPassword'].forEach(function(id) {
      var input = document.getElementById(id);
      if (input) input.value = '';
    });
    alert('密码修改成功，请记住新密码');
  } catch (e) {
    reportFrontendError({ kind: 'change_password_error', page: location.href, message: e.message, stack: e.stack || '' });
    alert('修改密码失败：' + e.message);
  }
}

async function resetUserPassword(userId, username) {
  var newPassword = prompt('请输入要重置给账号 ' + username + ' 的新密码（至少 6 位）');
  if (newPassword === null) return;
  if (!newPassword.trim()) {
    alert('新密码不能为空');
    return;
  }
  try {
    var resp = await fetch('/api/admin/users/' + userId + '/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword.trim() })
    });
    var data = await resp.json();
    if (!resp.ok) {
      alert(data.detail || '重置密码失败');
      return;
    }
    alert('已为账号 ' + username + ' 重置密码');
    if (isSystemAdmin()) {
      await loadOrganizations();
      renderOrgStructure();
    }
  } catch (e) {
    reportFrontendError({ kind: 'reset_password_error', page: location.href, message: e.message, stack: e.stack || '' });
    alert('重置密码失败：' + e.message);
  }
}

document.getElementById('loginPassword').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doLogin();
});

checkAuth();

function switchView(name) {
  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.sidebar-item').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('nav-' + name).classList.add('active');
  var orgTitle = isSystemAdmin() ? '\u{1F6E0}\uFE0F \u5168\u5C40\u7BA1\u7406' : (isBossUser() ? '\u{1F3E2} \u7EC4\u7EC7\u7BA1\u7406' : '\u{1F465} \u6211\u7684\u7EC4\u7EC7');
  var titles = { bookkeeping: '\u{1F4D2} \u5DE5\u4F5C\u8BB0\u8D26', report: '\u{1F4CA} \u8D22\u52A1\u62A5\u8868', org: orgTitle, settings: '\u2699\uFE0F \u8BBE\u7F6E' };
  document.getElementById('viewTitle').innerHTML = titles[name] || '\u5DE5\u4F5C\u8BB0\u8D26';
  if (name === 'report') { setBottomBarVisible(false); loadReport(); }
  else if (name === 'org') { setBottomBarVisible(false); loadOrgStructure(); }
  else { setBottomBarVisible(true); }
}


async function syncBalanceFromServer() {
  var resp = await fetch('/api/load');
  var data = await resp.json();
  accountBalance = parseFloat(data.balance || 0);
  allProjects = data.projects || [];
  initialBalanceSet = !!data.initial_balance_set;
  updateDashboardStats();
  return data;
}

async function init() {
  try {
    var data = await syncBalanceFromServer();
    setBalanceModalVisible(shouldShowInitBalanceModal(data));
    orgStructureData = null;
    orgEditingName = false;
    loadRecent();
  } catch (e) { reportFrontendError({ kind: 'init_error', page: location.href, message: e.message, stack: e.stack || '' }); setBalanceModalVisible(true); }
}

async function loadOrgStructure() {
  var wrap = document.getElementById('orgStructureWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-hint">加载中...</div>';
  try {
    if (isSystemAdmin() && !allOrganizations.length) {
      await loadOrganizations();
    }
    var orgId = getActiveOrganizationId();
    var query = orgId ? ('?organization_id=' + encodeURIComponent(orgId)) : '';
    var resp = await fetch('/api/org-structure' + query);
    var data = await resp.json();
    if (!resp.ok) {
      wrap.innerHTML = '<div class="empty-hint">' + esc(data.detail || '加载失败') + '</div>';
      return;
    }
    orgStructureData = data;
    orgEditingName = false;
    renderOrgStructure();
  } catch (e) {
    reportFrontendError({ kind: 'org_structure_load_error', page: location.href, message: e.message, stack: e.stack || '' });
    wrap.innerHTML = '<div class="empty-hint">组织架构加载失败</div>';
  }
}

async function loadOrganizations() {
  if (!isSystemAdmin()) {
    allOrganizations = [];
    allSystemUsers = [];
    adminDashboardData = null;
    return;
  }
  var orgResp = await fetch('/api/admin/organizations');
  var orgData = await orgResp.json();
  if (!orgResp.ok) {
    throw new Error(orgData.detail || '组织列表加载失败');
  }
  var userResp = await fetch('/api/admin/users');
  var userData = await userResp.json();
  if (!userResp.ok) {
    throw new Error(userData.detail || '用户列表加载失败');
  }
  allOrganizations = orgData.organizations || [];
  allSystemUsers = userData.users || [];
  if ((!selectedOrgId || !String(selectedOrgId).trim()) && allOrganizations.length) {
    selectedOrgId = allOrganizations[0].id;
  }
  var dashboardResp = await fetch('/api/admin/dashboard');
  var dashboardData = await dashboardResp.json();
  if (!dashboardResp.ok) {
    throw new Error(dashboardData.detail || '开发人员看板加载失败');
  }
  adminDashboardData = dashboardData;
}

function getCurrentOrganizationMembers() {
  if (!orgStructureData || !orgStructureData.members) return [];
  return orgStructureData.members;
}

function countUsersByRole(users, roleName) {
  return users.filter(function(user) {
    return roleName === 'admin'
      ? (user.is_admin || user.role === 'admin')
      : user.role === roleName;
  }).length;
}

function renderSummaryChip(label, value, tone) {
  var color = tone || '#6f8579';
  return '' +
    '<div style="min-width:132px;padding:14px 16px;border:1px solid var(--line);border-radius:18px;background:#fff">' +
      '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">' + esc(label) + '</div>' +
      '<div style="font-size:24px;font-weight:700;color:' + color + '">' + esc(String(value)) + '</div>' +
    '</div>';
}

function formatBytes(bytes) {
  var value = Number(bytes || 0);
  if (value < 1024) return value + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
  if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB';
  return (value / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function renderAdminActivityTable(items) {
  if (!items.length) {
    return '<div class="empty-hint" style="padding:20px">暂时还没有审计记录</div>';
  }
  var rows = items.map(function(item) {
    return '' +
      '<tr>' +
        '<td style="padding:12px 14px;font-weight:700;color:#243127">' + esc(item.username || '匿名') + '</td>' +
        '<td style="padding:12px 14px;color:#6f8579">' + esc(item.role || '--') + '</td>' +
        '<td style="padding:12px 14px">' + esc(item.event_type || '--') + '</td>' +
        '<td style="padding:12px 14px;color:var(--muted)">' + esc(item.request_path || '--') + '</td>' +
        '<td style="padding:12px 14px">' + esc(String(item.total_tokens || 0)) + '</td>' +
        '<td style="padding:12px 14px;color:var(--muted)">' + esc(item.created_at || '--') + '</td>' +
      '</tr>';
  }).join('');
  return '' +
    '<div style="overflow:auto;border:1px solid var(--line);border-radius:18px;background:#fff">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">账号</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">角色</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">操作</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">接口</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">Token</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">时间</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
}

function renderAdminUserActivityTable(items) {
  if (!items.length) {
    return '<div class="empty-hint" style="padding:20px">暂时还没有账号活跃记录</div>';
  }
  return items.map(function(item) {
    return '' +
      '<div style="display:flex;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)">' +
        '<div>' +
          '<div style="font-weight:700;color:#243127">' + esc(item.username || '匿名账号') + '</div>' +
          '<div style="margin-top:4px;font-size:12px;color:var(--muted)">角色：' + esc(item.role || '--') + ' | 最近活动：' + esc(item.last_seen || '--') + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-weight:700;color:#14a663">' + esc(String(item.event_count || 0)) + ' 次</div>' +
          '<div style="margin-top:4px;font-size:12px;color:var(--muted)">Token ' + esc(String(item.total_tokens || 0)) + '</div>' +
        '</div>' +
      '</div>';
  }).join('');
}

function renderAdminRecordDistributionTable(items) {
  if (!items.length) {
    return '<div class="empty-hint" style="padding:20px">暂时还没有账单数据</div>';
  }
  var rows = items.map(function(item) {
    return '' +
      '<tr>' +
        '<td style="padding:12px 14px;font-weight:700;color:#243127">' + esc(item.display_name || item.username || '--') + '</td>' +
        '<td style="padding:12px 14px">@' + esc(item.username || '--') + '</td>' +
        '<td style="padding:12px 14px;color:#6f8579">' + esc(item.role || '--') + '</td>' +
        '<td style="padding:12px 14px;font-weight:700;color:#14a663">' + esc(String(item.record_count || 0)) + '</td>' +
      '</tr>';
  }).join('');
  return '' +
    '<div style="overflow:auto;border:1px solid var(--line);border-radius:18px;background:#fff">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">显示名称</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">登录账号</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">角色</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">账单数量</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
}

function renderAdminRecentRecordsTable(items) {
  if (!items.length) {
    return '<div class="empty-hint" style="padding:20px">暂时还没有账单明细</div>';
  }
  var rows = items.map(function(item) {
    var ownerLabel = item.display_name || item.username || ('成员 #' + item.owner_user_id);
    return '' +
      '<tr>' +
        '<td style="padding:12px 14px;color:#6f8579">' + esc(item.date || '--') + '</td>' +
        '<td style="padding:12px 14px;font-weight:700;color:#243127">' + esc(item.organization_name || '--') + '</td>' +
        '<td style="padding:12px 14px">' + esc(ownerLabel) + '</td>' +
        '<td style="padding:12px 14px;color:#6f8579">' + esc(item.project_name || '--') + '</td>' +
        '<td style="padding:12px 14px">' + esc(item.purpose || '--') + '</td>' +
        '<td style="padding:12px 14px;color:#14a663">' + esc(String(item.income || 0)) + '</td>' +
        '<td style="padding:12px 14px;color:#ff6156">' + esc(String(item.expense || 0)) + '</td>' +
      '</tr>';
  }).join('');
  return '' +
    '<div style="overflow:auto;border:1px solid var(--line);border-radius:18px;background:#fff">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">日期</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">组织</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">归属人</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">项目</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">用途</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">收入</th>' +
          '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">支出</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
}

function renderCurrentOrgMemberList() {
  var members = getCurrentOrganizationMembers();
  if (!members.length) {
    return '<div class="empty-hint" style="padding:20px">当前组织还没有成员</div>';
  }
  return members.map(function(member) {
    var role = member.is_admin || member.role === 'admin' ? '开发人员' : (member.role === 'boss' ? 'Boss' : '项目主管');
    return '' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)">' +
        '<div>' +
          '<div style="font-weight:700;color:#243127">' + esc(member.display_name || member.username) + '</div>' +
          '<div style="font-size:12px;color:var(--muted)">@' + esc(member.username) + '</div>' +
        '</div>' +
        '<div style="font-size:12px;color:#6f8579;font-weight:700;white-space:nowrap">' + esc(role) + '</div>' +
      '</div>';
  }).join('');
}

function renderOrganizationHealthList() {
  if (!allOrganizations.length) {
    return '<div class="empty-hint" style="padding:20px">还没有组织，先创建 Boss 组织</div>';
  }
  return allOrganizations.map(function(org) {
    var users = allSystemUsers.filter(function(user) { return String(user.organization_id) === String(org.id); });
    var bossCount = countUsersByRole(users, 'boss');
    var staffCount = countUsersByRole(users, 'staff');
    var selected = String(org.id) === String(getActiveOrganizationId());
    return '' +
      '<button type="button" onclick="changeActiveOrganization(' + org.id + ')" style="width:100%;text-align:left;padding:14px 16px;border:1px solid ' + (selected ? 'rgba(31,190,116,.35)' : 'var(--line)') + ';border-radius:18px;background:' + (selected ? 'linear-gradient(180deg,#eef9f2,#ffffff)' : '#fff') + ';display:flex;justify-content:space-between;gap:12px">' +
        '<div>' +
          '<div style="font-weight:700;color:#243127">' + esc(org.name || '未命名组织') + '</div>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:4px">Boss ' + bossCount + ' 人，项目主管 ' + staffCount + ' 人</div>' +
        '</div>' +
        '<div style="font-size:12px;color:#6f8579;white-space:nowrap;align-self:center">#' + esc(String(org.id)) + '</div>' +
      '</button>';
  }).join('');
}

function getOrganizationNameById(organizationId) {
  var org = allOrganizations.find(function(item) { return String(item.id) === String(organizationId); });
  return org ? (org.name || ('组织 #' + org.id)) : '未归属组织';
}

function renderSystemUserTable() {
  if (!allSystemUsers.length) {
    return '<div class="empty-hint" style="padding:20px">当前还没有用户数据</div>';
  }
  var rows = allSystemUsers.map(function(user) {
    var role = user.is_admin || user.role === 'admin' ? '开发人员' : (user.role === 'boss' ? 'Boss' : '项目主管');
    var roleColor = user.is_admin || user.role === 'admin' ? '#243127' : (user.role === 'boss' ? '#3a7afe' : '#ff8a3d');
    var encodedUsername = encodeURIComponent(user.username || '');
    var action = (user.is_admin || user.role === 'admin')
      ? '<span style="font-size:12px;color:var(--muted)">自行修改</span>'
      : '<button class="btn btn-outline" style="padding:8px 12px" onclick="resetUserPassword(' + user.id + ', decodeURIComponent(\'' + encodedUsername + '\'))">重置密码</button>';
    return '' +
      '<tr>' +
        '<td style="font-weight:700;color:#243127">' + esc(user.display_name || user.username) + '</td>' +
        '<td>@' + esc(user.username) + '</td>' +
        '<td><span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.9);border:1px solid var(--line);color:' + roleColor + ';font-weight:700;font-size:12px">' + esc(role) + '</span></td>' +
        '<td>' + esc(getOrganizationNameById(user.organization_id)) + '</td>' +
        '<td>' + action + '</td>' +
      '</tr>';
  }).join('');
  return '' +
    '<div style="overflow:auto;border:1px solid var(--line);border-radius:18px;background:#fff">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead>' +
          '<tr>' +
            '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">显示名称</th>' +
            '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">登录账号</th>' +
            '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">角色</th>' +
            '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">所属组织</th>' +
            '<th style="padding:12px 14px;text-align:left;background:#fbfefc;border-bottom:1px solid var(--line)">密码管理</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
}

function renderOrganizationSelector() {
  if (!isSystemAdmin()) return '';
  if (!allOrganizations.length) {
    return '' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-left:auto">' +
        '<div class="empty-hint" style="padding:10px 14px;border:1px solid var(--line);border-radius:999px;background:#fff">暂无组织，先创建 Boss 组织</div>' +
      '</div>';
  }
  var options = allOrganizations.map(function(org) {
    var selected = String(org.id) === String(getActiveOrganizationId()) ? ' selected' : '';
    var label = (org.name || '未命名组织') + ' (#' + org.id + ')';
    return '<option value="' + org.id + '"' + selected + '>' + esc(label) + '</option>';
  }).join('');
  return '' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-left:auto">' +
      '<select id="orgSelector" class="filter-select" onchange="changeActiveOrganization(this.value)" style="min-width:220px">' +
        options +
      '</select>' +
      '<button class="btn btn-outline" onclick="loadOrgStructure()">刷新组织</button>' +
    '</div>';
}

function renderSystemAdminPanel() {
  var dashboard = adminDashboardData || {};
  var counts = dashboard.counts || {};
  var tokenUsage = dashboard.token_usage || {};
  var activeOrgId = getActiveOrganizationId();
  var activeOrg = allOrganizations.find(function(org) { return String(org.id) === String(activeOrgId); }) || null;
  var memberCountText = activeOrg ? ('当前组织成员：' + (activeOrg.member_count || 0) + ' 人') : '当前还没有可管理的组织';
  var activeOrgName = activeOrg ? (activeOrg.name || '未命名组织') : '未选择组织';
  var createStaffDisabled = activeOrg ? '' : ' disabled style="opacity:.45;cursor:not-allowed"';
  var totalBosses = countUsersByRole(allSystemUsers, 'boss');
  var totalStaff = countUsersByRole(allSystemUsers, 'staff');
  var totalAdmins = countUsersByRole(allSystemUsers, 'admin');
  return '' +
    '<div style="display:flex;flex-direction:column;gap:18px">' +
      '<div class="card" style="border-radius:28px;background:linear-gradient(180deg,#fbfefc,#f3faf6)">' +
        '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
          '<div>' +
            '<div style="font-size:22px;font-weight:700;color:#243127">开发人员控制台</div>' +
            '<div style="margin-top:6px;color:var(--muted);font-size:13px;line-height:1.7">你当前在以开发人员账号查看全局，可切换组织、创建 Boss 组织，并为选中组织添加项目主管账号。</div>' +
          '</div>' +
          '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">' +
            '<div style="padding:10px 14px;border:1px solid var(--line);border-radius:16px;background:#fff;color:#6f8579;font-weight:700">' + esc(activeOrgName) + '</div>' +
            '<div style="color:var(--muted);font-size:13px">' + esc(memberCountText) + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
            renderSummaryChip('组织总数', allOrganizations.length, '#14a663') +
            renderSummaryChip('Boss 账号', totalBosses, '#3a7afe') +
            renderSummaryChip('项目主管账号', totalStaff, '#ff8a3d') +
            renderSummaryChip('开发人员', totalAdmins, '#243127') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px">' +
        '<div class="card" style="border-radius:28px">' +
          '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
            '<div style="font-size:18px;font-weight:700;color:#243127">系统使用概览</div>' +
            '<div style="font-size:13px;color:var(--muted)">这里汇总软件总体使用情况，方便开发人员排查系统是否正在被使用，以及数据量有没有快速增长。</div>' +
            '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
              renderSummaryChip('记录条数', counts.records || 0, '#14a663') +
              renderSummaryChip('审计事件', counts.audit_events || 0, '#243127') +
              renderSummaryChip('在线会话', counts.sessions || 0, '#3a7afe') +
              renderSummaryChip('数据库大小', formatBytes(dashboard.database_size_bytes || 0), '#ff8a3d') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card" style="border-radius:28px">' +
          '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
            '<div style="font-size:18px;font-weight:700;color:#243127">Token 用量</div>' +
            '<div style="font-size:13px;color:var(--muted)">目前按 AI 分类调用累计统计，后续如果接更多 AI 功能，这里会继续累计。</div>' +
            '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
              renderSummaryChip('总 Token', tokenUsage.total_tokens || 0, '#243127') +
              renderSummaryChip('输入 Token', tokenUsage.prompt_tokens || 0, '#3a7afe') +
              renderSummaryChip('输出 Token', tokenUsage.completion_tokens || 0, '#ff8a3d') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px">' +
        '<div class="card" style="border-radius:28px">' +
          '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
            '<div style="font-size:18px;font-weight:700;color:#243127">组织总览</div>' +
            '<div style="font-size:13px;color:var(--muted)">点击任意组织后，下面会切换成该组织的详细管理视图。</div>' +
            '<div style="display:flex;flex-direction:column;gap:10px">' +
              renderOrganizationHealthList() +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card" style="border-radius:28px">' +
          '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
            '<div style="font-size:18px;font-weight:700;color:#243127">当前组织摘要</div>' +
            '<div style="font-size:13px;color:var(--muted)">这里显示当前选中组织的成员结构，方便在切换组织后快速确认有没有选对。</div>' +
            '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
              renderSummaryChip('当前组织 ID', activeOrg ? activeOrg.id : '--', '#243127') +
              renderSummaryChip('成员总数', activeOrg ? (activeOrg.member_count || 0) : 0, '#14a663') +
              renderSummaryChip('Boss 人数', activeOrg ? countUsersByRole(getCurrentOrganizationMembers(), 'boss') : 0, '#3a7afe') +
              renderSummaryChip('项目主管人数', activeOrg ? countUsersByRole(getCurrentOrganizationMembers(), 'staff') : 0, '#ff8a3d') +
            '</div>' +
            '<div style="display:flex;flex-direction:column">' +
              renderCurrentOrgMemberList() +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="border-radius:28px">' +
        '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
          '<div style="font-size:18px;font-weight:700;color:#243127">全局用户视图</div>' +
          '<div style="font-size:13px;color:var(--muted)">这里汇总所有账号的显示名称、登录账号、角色和所属组织，方便快速核对系统里的账号分布。</div>' +
          renderSystemUserTable() +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px">' +
        '<div class="card" style="border-radius:28px">' +
          '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
            '<div style="font-size:18px;font-weight:700;color:#243127">最近操作记录</div>' +
            '<div style="font-size:13px;color:var(--muted)">开发人员可以从这里快速判断最近是谁在登录、记账、导出或触发了前端错误。</div>' +
            renderAdminActivityTable(dashboard.recent_activity || []) +
          '</div>' +
        '</div>' +
        '<div class="card" style="border-radius:28px">' +
          '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
            '<div style="font-size:18px;font-weight:700;color:#243127">账号活跃概览</div>' +
            '<div style="font-size:13px;color:var(--muted)">这里按账号统计操作次数与累计 token，方便你看谁在频繁使用软件。</div>' +
            renderAdminUserActivityTable(dashboard.per_user_activity || []) +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="border-radius:28px">' +
        '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
          '<div style="font-size:18px;font-weight:700;color:#243127">账单归属分布</div>' +
          '<div style="font-size:13px;color:var(--muted)">这里显示各账号当前名下的账单数量，方便你快速发现测试账号、空账号和重度使用账号。</div>' +
          renderAdminRecordDistributionTable(dashboard.record_distribution || []) +
        '</div>' +
      '</div>' +
      '<div class="card" style="border-radius:28px">' +
        '<div class="card-body" style="display:flex;flex-direction:column;gap:14px">' +
          '<div style="font-size:18px;font-weight:700;color:#243127">全局账单审查</div>' +
          '<div style="font-size:13px;color:var(--muted)">这里展示最近的账单明细，开发人员可以快速核对哪个公司、哪个账号正在记账，以及最近的收入支出情况。</div>' +
          renderAdminRecentRecordsTable(dashboard.recent_records || []) +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px">' +
        '<div class="card" style="border-radius:28px">' +
          '<div class="card-body" style="display:flex;flex-direction:column;gap:12px">' +
            '<div style="font-size:18px;font-weight:700;color:#243127">新建 Boss 组织</div>' +
            '<input id="sysOrgName" class="filter-input" placeholder="组织名称，例如：上海业务部" style="width:100%;border-radius:16px;height:46px">' +
            '<input id="sysBossDisplayName" class="filter-input" placeholder="Boss 姓名" style="width:100%;border-radius:16px;height:46px">' +
            '<input id="sysBossUsername" class="filter-input" placeholder="Boss 登录账号" style="width:100%;border-radius:16px;height:46px">' +
            '<input id="sysBossPassword" class="filter-input" placeholder="Boss 初始密码" style="width:100%;border-radius:16px;height:46px">' +
            '<button class="btn btn-primary" onclick="createBossOrganization()">创建 Boss 组织</button>' +
          '</div>' +
        '</div>' +
        '<div class="card" style="border-radius:28px">' +
          '<div class="card-body" style="display:flex;flex-direction:column;gap:12px">' +
            '<div style="font-size:18px;font-weight:700;color:#243127">给当前组织添加项目主管</div>' +
            '<input id="orgNewDisplayName" class="filter-input" placeholder="项目主管姓名" style="width:100%;border-radius:16px;height:46px">' +
            '<input id="orgNewUsername" class="filter-input" placeholder="登录账号" style="width:100%;border-radius:16px;height:46px">' +
            '<input id="orgNewPassword" class="filter-input" placeholder="初始密码" style="width:100%;border-radius:16px;height:46px">' +
            '<button class="btn btn-primary" onclick="createOrgMember()"' + createStaffDisabled + '>添加项目主管</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function renderOrgStructure() {
  var wrap = document.getElementById('orgStructureWrap');
  if (!wrap) return;
  if (!orgStructureData) {
    wrap.innerHTML = '<div class="empty-hint">暂无组织信息</div>';
    return;
  }
  var org = orgStructureData.organization || {};
  var viewer = orgStructureData.viewer || {};
  var members = orgStructureData.members || [];
  var bosses = members.filter(function(m) { return m.role === 'boss' || m.is_admin; });
  var staff = members.filter(function(m) { return !(m.role === 'boss' || m.is_admin); });
  var html = '';
  html += '<div style="display:flex;flex-direction:column;gap:28px">';
  if (isSystemAdmin()) {
    html += renderSystemAdminPanel();
  }
  html += '<div style="display:flex;justify-content:space-between;gap:24px;align-items:flex-start;flex-wrap:wrap">';
  html += '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;min-height:56px">';
  if (orgEditingName && viewer.can_manage) {
    html += '<input id="orgNameInput" class="filter-input" value="' + esc(org.name || '神秘组织') + '" style="min-width:260px;font-size:16px;font-weight:700;padding:12px 16px">';
    html += '<button class="btn btn-outline" onclick="saveOrgName()">保存</button>';
    html += '<button class="btn btn-outline" onclick="cancelOrgNameEdit()">取消</button>';
  } else {
    html += '<div style="font-size:38px;font-weight:700;line-height:56px;min-width:180px;color:#6f8579">' + esc(org.name || '神秘组织') + '</div>';
    if (viewer.can_manage) {
      html += '<button class="btn btn-outline" onclick="startOrgNameEdit()">修改</button>';
    } else {
      html += '<button class="btn btn-outline" disabled style="opacity:.45;cursor:not-allowed">修改</button>';
    }
  }
  html += '</div>';
  if (isSystemAdmin()) {
    html += renderOrganizationSelector();
  } else if (viewer.can_manage) {
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-left:auto">';
    html += '<input id="orgNewDisplayName" class="filter-input" placeholder="项目主管姓名" style="min-width:140px">';
    html += '<input id="orgNewUsername" class="filter-input" placeholder="登录账号" style="min-width:140px">';
    html += '<input id="orgNewPassword" class="filter-input" placeholder="初始密码" style="min-width:140px">';
    html += '<button class="btn btn-primary" onclick="createOrgMember()">添加项目主管</button>';
    html += '</div>';
  } else {
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-left:auto">';
    html += '<input class="filter-input" placeholder="项目主管姓名" disabled style="min-width:140px;opacity:.45;cursor:not-allowed">';
    html += '<input class="filter-input" placeholder="登录账号" disabled style="min-width:140px;opacity:.45;cursor:not-allowed">';
    html += '<input class="filter-input" placeholder="初始密码" disabled style="min-width:140px;opacity:.45;cursor:not-allowed">';
    html += '<button class="btn btn-primary" disabled style="opacity:.45;cursor:not-allowed">添加项目主管</button>';
    html += '</div>';
  }
  html += '</div>';
  html += '<div style="display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap">';
  html += '<div class="card" style="width:198px;min-height:320px;border-radius:32px">';
  html += '<div class="card-body" style="padding:28px 22px 24px">';
  html += '<div style="font-size:22px;font-weight:700;color:#6f8579;text-align:center;margin-bottom:14px">' + (isSystemAdmin() ? 'Boss / 开发人员' : 'Boss') + '</div>';
  html += '<div style="border-top:1px solid var(--line);padding-top:14px">';
  if (bosses.length) {
    html += bosses.map(function(m) {
      var roleLabel = m.is_admin || m.role === 'admin' ? '开发人员' : 'Boss';
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0"><div><div style="font-weight:700;color:#6f8579">' + esc(m.display_name || m.username) + '</div><div style="font-size:12px;color:var(--muted)">@' + esc(m.username) + '</div></div><div style="font-size:12px;color:var(--green-deep);white-space:nowrap">' + esc(roleLabel) + '</div></div>';
    }).join('');
  } else {
    html += '<div class="empty-hint">暂无 Boss</div>';
  }
  html += '</div></div></div>';
  html += '<div class="card" style="width:198px;min-height:320px;border-radius:32px">';
  html += '<div class="card-body" style="padding:28px 22px 24px">';
  html += '<div style="font-size:22px;font-weight:700;color:#6f8579;text-align:center;margin-bottom:14px">项目主管</div>';
  html += '<div style="border-top:1px solid var(--line);padding-top:14px">';
  if (staff.length) {
    html += staff.map(function(m) {
      var action = '<button class="btn btn-danger" style="padding:8px 12px;opacity:.45;cursor:not-allowed" disabled>删除</button>';
      if (viewer.can_manage && m.can_delete) action = '<button class="btn btn-danger" style="padding:8px 12px" onclick="deleteOrgMember(' + m.id + ')">删除</button>';
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0' + (m !== staff[staff.length - 1] ? ';border-bottom:1px solid var(--line)' : '') + '"><div><div style="font-weight:700;color:#6f8579">' + esc(m.display_name || m.username) + '</div><div style="font-size:12px;color:var(--muted)">@' + esc(m.username) + '</div></div><div>' + action + '</div></div>';
    }).join('');
  } else {
    html += '<div class="empty-hint">暂无项目主管</div>';
  }
  html += '</div></div></div>';
  html += '</div>';
  wrap.innerHTML = html;
}

async function setBalance() {
  var bal = document.getElementById('initialBalance').value;
  try {
    await fetch('/api/init-balance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ balance: parseFloat(bal) || 0 }) });
    accountBalance = parseFloat(bal) || 0;
    initialBalanceSet = true;
    setBalanceModalVisible(false);
    updateTopBalance();
  } catch (e) { reportFrontendError({ kind: 'balance_init_error', page: location.href, message: e.message, stack: e.stack || '' }); alert('\u8BBE\u7F6E\u5931\u8D25\uFF1A' + e.message); }
}

function updateTopBalance() {
  updateDashboardStats();
}

async function doClassify() {
  var text = document.getElementById('inputBox').value.trim();
  if (!text) return;
  var btn = document.getElementById('convertBtn');
  btn.disabled = true; btn.textContent = '\u8F6C\u6362\u4E2D...';
  try {
    var resp = await fetch('/api/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text }) });
    var data = await resp.json();
    if (data.need_init) { setBalanceModalVisible(true); return; }
    previewRecords = data.records;
    renderPreview();
    setPreviewActionState(previewRecords.length > 0);
  } catch (e) { reportFrontendError({ kind: 'classify_error', page: location.href, message: e.message, stack: e.stack || '' }); alert('\u8F6C\u6362\u5931\u8D25\uFF1A' + e.message); }
  finally { btn.disabled = false; btn.textContent = '\u{1F50D} \u8F6C\u6362'; }
}

function renderPreview() {
  var wrap = document.getElementById('tableWrap');
  if (!previewRecords.length) {
    wrap.innerHTML = '<div class="empty-hint">没有识别到记录</div>';
    updateDashboardStats();
    return;
  }
  var headers = ['日期','项目名称','申请人','转款人','收款人','用途','收入','支出','余额','可退回','预计退回','状态','备注'];
  var html = '<table><thead><tr>';
  headers.forEach(function(h) { html += '<th>' + esc(h) + '</th>'; });
  html += '</tr></thead><tbody>';
  previewRecords.forEach(function(rec, idx) {
    html += '<tr>';
    html += tdInput(idx, '日期', rec['日期']);
    html += tdSelect(idx, '项目名称', rec['项目名称']);
    html += tdInput(idx, '申请人', rec['申请人']);
    html += tdInput(idx, '转款人', rec['转款人']);
    html += tdInput(idx, '收款人', rec['收款人']);
    html += tdInput(idx, '用途', rec['用途']);
    html += tdInput(idx, '收入', rec['收入'], 'income');
    html += tdInput(idx, '支出', rec['支出'], 'expense');
    html += '<td class="balance-cell">' + (rec['余额'] || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '</td>';
    html += tdSelect2(idx, '可退回', rec['可退回']);
    html += tdInput(idx, '预计退回', rec['预计退回']);
    html += tdInput(idx, '状态', rec['状态']);
    html += tdInput(idx, '备注', rec['备注']);
    html += '</tr>';
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
  updateDashboardStats();
}

function tdInput(idx, field, value, cls) {
  var v = value || '';
  var c = cls ? ' class="' + cls + '"' : '';
  return '<td><input' + c + ' value="' + esc(String(v)) + '" onchange="updateCell(' + idx + ',\x27' + field + '\x27,this)" onfocus="this.select()"></td>';
}

function tdSelect(idx, field, value) {
  var opts = '<option value="">--</option>';
  allProjects.forEach(function(p) { opts += '<option value="' + esc(p) + '"' + (p === value ? ' selected' : '') + '>' + esc(p) + '</option>'; });
  if (value && !allProjects.includes(value)) opts += '<option value="' + esc(value) + '" selected>' + esc(value) + '</option>';
  return '<td><select onchange="updateCell(' + idx + ',\x27' + field + '\x27,this)">' + opts + '</select></td>';
}

function tdSelect2(idx, field, value) {
  var opts = ['\u5426', '\u662F'];
  var html = '<td><select onchange="updateCell(' + idx + ',\x27' + field + '\x27,this)">';
  opts.forEach(function(o) { html += '<option value="' + o + '"' + (o === value ? ' selected' : '') + '>' + o + '</option>'; });
  return html + '</select></td>';
}

function updateCell(idx, field, elem) {
  var val = elem.tagName === 'SELECT' ? elem.value : elem.value;
  if (field === '\u6536\u5165' || field === '\u652F\u51FA') val = parseFloat(val) || 0;
  previewRecords[idx][field] = val;
  recalcBalances();
}

function recalcBalances() {
  var bal = accountBalance;
  previewRecords.forEach(function(rec) {
    var inc = parseFloat(rec['\u6536\u5165']) || 0;
    var exp = parseFloat(rec['\u652F\u51FA']) || 0;
    bal = bal + inc - exp;
    rec['\u4F59\u989D'] = bal;
  });
  var cells = document.querySelectorAll('.balance-cell');
  cells.forEach(function(cell, i) { if (i < previewRecords.length) cell.textContent = previewRecords[i]['\u4F59\u989D'].toLocaleString('zh-CN', { minimumFractionDigits: 2 }); });
}

async function doSave() {
  var toSave = previewRecords.map(function(r) { return {
    '\u65E5\u671F': r['\u65E5\u671F'] || '',
    '\u9879\u76EE\u540D\u79F0': r['\u9879\u76EE\u540D\u79F0'] || '',
    '\u7533\u8BF7\u4EBA': r['\u7533\u8BF7\u4EBA'] || '',
    '\u8F6C\u6B3E\u4EBA': r['\u8F6C\u6B3E\u4EBA'] || '',
    '\u6536\u6B3E\u4EBA': r['\u6536\u6B3E\u4EBA'] || '',
    '\u7528\u9014': r['\u7528\u9014'] || '',
    '\u6536\u5165': r['\u6536\u5165'] || 0,
    '\u652F\u51FA': r['\u652F\u51FA'] || 0,
    '\u53EF\u9000\u56DE': r['\u53EF\u9000\u56DE'] || '\u5426',
    '\u9884\u8BA1\u9000\u56DE': r['\u9884\u8BA1\u9000\u56DE'] || '',
    '\u72B6\u6001': r['\u72B6\u6001'] || '',
    '\u5907\u6CE8': r['\u5907\u6CE8'] || ''
  }; });
  try {
    await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: toSave }) });
    previewRecords.forEach(function(rec) { accountBalance = rec['\u4F59\u989D']; });
    updateTopBalance();
    previewRecords.forEach(function(r) { if (r['\u9879\u76EE\u540D\u79F0'] && !allProjects.includes(r['\u9879\u76EE\u540D\u79F0'])) allProjects.push(r['\u9879\u76EE\u540D\u79F0']); });
    doClear();
    loadRecent();
    updateDashboardStats();
    alert('\u4FDD\u5B58\u6210\u529F\uFF01');
  } catch (e) { alert('\u4FDD\u5B58\u5931\u8D25\uFF1A' + e.message); }
}

function doClear() {
  previewRecords = [];
  document.getElementById('tableWrap').innerHTML = '<div class="empty-hint">\u8F93\u5165\u8BB0\u8D26\u6587\u5B57\uFF0C\u70B9\u300C\u8F6C\u6362\u300D\u751F\u6210\u9884\u89C8</div>';
  setPreviewActionState(false);
}

async function loadRecent() {
  try {
    var resp = await fetch('/api/recent');
    var data = await resp.json();
    var list = document.getElementById('recentList');
    if (!data.records.length) { list.innerHTML = '<span style="color:var(--md-text-secondary);opacity:.6">\u6682\u65E0\u8BB0\u5F55</span>'; return; }
    list.innerHTML = data.records.reverse().map(function(r) {
      return '<div class="recent-item"><span class="recent-date">' + esc(r.date || '--') + '</span><span class="recent-name">' + esc(r.receiver || r.applicant || '--') + '</span><span class="recent-use">' + esc(r.purpose || '--') + '</span>' +
        (r.income ? '<span class="recent-in">+' + Number(r.income).toLocaleString() + '</span>' : '') +
        (r.expense ? '<span class="recent-out">-' + Number(r.expense).toLocaleString() + '</span>' : '') +
        (r.refundable === '\u662F' ? '<span class="recent-rfn">\u26A0 \u53EF\u9000\u56DE</span>' : '') + '</div>';
    }).join('');
  } catch (e) {}
}

var micBtn = document.getElementById('micBtn');
var recognition = null;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR(); recognition.lang = 'zh-CN'; recognition.interimResults = false; recognition.continuous = true;
  recognition.onresult = function(e) {
    var text = '';
    for (var i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
    var ib = document.getElementById('inputBox');
    ib.value = ib.value ? ib.value + '\uFF0C' + text : text;
  };
  recognition.onerror = function(e) { micBtn.classList.remove('recording'); if (e.error === 'not-allowed') alert('\u8BF7\u5141\u8BB8\u6D4F\u89C8\u5668\u4F7F\u7528\u9EA6\u514B\u98CE'); };
  recognition.onend = function() { micBtn.classList.remove('recording'); };
}
micBtn.addEventListener('click', function() {
  if (!recognition) { alert('\u60A8\u7684\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BED\u97F3\u8F93\u5165\uFF0C\u8BF7\u4F7F\u7528 Chrome \u6D4F\u89C8\u5668'); return; }
  if (micBtn.classList.contains('recording')) recognition.stop();
  else { recognition.start(); micBtn.classList.add('recording'); }
});

function updateDashboardStats() {
  var side = document.getElementById('sideBalance');
  var top = document.getElementById('topBalance');
  var hero = document.getElementById('heroBalance');
  if (side) side.textContent = '¥' + Number(accountBalance || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
  if (top) top.textContent = Number(accountBalance || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
  if (hero) hero.textContent = '¥' + Number(accountBalance || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });

  var previewIncome = previewRecords.reduce(function(sum, rec) { return sum + (parseFloat(rec['收入']) || 0); }, 0);
  var previewExpense = previewRecords.reduce(function(sum, rec) { return sum + (parseFloat(rec['支出']) || 0); }, 0);
  var refundableAmount = allRecords.reduce(function(sum, rec) {
    return sum + (rec.refundable === '是' ? (parseFloat(rec.expense) || 0) : 0);
  }, 0);
  var refundableCount = allRecords.filter(function(rec) { return rec.refundable === '是'; }).length;

  var incomeEl = document.getElementById('heroIncomePreview');
  var expenseEl = document.getElementById('heroExpensePreview');
  var refundEl = document.getElementById('heroRefund');
  var reportRefundEl = document.getElementById('statRefundable');
  if (incomeEl) incomeEl.textContent = '¥' + previewIncome.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
  if (expenseEl) expenseEl.textContent = '¥' + previewExpense.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
  if (refundEl) refundEl.textContent = '¥' + refundableAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
  if (reportRefundEl) reportRefundEl.textContent = refundableCount + ' 条';
}

async function loadReport() {
  try {
    var reportViewEl = document.getElementById('reportView');
    var reportView = reportViewEl && reportViewEl.value ? reportViewEl.value : getDefaultReportView();
    var reportOwnerFilter = document.getElementById('reportOwnerFilter');
    var selectedOwnerId = reportOwnerFilter && reportOwnerFilter.value ? reportOwnerFilter.value : '';
    var query = ['view=' + encodeURIComponent(reportView)];
    if (selectedOwnerId) query.push('owner_user_id=' + encodeURIComponent(selectedOwnerId));
    var resp = await fetch('/api/records?' + query.join('&'));
    var data = await resp.json();
    allRecords = data.records;
    reportMeta.view = data.view || reportView;
    reportMeta.parentView = reportMeta.view === 'owner'
      ? ((reportView === 'all' || reportMeta.parentView === 'all') ? 'all' : 'team')
      : reportMeta.view;
    reportMeta.ownerUserId = data.owner_user_id || null;
    reportMeta.ownerOptions = data.owner_options || [];
    reportMeta.balanceLabel = data.balance_label || '当前余额';
    document.getElementById('statIncome').textContent = Number(data.total_income || 0).toLocaleString();
    document.getElementById('statExpense').textContent = Number(data.total_expense || 0).toLocaleString();
    reportBalance = parseFloat(data.balance || 0);
    document.getElementById('statBalance').textContent = reportBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    var balanceLabel = document.getElementById('statBalanceLabel');
    if (balanceLabel) balanceLabel.textContent = reportMeta.balanceLabel;
    syncReportViewControls();
    var projects = data.projects || [];
    var sel = document.getElementById('filterProject');
    sel.innerHTML = '<option value="">\u5168\u90E8\u9879\u76EE</option>' + projects.map(function(p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('');
    populateReportMonthFilter(allRecords);
    renderReport();
    setReportSaveButtonVisible(Object.keys(reportDirty).length > 0);
    setReportDeleteButtonVisible();
    updateDashboardStats();
  } catch (e) { console.error(e); }
}

function populateReportMonthFilter(records) {
  var monthSelect = document.getElementById('filterMonth');
  if (!monthSelect) return;
  var currentValue = monthSelect.value || '';
  var months = {};
  records.forEach(function(record) {
    var date = record.date || '';
    if (/^\d{4}-\d{2}/.test(date)) months[date.slice(0, 7)] = true;
  });
  var options = Object.keys(months).sort().reverse();
  monthSelect.innerHTML = '<option value="">全部时间</option>' + options.map(function(month) {
    return '<option value="' + month + '">' + esc(month.replace('-', ' 年 ') + ' 月') + '</option>';
  }).join('');
  monthSelect.value = options.indexOf(currentValue) >= 0 ? currentValue : '';
}

function syncReportViewControls() {
  var reportViewEl = document.getElementById('reportView');
  var reportOwnerFilter = document.getElementById('reportOwnerFilter');
  var reportOwnerPanel = document.getElementById('reportOwnerPanel');
  if (!reportViewEl || !reportOwnerFilter) return;

  if (isBossUser()) {
    reportViewEl.style.display = '';
    reportViewEl.innerHTML =
      '<option value="mine">只看我的账</option>' +
      '<option value="team">只看项目主管账</option>' +
      '<option value="all">查看全部账目</option>';
    reportViewEl.value = reportMeta.view === 'owner' ? (reportMeta.parentView || 'team') : (reportMeta.view || 'mine');

    var ownerOptions = ['<option value="">全部项目主管</option>'];
    reportMeta.ownerOptions.forEach(function(option) {
      if (option.is_self) return;
      ownerOptions.push('<option value="' + option.id + '">' + esc(option.label) + '</option>');
    });
    reportOwnerFilter.innerHTML = ownerOptions.join('');
    reportOwnerFilter.style.display = reportViewEl.value === 'team' || reportViewEl.value === 'all' || reportMeta.view === 'owner' ? '' : 'none';
    reportOwnerFilter.value = reportMeta.ownerUserId ? String(reportMeta.ownerUserId) : '';
    renderBossReportOwnerPanel();
    return;
  }

  reportViewEl.style.display = 'none';
  reportOwnerFilter.style.display = 'none';
  reportViewEl.innerHTML = '';
  reportOwnerFilter.innerHTML = '<option value="">全部项目主管</option>';
  reportOwnerFilter.value = '';
  if (reportOwnerPanel) {
    reportOwnerPanel.style.display = 'none';
    reportOwnerPanel.innerHTML = '';
  }
}

function onReportViewChange() {
  var reportOwnerFilter = document.getElementById('reportOwnerFilter');
  if (reportOwnerFilter && document.getElementById('reportView').value === 'mine') reportOwnerFilter.value = '';
  loadReport();
}

function onReportOwnerFilterChange() {
  loadReport();
}

function renderBossReportOwnerPanel() {
  var panel = document.getElementById('reportOwnerPanel');
  if (!panel) return;
  if (!isBossUser()) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  var options = reportMeta.ownerOptions || [];
  var cards = [];
  cards.push(renderOwnerQuickCard('mine', '', 'Boss 本人', '查看 Boss 自己的账目', reportMeta.view === 'mine'));
  cards.push(renderOwnerQuickCard('team', '', '全部项目主管', '汇总查看全部项目主管账单', reportMeta.view === 'team' && !reportMeta.ownerUserId));
  cards.push(renderOwnerQuickCard('all', '', '全部账目', 'Boss 和项目主管账单一起查看', reportMeta.view === 'all' && !reportMeta.ownerUserId));

  var currentLabel = getCurrentReportFocusLabel();
  var helperText = reportMeta.ownerUserId
    ? '你已经切到单个项目主管账单，右侧项目主管下拉框会保持显示，方便继续切换其他人。'
    : '你可以先切到“全部项目主管”或“全部账目”，再用右侧项目主管下拉框快速查看某一个项目主管的账单。';
  panel.style.display = '';
  panel.innerHTML = '' +
    '<div style="padding:16px 18px;border:1px solid var(--line);border-radius:22px;background:linear-gradient(180deg,#fbfefc,#f4fbf7)">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">' +
        '<div>' +
          '<div style="font-size:17px;font-weight:700;color:#243127">按角色查看账单</div>' +
          '<div style="margin-top:6px;font-size:13px;line-height:1.7;color:var(--muted)">当前查看：' + esc(currentLabel) + '。' + esc(helperText) + '</div>' +
        '</div>' +
        '<div style="padding:8px 12px;border-radius:999px;background:#fff;border:1px solid var(--line);font-size:12px;color:#6f8579;font-weight:700">' + esc(reportMeta.balanceLabel || '当前余额') + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:14px">' +
        cards.join('') +
      '</div>' +
    '</div>';
}

function renderOwnerQuickCard(view, ownerId, title, description, active) {
  var border = active ? 'rgba(31,190,116,.45)' : 'var(--line)';
  var background = active ? 'linear-gradient(180deg,#ebfaf1,#ffffff)' : '#fff';
  var buttonText = active ? '当前查看中' : '查看账单';
  return '' +
    '<button type="button" onclick="openBossReportView(\'' + view + '\',' + (ownerId ? ownerId : 'null') + ')" style="text-align:left;padding:14px 16px;border:1px solid ' + border + ';border-radius:18px;background:' + background + ';display:flex;flex-direction:column;gap:8px">' +
      '<div style="font-size:15px;font-weight:700;color:#243127">' + esc(title) + '</div>' +
      '<div style="font-size:12px;line-height:1.6;color:var(--muted)">' + esc(description) + '</div>' +
      '<div style="margin-top:auto;font-size:12px;color:' + (active ? '#14a663' : '#6f8579') + ';font-weight:700">' + esc(buttonText) + '</div>' +
    '</button>';
}

function openBossReportView(view, ownerId) {
  var reportViewEl = document.getElementById('reportView');
  var reportOwnerFilter = document.getElementById('reportOwnerFilter');
  if (reportViewEl) reportViewEl.value = view;
  if (reportOwnerFilter) reportOwnerFilter.value = ownerId ? String(ownerId) : '';
  loadReport();
}

function getCurrentReportFocusLabel() {
  if (reportMeta.view === 'mine') return 'Boss 本人';
  if (reportMeta.ownerUserId) return getReportOwnerName(reportMeta.ownerUserId);
  if (reportMeta.view === 'team') return '全部项目主管';
  if (reportMeta.view === 'all') return '全部账目';
  return '当前账目';
}

function rptInput(rid, field, value, cls, extraStyle) {
  var v = (value !== undefined && value !== null) ? String(value) : '';
  var c = cls ? ' class="' + cls + '"' : '';
  var s = extraStyle ? ' style="' + extraStyle + '"' : '';
  return '<td><input' + c + s + ' value="' + esc(v) + '" onchange="markDirty(' + rid + ',\x27' + field + '\x27,this)" onfocus="this.select()"></td>';
}

function rptSelect(rid, field, value) {
  var vals = value || '\u5426';
  var opts = [['\u5426','\u5426'], ['\u662F','\u662F']];
  var html = '<td><select onchange="markDirty(' + rid + ',\x27' + field + '\x27,this)">';
  opts.forEach(function(o) {
    var sel = (o[0] === vals || o.includes(vals)) ? ' selected' : '';
    html += '<option value="' + o[0] + '"' + sel + '>' + o[0] + '</option>';
  });
  return html + '</select></td>';
}

function markDirty(rid, field, elem) {
  var val = elem.tagName === 'SELECT' ? elem.value : elem.value;
  if (field === 'income' || field === 'expense') val = parseFloat(val) || 0;
  if (!reportDirty[rid]) reportDirty[rid] = {};
  reportDirty[rid][field] = val;
  var rec = allRecords.find(function(r) { return r.id === rid; });
  if (rec) {
    rec[field] = val;
    var sorted = sortRecordsForBalance(allRecords);
    var initBal = reportBalance;
    sorted.forEach(function(r2) { initBal -= (r2.income || 0) - (r2.expense || 0); });
    var running = initBal;
    sorted.forEach(function(r2) { running += (r2.income || 0) - (r2.expense || 0); r2.balance = running; });
  }
  setReportSaveButtonVisible(true);
}

async function saveReportChanges() {
  var ids = Object.keys(reportDirty);
  if (!ids.length) return;
  var btn = document.getElementById('reportSaveBtn');
  btn.disabled = true; btn.textContent = '\u4FDD\u5B58\u4E2D...';
  var saved = 0;
  var failed = 0;
  for (var i = 0; i < ids.length; i++) {
    try {
      var resp = await fetch('/api/records/' + ids[i], { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reportDirty[ids[i]]) });
      if (!resp.ok) {
        failed++;
        continue;
      }
      saved++;
    } catch (e) {
      failed++;
      console.error(e);
    }
  }
  reportDirty = {};
  setReportSaveButtonVisible(false);
  await loadReport();
  await syncBalanceFromServer();
  if (failed) {
    alert('\u5DF2\u4FDD\u5B58 ' + saved + ' \u6761\u8BB0\u5F55，失败 ' + failed + ' \u6761');
    return;
  }
  alert('\u5DF2\u4FDD\u5B58 ' + saved + ' \u6761\u8BB0\u5F55');
}

function getReportFilters() {
  var ownerFilter = document.getElementById('reportOwnerFilter');
  return {
    text: (document.getElementById('filterText').value || '').toLowerCase(),
    project: document.getElementById('filterProject').value,
    month: document.getElementById('filterMonth').value,
    ownerUserId: ownerFilter && ownerFilter.style.display !== 'none' ? ownerFilter.value : ''
  };
}

function getFilteredReportRecords() {
  var filters = getReportFilters();
  return allRecords.filter(function(r) {
    if (filters.project && r.project_name !== filters.project) return false;
    if (filters.month && !(r.date || '').startsWith(filters.month)) return false;
    if (filters.ownerUserId && String(r.owner_user_id) !== String(filters.ownerUserId)) return false;
    if (filters.text) {
      var hay = [r.applicant, r.payer, r.receiver, r.purpose, r.remark].join(' ').toLowerCase();
      if (hay.indexOf(filters.text) === -1) return false;
    }
    return true;
  });
}

function getVisibleReportRecords() {
  return sortReportRecords(getFilteredReportRecords());
}

function sortReportRecords(records) {
  var sf = reportSort.field;
  var sa = reportSort.asc;
  records.sort(function(a, b) {
    var va = a[sf], vb = b[sf];
    if (sf === 'date') { va = va || ''; vb = vb || ''; }
    if (sf === 'income' || sf === 'expense' || sf === 'balance') { va = va || 0; vb = vb || 0; }
    if (va < vb) return sa ? -1 : 1;
    if (va > vb) return sa ? 1 : -1;
    return 0;
  });
  return records;
}

function sortRecordsForBalance(records) {
  return records.slice().sort(function(a, b) {
    var ad = a.date || '';
    var bd = b.date || '';
    if (!ad && bd) return 1;
    if (ad && !bd) return -1;
    if (ad < bd) return -1;
    if (ad > bd) return 1;
    return (a.id || 0) - (b.id || 0);
  });
}

function getReportSortArrow(field) {
  if (reportSort.field !== field) return '<span class="sort-arrow">\u2195</span>';
  return '<span class="sort-arrow active">' + (reportSort.asc ? '\u2191' : '\u2193') + '</span>';
}

function buildReportHeaderHtml() {
  var html = '<table><thead><tr><th><input type="checkbox" onchange="toggleAllReportRows(this.checked)"></th>';
  var headers = ['\u65E5\u671F','\u9879\u76EE\u540D\u79F0'];
  if (isBossUser()) headers.push('\u5F52\u5C5E\u4EBA');
  headers = headers.concat(['\u7533\u8BF7\u4EBA','\u8F6C\u6B3E\u4EBA','\u6536\u6B3E\u4EBA','\u7528\u9014','\u6536\u5165','\u652F\u51FA','\u4F59\u989D','\u53EF\u9000\u56DE','\u72B6\u6001','\u5907\u6CE8']);
  headers.forEach(function(h) {
    var f = ({'\u65E5\u671F':'date','\u9879\u76EE\u540D\u79F0':'project_name','\u7533\u8BF7\u4EBA':'applicant','\u8F6C\u6B3E\u4EBA':'payer','\u6536\u6B3E\u4EBA':'receiver','\u7528\u9014':'purpose','\u6536\u5165':'income','\u652F\u51FA':'expense','\u4F59\u989D':'balance'})[h] || '';
    html += '<th style="cursor:pointer" onclick="sortReport(\x27' + f + '\x27)">' + h + (f ? getReportSortArrow(f) : '') + '</th>';
  });
  return html + '</tr></thead><tbody>';
}

function renderReport() {
  var filtered = getVisibleReportRecords();
  var wrap = document.getElementById('reportTableWrap');
  if (!filtered.length) { wrap.innerHTML = '<div class="empty-hint">\u6CA1\u6709\u5339\u914D\u7684\u8BB0\u5F55</div>'; return; }
  var html = buildReportHeaderHtml();
  filtered.forEach(function(r) {
    var rid = r.id;
    var isBlank = !(r.date || r.project_name || r.applicant || r.payer || r.receiver || r.purpose || r.remark) && !(r.income || 0) && !(r.expense || 0);
    html += '<tr' + (isBlank ? ' style="background:rgba(234,67,53,.06)"' : '') + '>';
    html += '<td><input type="checkbox" ' + (reportSelected[rid] ? 'checked' : '') + ' onchange="toggleReportRow(' + rid + ', this.checked)"></td>'; 
    html += rptInput(rid, 'date', r.date || '');
    html += rptInput(rid, 'project_name', r.project_name || '');
    if (isBossUser()) {
      html += '<td style="font-weight:600;color:#6f8579">' + esc(getReportOwnerName(r.owner_user_id)) + '</td>';
    }
    html += rptInput(rid, 'applicant', r.applicant || '');
    html += rptInput(rid, 'payer', r.payer || '');
    html += rptInput(rid, 'receiver', r.receiver || '');
    html += rptInput(rid, 'purpose', r.purpose || '');
    html += rptInput(rid, 'income', r.income || 0, 'income-color');
    html += rptInput(rid, 'expense', r.expense || 0, 'expense-color');
    html += '<td style="font-weight:600;color:var(--md-primary)">' + (r.balance || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '</td>';
    html += rptSelect(rid, 'refundable', r.refundable || '\u5426');
    html += rptInput(rid, 'status', r.status || '');
    html += rptInput(rid, 'remark', r.remark || '', '', 'max-width:150px');
    html += '</tr>';
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function getReportOwnerName(ownerUserId) {
  if (!ownerUserId) return '未归属';
  if (currentUser && String(currentUser.id) === String(ownerUserId)) return 'Boss 本人';
  var found = (reportMeta.ownerOptions || []).find(function(option) {
    return String(option.id) === String(ownerUserId);
  });
  return found ? found.label : ('成员 #' + ownerUserId);
}

function sortReport(field) {
  if (reportSort.field === field) reportSort.asc = !reportSort.asc;
  else { reportSort.field = field; reportSort.asc = false; }
  renderReport();
}

async function doExport() {
  try { window.open('/api/export', '_blank'); }
  catch (e) { reportFrontendError({ kind: 'export_error', page: location.href, message: e.message, stack: e.stack || '' }); alert('\u5BFC\u51FA\u5931\u8D25\uFF1A' + e.message); }
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

document.getElementById('inputBox').addEventListener('keydown', function(e) { if (e.ctrlKey && e.key === 'Enter') doClassify(); });

// init() is called by checkAuth after login


function toggleReportRow(id, checked) {
  if (checked) reportSelected[id] = true;
  else delete reportSelected[id];
  setReportDeleteButtonVisible();
}

function toggleAllReportRows(checked) {
  reportSelected = {};
  if (checked) {
    getVisibleReportRecords().forEach(function(r) { reportSelected[r.id] = true; });
  }
  renderReport();
  setReportDeleteButtonVisible();
}

async function deleteSelectedRecords() {
  var ids = Object.keys(reportSelected);
  if (!ids.length) return;
  if (!confirm('确定删除选中的 ' + ids.length + ' 条记录吗？')) return;
  var btn = document.getElementById('reportDeleteBtn');
  btn.disabled = true; btn.textContent = '删除中...';
  try {
    var resp = await fetch('/api/records', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids })
    });
    var data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || '删除失败');
    reportSelected = {};
    setReportDeleteButtonVisible();
    await loadReport();
    await loadRecent();
    await syncBalanceFromServer();
    alert('已删除 ' + data.deleted + ' 条记录');
  } catch (e) {
    alert('删除失败：' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '🗑 删除选中';
  }
}

async function createOrgMember() {
  if (!getActiveOrganizationId()) {
    alert('请先选择一个组织');
    return;
  }
  var displayName = document.getElementById('orgNewDisplayName').value.trim();
  var username = document.getElementById('orgNewUsername').value.trim();
  var password = document.getElementById('orgNewPassword').value.trim();
  if (!displayName || !username || !password) {
    alert('请填写项目主管姓名、登录账号和初始密码');
    return;
  }
  try {
    var resp = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName, username: username, password: password, role: 'staff', organization_id: getActiveOrganizationId() })
    });
    var data = await resp.json();
    if (!resp.ok) {
      alert(data.detail || '添加项目主管失败');
      return;
    }
    ['orgNewDisplayName', 'orgNewUsername', 'orgNewPassword'].forEach(function(id) {
      var input = document.getElementById(id);
      if (input) input.value = '';
    });
    if (isSystemAdmin()) {
      await loadOrganizations();
    }
    await loadOrgStructure();
  } catch (e) {
    reportFrontendError({ kind: 'org_member_create_error', page: location.href, message: e.message, stack: e.stack || '' });
    alert('添加项目主管失败：' + e.message);
  }
}

async function deleteOrgMember(userId) {
  if (!confirm('确认删除该项目主管账号？')) return;
  try {
    var resp = await fetch('/api/admin/users/' + userId, { method: 'DELETE' });
    var data = await resp.json();
    if (!resp.ok) {
      alert(data.detail || '删除项目主管失败');
      return;
    }
    if (isSystemAdmin()) {
      await loadOrganizations();
    }
    await loadOrgStructure();
  } catch (e) {
    reportFrontendError({ kind: 'org_member_delete_error', page: location.href, message: e.message, stack: e.stack || '' });
    alert('删除项目主管失败：' + e.message);
  }
}

async function saveOrgName() {
  var input = document.getElementById('orgNameInput');
  if (!input) return;
  var name = input.value.trim() || '神秘组织';
  try {
    var resp = await fetch('/api/org-structure', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, organization_id: getActiveOrganizationId() })
    });
    var data = await resp.json();
    if (!resp.ok) {
      alert(data.detail || '保存组织名称失败');
      return;
    }
    if (orgStructureData && data.organization) orgStructureData.organization = data.organization;
    if (isSystemAdmin()) {
      await loadOrganizations();
    }
    orgEditingName = false;
    renderOrgStructure();
  } catch (e) {
    reportFrontendError({ kind: 'org_name_save_error', page: location.href, message: e.message, stack: e.stack || '' });
    alert('保存组织名称失败：' + e.message);
  }
}

function startOrgNameEdit() {
  orgEditingName = true;
  renderOrgStructure();
}

function cancelOrgNameEdit() {
  orgEditingName = false;
  renderOrgStructure();
}

async function changeActiveOrganization(orgId) {
  selectedOrgId = orgId ? parseInt(orgId, 10) : null;
  await loadOrgStructure();
}

async function createBossOrganization() {
  var orgName = document.getElementById('sysOrgName').value.trim();
  var displayName = document.getElementById('sysBossDisplayName').value.trim();
  var username = document.getElementById('sysBossUsername').value.trim();
  var password = document.getElementById('sysBossPassword').value.trim();
  if (!orgName || !displayName || !username || !password) {
    alert('请填写组织名称、Boss 姓名、登录账号和初始密码');
    return;
  }
  try {
    var resp = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_name: orgName,
        display_name: displayName,
        username: username,
        password: password,
        role: 'boss'
      })
    });
    var data = await resp.json();
    if (!resp.ok) {
      alert(data.detail || '创建 Boss 组织失败');
      return;
    }
    ['sysOrgName', 'sysBossDisplayName', 'sysBossUsername', 'sysBossPassword'].forEach(function(id) {
      var input = document.getElementById(id);
      if (input) input.value = '';
    });
    await loadOrganizations();
    if (data.user && data.user.organization_id) {
      selectedOrgId = data.user.organization_id;
    }
    await loadOrgStructure();
  } catch (e) {
    reportFrontendError({ kind: 'boss_org_create_error', page: location.href, message: e.message, stack: e.stack || '' });
    alert('创建 Boss 组织失败：' + e.message);
  }
}


