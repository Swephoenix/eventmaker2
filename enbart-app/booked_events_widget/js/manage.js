(function () {
	const root = document.querySelector('.bew-manage');
	const stateNode = document.getElementById('bew-state');
	if (!root || !stateNode) {
		return;
	}

	const parsed = JSON.parse(stateNode.textContent || '{"events": []}');
	const events = Array.isArray(parsed.events) ? parsed.events : [];
	const availableUsers = Array.isArray(parsed.users) ? parsed.users : [];
	const currentUser = parsed.currentUser && typeof parsed.currentUser.id === 'string' ? parsed.currentUser : null;

	const state = {
		activeTab: 'overview',
		activeEventId: events[0]?.id ?? null,
		availableUsers,
		bookedOnly: false,
		chatSending: false,
		currentUser,
		events: Object.fromEntries(events.map((event) => [String(event.id), event])),
		dirty: false,
		dirtyTabs: new Set(),       // Set of tab names that have unsaved changes
		dirtyEventId: null,
		dirtySnapshots: new Map(), // Map<tabName, clonedEvent>
		submitting: false,
		pendingNavigation: null,
	};

	const dynamicContent = document.getElementById('dynamicContent');
	const tabs = Array.from(root.querySelectorAll('.tab-btn'));
	const eventButtons = Array.from(root.querySelectorAll('.event-card'));
	const mainTitle = document.getElementById('mainTitle');
	const mainDateBadge = document.getElementById('mainDateBadge');
	const mainLocationBadge = document.getElementById('mainLocationBadge');
	const mainDemoNote = document.getElementById('mainDemoNote');
	const chatInput = document.getElementById('chatInput');
	const chatBox = document.getElementById('chatBox');
	const sendBtn = document.getElementById('sendBtn');
	const printSummaryBtn = document.getElementById('printSummaryBtn');
	const bookedOnlyToggle = document.getElementById('bookedOnlyToggle');
	const unsavedModal = document.getElementById('unsavedModal');
	const unsavedModalMessage = document.getElementById('unsavedModalMessage');
	const unsavedSaveBtn = document.getElementById('unsavedSaveBtn');
	const unsavedDiscardBtn = document.getElementById('unsavedDiscardBtn');
	const unsavedStayBtn = document.getElementById('unsavedStayBtn');
	const requesttoken = root.dataset.requesttoken || '';
	const stateUrl = root.dataset.stateUrl || '';
	const viewMode = root.dataset.viewMode || 'admin';
	let printFrame = null;

	function escapeHtml(str) {
		return String(str)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}

	function getActiveEvent() {
		return state.activeEventId === null ? null : state.events[String(state.activeEventId)] || null;
	}

	function getAvailableUser(userId) {
		return state.availableUsers.find((user) => user.id === userId) || null;
	}

	function cloneEvent(event) {
		return JSON.parse(JSON.stringify(event));
	}

	function resetDirtyState() {
		state.dirty = false;
		state.dirtyEventId = null;
		state.dirtyTabs.clear();
		state.dirtySnapshots.clear();
	}

	function markDirty() {
		if (viewMode === 'eventpersonal') {
			return;
		}

		const event = getActiveEvent();
		if (!event) {
			return;
		}

		const tabName = state.activeTab;
		if (!state.dirtyTabs.has(tabName)) {
			state.dirty = true;
			state.dirtyEventId = event.id;
			state.dirtyTabs.add(tabName);
			state.dirtySnapshots.set(tabName, cloneEvent(event));
		}
	}

	function discardCurrentChanges() {
		if (!state.dirty || state.dirtyEventId === null) {
			return;
		}

		// Restore all dirty tab snapshots.
		for (const tabName of state.dirtyTabs) {
			const snapshot = state.dirtySnapshots.get(tabName);
			if (snapshot && state.events[String(state.dirtyEventId)]) {
				state.events[String(state.dirtyEventId)] = cloneEvent(snapshot);
			}
		}
		resetDirtyState();
		render();
	}

	function blockIfDirty() {
		if (!state.dirty) {
			return Promise.resolve('continue');
		}

		return new Promise((resolve) => {
			state.pendingNavigation = resolve;
			const dirtyLabels = Array.from(state.dirtyTabs).map((tab) => {
				return { overview: 'Översikt', staff: 'Personal', material: 'Material', marketing: 'Marknadsföring', budget: 'Budget', documents: 'Dokument' }[tab] || tab;
			}).join(', ');
			if (unsavedModalMessage) {
				unsavedModalMessage.textContent = dirtyLabels
					? `Du har osparade ändringar i ${dirtyLabels}. Vill du spara dem innan du fortsätter?`
					: 'Du har osparade ändringar i den här vyn. Vill du spara dem innan du fortsätter?';
			}
			if (unsavedSaveBtn) {
				unsavedSaveBtn.disabled = false;
				unsavedSaveBtn.textContent = 'Spara ändringar';
			}
			if (unsavedModal) {
				unsavedModal.hidden = false;
				// Focus the first actionable button in the dialog.
				if (unsavedSaveBtn) {
					unsavedSaveBtn.focus();
				}
			}
		});
	}

	function closeUnsavedModal(result) {
		// Restore focus to the element that triggered the navigation if possible.
		const previouslyFocused = document.activeElement;
		if (unsavedModal) {
			unsavedModal.hidden = true;
		}
		if (previouslyFocused && unsavedModal && previouslyFocused.closest('.bew-manage')) {
			previouslyFocused.focus();
		}
		const resolver = state.pendingNavigation;
		state.pendingNavigation = null;
		if (resolver) {
			resolver(result);
		}
	}

	// Focus trap for the unsaved modal dialog.
	if (unsavedModal) {
		unsavedModal.addEventListener('keydown', (e) => {
			if (unsavedModal.hidden) {
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				closeUnsavedModal('stay');
				return;
			}
			if (e.key !== 'Tab') {
				return;
			}
			const focusableElements = Array.from(unsavedModal.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
			if (focusableElements.length === 0) {
				return;
			}
			const firstEl = focusableElements[0];
			const lastEl = focusableElements[focusableElements.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === firstEl) {
					e.preventDefault();
					lastEl.focus();
				}
			} else {
				if (document.activeElement === lastEl) {
					e.preventDefault();
					firstEl.focus();
				}
			}
		});
	}

	async function persistOverview(event) {
		const body = new URLSearchParams({
			requesttoken,
			title: String(event.title || ''),
			date: String(event.date || ''),
			location: String(event.location || ''),
			description: String(event.description || ''),
			internal_notes: String(event.internal_notes || ''),
			link: String(event.link || ''),
			sort_order: String(event.sortOrder || 0),
		});

		const response = await fetch(event.updateUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
			},
			body: body.toString(),
			credentials: 'same-origin',
		});

		if (!response.ok) {
			throw new Error('overview-save-failed');
		}
	}

	async function persistStaff(event) {
		const body = new URLSearchParams({
			requesttoken,
			staff_json: serializeStaff(event.staff),
		});

		const response = await fetch(event.saveStaffUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
			},
			body: body.toString(),
			credentials: 'same-origin',
		});

		if (!response.ok) {
			throw new Error('staff-save-failed');
		}
	}

	async function persistBudget(event) {
		const body = new URLSearchParams({
			requesttoken,
			budget_json: JSON.stringify(event.budget),
		});

		const response = await fetch(event.saveBudgetUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
			},
			body: body.toString(),
			credentials: 'same-origin',
		});

		if (!response.ok) {
			throw new Error('budget-save-failed');
		}
	}

	async function saveCurrentChanges() {
		const event = getActiveEvent();
		if (!event) {
			return false;
		}

		// Collect all dirty tabs to save, then clear them.
		const tabsToSave = Array.from(state.dirtyTabs);

		for (const tabName of tabsToSave) {
			try {
				if (tabName === 'overview') {
					await persistOverview(event);
				} else if (tabName === 'staff') {
					await persistStaff(event);
				} else if (tabName === 'budget') {
					await persistBudget(event);
				} else if (unsavedModalMessage) {
					unsavedModalMessage.textContent = 'Den här vyn har ännu ingen separat sparknapp.';
				}
			} catch (error) {
				// Keep this tab dirty; let the unsaved modal handle the error.
				return false;
			}
		}

		// All saves succeeded — clear dirty state.
		resetDirtyState();
		return true;
	}

	function ensureEventOwnerRow(event) {
		if (!Array.isArray(event.staff)) {
			event.staff = [];
		}

		const ownerIndex = event.staff.findIndex((person) => String(person.role || '').trim().toLowerCase() === 'eventansvarig');
		const ownerRow = ownerIndex >= 0 ? event.staff.splice(ownerIndex, 1)[0] : { userId: '', firstName: '', lastName: '', email: '', phone: '', role: 'Eventansvarig', area: '' };
		ownerRow.role = 'Eventansvarig';
		event.staff.unshift(ownerRow);
	}

	function getEventOwner(event) {
		ensureEventOwnerRow(event);
		return event.staff[0] || null;
	}

	function getPersonDisplayName(person) {
		const selectedUser = person?.userId ? getAvailableUser(person.userId) : null;
		return [person?.firstName, person?.lastName].filter(Boolean).join(' ').trim() || selectedUser?.label || 'Inte tilldelad';
	}

	function getMessageTone(message) {
		if (message.type === 'system') {
			return 'system';
		}

		if (state.currentUser?.id && message.senderUserId === state.currentUser.id) {
			return 'me';
		}

		return 'other';
	}

	function formatMessageMeta(message) {
		const parts = [];
		if (message.senderLabel) {
			parts.push(message.senderLabel);
		}
		if (message.createdAt) {
			const parsedDate = new Date(message.createdAt);
			if (!Number.isNaN(parsedDate.getTime())) {
				parts.push(parsedDate.toLocaleString('sv-SE', {
					month: 'short',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
				}));
			}
		}

		return parts.join(' • ');
	}

	function formatTimestamp(value) {
		if (!value) {
			return '';
		}

		const parsedDate = new Date(value);
		if (Number.isNaN(parsedDate.getTime())) {
			return String(value);
		}

		return parsedDate.toLocaleString('sv-SE', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function formatFileSize(bytes) {
		const size = Number(bytes || 0);
		if (!Number.isFinite(size) || size <= 0) {
			return 'Okänd storlek';
		}
		if (size < 1024) {
			return `${size} B`;
		}
		if (size < 1024 * 1024) {
			return `${(size / 1024).toFixed(1)} KB`;
		}
		return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDocumentDate(value) {
		return formatTimestamp(value) || 'Okänt datum';
	}

	function normalizeIdentity(value) {
		return String(value || '')
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[._-]+/g, ' ')
			.replace(/\s+/g, ' ');
	}

	function isBookedForCurrentUser(event) {
		if (!state.currentUser?.id) {
			return false;
		}

		const currentIdentityParts = [
			state.currentUser.id,
			state.currentUser.label,
			state.currentUser.email,
			String(state.currentUser.email || '').split('@')[0],
		]
			.map(normalizeIdentity)
			.filter(Boolean);
		const currentIdentities = new Set(currentIdentityParts);

		return Array.isArray(event.staff) && event.staff.some((person) => {
			const personIdentities = [
				person.userId,
				person.email,
				String(person.email || '').split('@')[0],
				[person.firstName, person.lastName].filter(Boolean).join(' '),
			]
				.map(normalizeIdentity)
				.filter(Boolean);

			return personIdentities.some((identity) => currentIdentities.has(identity));
		});
	}

	function getVisibleEvents() {
		return Object.values(state.events).filter((event) => !state.bookedOnly || isBookedForCurrentUser(event));
	}

	function getEventAccent(eventId) {
		const palette = [
			{ card: '#d9e5ff', border: '#416fcf', date: '#bed3ff', month: '#244d9a' },
			{ card: '#d7f1e3', border: '#2f9360', date: '#b7e4cb', month: '#1f6a45' },
			{ card: '#ffe4c7', border: '#d67a1c', date: '#ffd0a1', month: '#9a4f05' },
			{ card: '#eadcff', border: '#7b4fc9', date: '#dac2ff', month: '#553093' },
			{ card: '#d8f0f4', border: '#2f8a9a', date: '#bae3ea', month: '#1d6170' },
			{ card: '#ffd9e4', border: '#c4517a', date: '#ffc0d2', month: '#8f2f55' },
		];
		const numericId = Number(eventId);
		const index = Number.isNaN(numericId) ? 0 : Math.abs(numericId) % palette.length;
		return palette[index];
	}

	function applyActiveEventAccent() {
		const activeEvent = getActiveEvent();
		const accent = getEventAccent(activeEvent?.id ?? 0);
		root.style.setProperty('--active-event-border', accent.border);
		root.style.setProperty('--active-event-soft', accent.card);
		root.style.setProperty('--active-event-date', accent.date);
		root.style.setProperty('--active-event-month', accent.month);
	}

	function serializeStaff(staff) {
		return JSON.stringify(staff.map((person) => ({
			userId: String(person.userId || ''),
			firstName: String(person.firstName || ''),
			lastName: String(person.lastName || ''),
			email: String(person.email || ''),
			phone: String(person.phone || ''),
			role: String(person.role || ''),
			area: String(person.area || ''),
		})));
	}

	function mergeRemoteEvent(localEvent, remoteEvent) {
		return {
			...remoteEvent,
			// Preserve locally modified fields that users edit in the UI.
			staff: Array.isArray(localEvent?.staff) ? localEvent.staff : (Array.isArray(remoteEvent.staff) ? remoteEvent.staff : []),
			chat: Array.isArray(localEvent?.chat) ? localEvent.chat : (Array.isArray(remoteEvent.chat) ? remoteEvent.chat : []),
			documents: Array.isArray(localEvent?.documents) ? localEvent.documents : (Array.isArray(remoteEvent.documents) ? remoteEvent.documents : []),
			description: localEvent?.description !== undefined ? localEvent.description : (remoteEvent.description || ''),
			internal_notes: localEvent?.internal_notes !== undefined ? localEvent.internal_notes : (remoteEvent.internal_notes || ''),
			material: Array.isArray(localEvent?.material) ? localEvent.material : (Array.isArray(remoteEvent.material) ? remoteEvent.material : []),
			marketing: Array.isArray(localEvent?.marketing) ? localEvent.marketing : (Array.isArray(remoteEvent.marketing) ? remoteEvent.marketing : []),
			budget: Array.isArray(localEvent?.budget) ? localEvent.budget : (Array.isArray(remoteEvent.budget) ? remoteEvent.budget : []),
		};
	}

	function buildCalendarMarkup(dateText) {
		const parsed = parseEventDateRange(dateText);
		if (!parsed) {
			return `
				<div class="event-calendar empty">
					<div class="event-calendar__fallback">Kalender saknas för datumtexten "${escapeHtml(dateText)}".</div>
				</div>
			`;
		}

		const monthLabel = parsed.start.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
		const weekdayLabels = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];
		const firstOfMonth = new Date(parsed.start.getFullYear(), parsed.start.getMonth(), 1);
		const startOffset = (firstOfMonth.getDay() + 6) % 7;
		const daysInMonth = new Date(parsed.start.getFullYear(), parsed.start.getMonth() + 1, 0).getDate();
		const daySet = new Set(parsed.days.map((date) => date.toISOString().slice(0, 10)));
		const cells = [];

		for (let index = 0; index < startOffset; index += 1) {
			cells.push('<div class="event-calendar__cell mute"></div>');
		}

		for (let day = 1; day <= daysInMonth; day += 1) {
			const date = new Date(parsed.start.getFullYear(), parsed.start.getMonth(), day);
			const isoDate = date.toISOString().slice(0, 10);
			const isActive = daySet.has(isoDate);
			const isStart = isoDate === parsed.startIso;
			const isEnd = isoDate === parsed.endIso;
			cells.push(`
				<div class="event-calendar__cell${isActive ? ' active' : ''}${isStart ? ' start' : ''}${isEnd ? ' end' : ''}">
					<span>${day}</span>
				</div>
			`);
		}

		return `
			<div class="event-calendar">
				<div class="event-calendar__head">
					<div class="event-calendar__month">${escapeHtml(monthLabel)}</div>
					<div class="event-calendar__range">${escapeHtml(dateText)}</div>
				</div>
				<div class="event-calendar__weekdays">
					${weekdayLabels.map((label) => `<div>${label}</div>`).join('')}
				</div>
				<div class="event-calendar__grid">
					${cells.join('')}
				</div>
			</div>
		`;
	}

	function buildPrintRows(items) {
		return items.map((item) => `
			<tr>
				<td>${escapeHtml(item.label)}</td>
				<td>${item.value}</td>
			</tr>
		`).join('');
	}

	function buildPrintTable(title, rows) {
		if (!rows.length) {
			return `
				<section class="print-section">
					<h2>${escapeHtml(title)}</h2>
					<p class="print-empty">Ingen information tillagd.</p>
				</section>
			`;
		}

		return `
			<section class="print-section">
				<h2>${escapeHtml(title)}</h2>
				<table class="print-table">
					<tbody>${rows}</tbody>
				</table>
			</section>
		`;
	}

	function buildPrintableSummary(event) {
		const accent = getEventAccent(event.id);
		const eventOwner = getEventOwner(event);
		const staffRows = Array.isArray(event.staff) ? event.staff.map((person) => {
			const selectedUser = person.userId ? getAvailableUser(person.userId) : null;
			const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || selectedUser?.label || 'Inte tilldelad';
			const email = person.userId ? (selectedUser?.email || person.email || 'Saknas') : (person.email || 'Saknas');
			const phone = person.userId ? (selectedUser?.phone || person.phone || 'Saknas') : (person.phone || 'Saknas');
			return `
				<tr>
					<td>${escapeHtml(person.role || 'Saknas')}</td>
					<td>${escapeHtml(fullName)}</td>
					<td>${escapeHtml(person.area || 'Saknas')}</td>
					<td>${escapeHtml(email)}</td>
					<td>${escapeHtml(phone)}</td>
				</tr>
			`;
		}).join('') : '';

		const materialRows = Array.isArray(event.material) ? event.material.map((item) => `
			<tr>
				<td>${item.done ? 'Klar' : 'Ej klar'}</td>
				<td>${escapeHtml(item.text || 'Tom punkt')}</td>
				<td>${escapeHtml((item.ownerUserId ? (getAvailableUser(item.ownerUserId)?.label || item.ownerName) : item.ownerName) || 'Saknas')}</td>
				<td>${escapeHtml(item.notes || 'Saknas')}</td>
			</tr>
		`).join('') : '';

		const marketingRows = Array.isArray(event.marketing) ? event.marketing.map((row) => `
			<tr>
				<td>${escapeHtml(row.city || 'Ort saknas')}</td>
				<td>${escapeHtml(row.mailSent || 'Saknas')}</td>
				<td>${escapeHtml(row.facebookPages || 'Saknas')}</td>
				<td>${escapeHtml(row.comment || 'Saknas')}</td>
			</tr>
		`).join('') : '';

		const documentRows = Array.isArray(event.documents) ? event.documents.map((document) => `
			<tr>
				<td>${escapeHtml(document.name || 'Fil')}</td>
				<td>${escapeHtml(formatFileSize(document.size))}</td>
				<td>${escapeHtml(formatTimestamp(document.uploadedAt) || 'Okänt datum')}</td>
			</tr>
		`).join('') : '';

		const budgetRows = Array.isArray(event.budget) ? event.budget.map((entry) => {
			const isCost = entry.type === 'cost';
			const sign = isCost ? '−' : '+';
			const statusLabel = { planned: 'Planerad', booked: 'Bokad', received: 'Mottagen' }[entry.status] || entry.status;
			return `
				<tr>
					<td>${sign} ${escapeHtml(entry.label || 'Post')}</td>
					<td>${escapeHtml(statusLabel)}</td>
					<td>${escapeHtml((entry.ownerUserId ? (getAvailableUser(entry.ownerUserId)?.label || entry.ownerName) : entry.ownerName) || 'Saknas')}</td>
					<td>${(isCost ? '−' : '')}${escapeHtml(Number(entry.amount || 0).toLocaleString('sv-SE'))} kr</td>
				</tr>
			`;
		}).join('') : '';

		const budgetTotal = Array.isArray(event.budget) ? (() => {
			let totalIncome = 0;
			let totalCost = 0;
			event.budget.forEach((entry) => {
				const amount = Number(entry.amount || 0);
				if (entry.type === 'income') { totalIncome += amount; } else { totalCost += amount; }
			});
			return { income: totalIncome, cost: totalCost, net: totalIncome - totalCost };
		})() : { income: 0, cost: 0, net: 0 };

		return `<!doctype html>
<html lang="sv">
<head>
	<meta charset="utf-8">
	<title>${escapeHtml(event.title)} - sammanfattning</title>
	<style>
		:root {
			--accent: ${accent.border};
			--accent-soft: ${accent.card};
			--text: #17324a;
			--muted: #5b7590;
			--line: rgba(23, 50, 74, 0.14);
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			padding: 28px;
			font-family: Inter, Arial, sans-serif;
			color: var(--text);
			background: #ffffff;
		}
		.print-shell {
			max-width: 1100px;
			margin: 0 auto;
		}
		.print-hero {
			padding: 24px;
			border: 2px solid var(--accent);
			border-radius: 22px;
			background: linear-gradient(180deg, var(--accent-soft) 0%, #ffffff 100%);
			margin-bottom: 22px;
		}
		.print-kicker {
			font-size: 11px;
			font-weight: 800;
			letter-spacing: 0.14em;
			text-transform: uppercase;
			color: var(--muted);
			margin-bottom: 10px;
		}
		.print-title {
			font-size: 34px;
			line-height: 1.05;
			font-weight: 800;
			margin: 0 0 12px;
		}
		.print-badges {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-bottom: 12px;
		}
		.print-badge {
			display: inline-flex;
			align-items: center;
			min-height: 32px;
			padding: 0 12px;
			border-radius: 999px;
			background: #ffffff;
			border: 1px solid var(--line);
			font-size: 13px;
			font-weight: 700;
		}
		.print-copy {
			margin: 0;
			font-size: 14px;
			line-height: 1.6;
			color: var(--text);
		}
		.print-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 18px;
		}
		.print-section {
			border: 1px solid var(--line);
			border-radius: 18px;
			padding: 18px;
			margin-bottom: 18px;
			break-inside: avoid;
		}
		.print-section h2 {
			margin: 0 0 12px;
			font-size: 18px;
			line-height: 1.1;
		}
		.print-table {
			width: 100%;
			border-collapse: collapse;
		}
		.print-table-staff {
			table-layout: fixed;
		}
		.print-table td,
		.print-table th {
			padding: 10px 0;
			border-bottom: 1px solid var(--line);
			vertical-align: top;
			font-size: 13px;
			line-height: 1.45;
			text-align: left;
		}
		.print-table tr:last-child td,
		.print-table tr:last-child th {
			border-bottom: 0;
		}
		.print-table td:first-child,
		.print-table th:first-child {
			width: 28%;
			color: var(--muted);
			font-weight: 700;
			padding-right: 16px;
		}
		.print-table-staff td:nth-child(4),
		.print-table-staff th:nth-child(4) {
			width: 26%;
			padding-right: 20px;
			overflow-wrap: anywhere;
			word-break: break-word;
		}
		.print-table-staff td:nth-child(5),
		.print-table-staff th:nth-child(5) {
			width: 18%;
			padding-left: 16px;
			white-space: nowrap;
		}
		.print-empty {
			margin: 0;
			color: var(--muted);
			font-size: 13px;
		}
		.print-link {
			color: var(--accent);
			text-decoration: none;
			font-weight: 700;
		}
		@media print {
			body { padding: 0; }
		}
	</style>
</head>
<body>
	<div class="print-shell">
		<section class="print-hero">
			<div class="print-kicker">Eventsammanfattning</div>
			<h1 class="print-title">${escapeHtml(event.title)}</h1>
			<div class="print-badges">
				<span class="print-badge">${escapeHtml(event.date)}</span>
				<span class="print-badge">${escapeHtml(event.location)}</span>
				<span class="print-badge">Eventansvarig: ${escapeHtml(getPersonDisplayName(eventOwner))}</span>
			</div>
			<p class="print-copy">${escapeHtml(event.internal_notes || 'Inga interna anteckningar tillagda ännu.')}</p>
		</section>

		${buildPrintTable('Översikt', buildPrintRows([
			{ label: 'Titel', value: escapeHtml(event.title) },
			{ label: 'Datum', value: escapeHtml(event.date) },
			{ label: 'Plats', value: escapeHtml(event.location) },
			{ label: 'Eventansvarig', value: escapeHtml(getPersonDisplayName(eventOwner)) },
			{ label: 'Länk', value: event.link ? `<a class="print-link" href="${escapeHtml(event.link)}" target="_blank" rel="noreferrer">${escapeHtml(event.link)}</a>` : 'Saknas' },
		]))}
		${staffRows ? `
			<section class="print-section">
				<h2>Personal</h2>
				<table class="print-table print-table-staff">
					<thead>
						<tr><th>Roll</th><th>Person</th><th>Ansvar</th><th>E-post</th><th>Telefon</th></tr>
					</thead>
					<tbody>${staffRows}</tbody>
				</table>
			</section>
		` : `<section class="print-section"><h2>Personal</h2><p class="print-empty">Ingen personal tillagd.</p></section>`}
		<div class="print-grid">
			${materialRows ? `
				<section class="print-section">
					<h2>Material</h2>
					<table class="print-table">
						<thead>
							<tr><th>Status</th><th>Moment</th><th>Ansvarig</th><th>Anteckning</th></tr>
						</thead>
						<tbody>${materialRows}</tbody>
					</table>
				</section>
			` : `<section class="print-section"><h2>Material</h2><p class="print-empty">Inga materialpunkter tillagda.</p></section>`}
			${marketingRows ? `
				<section class="print-section">
					<h2>Marknadsföring</h2>
					<table class="print-table">
						<thead>
							<tr><th>Ort</th><th>Mejl</th><th>Facebook</th><th>Kommentar</th></tr>
						</thead>
						<tbody>${marketingRows}</tbody>
					</table>
				</section>
			` : `<section class="print-section"><h2>Marknadsföring</h2><p class="print-empty">Ingen marknadsföringsdata tillagd.</p></section>`}
			${documentRows ? `
				<section class="print-section">
					<h2>Dokumentation</h2>
					<table class="print-table">
						<thead>
							<tr><th>Fil</th><th>Storlek</th><th>Uppladdad</th></tr>
						</thead>
						<tbody>${documentRows}</tbody>
					</table>
				</section>
			` : `<section class="print-section"><h2>Dokumentation</h2><p class="print-empty">Inga dokument uppladdade.</p></section>`}
			${budgetRows ? `
				<section class="print-section">
					<h2>Budget</h2>
					<table class="print-table">
						<thead>
							<tr><th>Post</th><th>Status</th><th>Ansvarig</th><th>Belopp</th></tr>
						</thead>
						<tbody>${budgetRows}</tbody>
						<tfoot>
							<tr><th colspan="3">Summa intäkter</th><td>${budgetTotal.income.toLocaleString('sv-SE')} kr</td></tr>
							<tr><th colspan="3">Summa kostnader</th><td>−${budgetTotal.cost.toLocaleString('sv-SE')} kr</td></tr>
							<tr><th colspan="3">Netto</th><td><strong>${(budgetTotal.net >= 0 ? '' : '−')}${Math.abs(budgetTotal.net).toLocaleString('sv-SE')} kr</strong></td></tr>
						</tfoot>
					</table>
				</section>
			` : `<section class="print-section"><h2>Budget</h2><p class="print-empty">Ingen budget tillagd.</p></section>`}
		</div>
	</div>
</body>
</html>`;
	}

	function parseEventDateRange(dateText) {
		const normalized = String(dateText || '')
			.toLowerCase()
			.trim()
			.replaceAll('–', '-')
			.replaceAll('—', '-');

		const monthMap = {
			januari: 0,
			februari: 1,
			mars: 2,
			april: 3,
			maj: 4,
			juni: 5,
			juli: 6,
			augusti: 7,
			september: 8,
			oktober: 9,
			november: 10,
			december: 11,
		};

		const match = normalized.match(/(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?/);
		if (!match) {
			return null;
		}

		const monthIndex = monthMap[match[1]];
		const startDay = Number(match[2]);
		const endDay = Number(match[3] || match[2]);
		if (Number.isNaN(startDay) || Number.isNaN(endDay) || endDay < startDay) {
			return null;
		}

		const year = new Date().getFullYear();
		const start = new Date(year, monthIndex, startDay);
		const end = new Date(year, monthIndex, endDay);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
			return null;
		}

		const days = [];
		const cursor = new Date(start);
		while (cursor <= end) {
			days.push(new Date(cursor));
			cursor.setDate(cursor.getDate() + 1);
		}

		return {
			start,
			end,
			days,
			startIso: start.toISOString().slice(0, 10),
			endIso: end.toISOString().slice(0, 10),
		};
	}

	function renderHeader() {
		const event = getActiveEvent();
		if (!event) {
			mainTitle.textContent = 'Inga event';
			mainDateBadge.textContent = 'Datum saknas';
			mainLocationBadge.textContent = 'Plats saknas';
			if (mainDemoNote) {
				mainDemoNote.hidden = true;
			}
			return;
		}

		mainTitle.textContent = event.title;
		mainDateBadge.textContent = event.date;
		mainLocationBadge.textContent = event.location;
		if (mainDemoNote) {
			mainDemoNote.hidden = event.isDemo !== true;
		}
	}

	function renderChat() {
		const event = getActiveEvent();
		if (!chatBox) {
			return;
		}

		if (!event) {
			// Clear chat content when no event is selected to avoid showing stale data.
			chatBox.innerHTML = '<div class="msg system">Välj ett event för att se chatten.</div>';
			if (chatInput) {
				chatInput.disabled = true;
				chatInput.placeholder = 'Inget event valt';
				chatInput.value = '';
			}
			if (sendBtn) {
				sendBtn.disabled = true;
			}
			return;
		}

		chatBox.innerHTML = event.chat
			.map((msg) => {
				const tone = getMessageTone(msg);
				const meta = formatMessageMeta(msg);
				return `
					<div class="msg ${escapeHtml(tone)}">
						${meta ? `<div class="msg-meta">${escapeHtml(meta)}</div>` : ''}
						<div class="msg-text">${escapeHtml(msg.text)}</div>
					</div>
				`;
			})
			.join('');
		chatBox.scrollTop = chatBox.scrollHeight;
		if (chatInput) {
			chatInput.disabled = event.isDemo === true;
			chatInput.placeholder = event.isDemo === true ? 'Chatten är låst i demoeventet' : 'Skriv ett meddelande och tryck Enter';
		}
		if (sendBtn) {
			sendBtn.disabled = event.isDemo === true;
		}
	}

	function attachOverviewBindings() {
		const event = getActiveEvent();
		if (!event) {
			return;
		}

		const bind = (id, key, updateHeader) => {
			const input = document.getElementById(id);
			if (!input) {
				return;
			}

			input.addEventListener('input', (e) => {
				markDirty();
				event[key] = e.target.value;
				if (updateHeader) {
					renderHeader();
				}
			});
		};

		if (!event.isApi) {
			bind('overview-title', 'title', true);
			bind('overview-date', 'date', true);
			bind('overview-location', 'location', true);
			bind('overview-link', 'link', false);
		}
		bind('overview-description', 'description', false);
		bind('overview-internal-notes', 'internal_notes', false);
	}

	function renderOverview() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		const isApiEvent = event.isApi === true;
		const isDemoEvent = event.isDemo === true;
		const lockedAttr = isApiEvent ? 'readonly aria-readonly="true"' : '';
		const calendarMarkup = buildCalendarMarkup(event.date);
		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Översikt</h3>
					<p class="panel-copy">${isDemoEvent ? 'Det här är ett låst demoevent för planeringsvyn. Innehållet finns här för att visa hur en mässa kan planeras.' : 'Här redigerar du grunduppgifter för eventet. Fälten är utformade för snabb överblick och enkel uppdatering.'}</p>
				</div>
				<div class="actions">
					${event.link ? `<a class="btn btn-secondary" href="${escapeHtml(event.link)}" target="_blank" rel="noreferrer">Förhandsgranska</a>` : `<button class="btn btn-secondary" type="button" disabled>Förhandsgranska</button>`}
					${isDemoEvent ? `<button class="btn btn-primary" type="button" disabled>Demoevent</button>` : `<button class="btn btn-primary" type="submit" form="overviewForm">Spara ändringar</button>`}
				</div>
			</div>

			<form id="overviewForm" action="${escapeHtml(event.updateUrl || '#')}" method="post">
				<input type="hidden" name="requesttoken" value="${escapeHtml(requesttoken)}">

				<div class="section-block">
					<h4>Grunduppgifter</h4>
					<p>${isDemoEvent ? 'Det här demoeventet är låst och används bara för att visa ett exempel på en mässplanering.' : (isApiEvent ? 'Titel, datum, plats och länk är låsta eftersom eventet hämtas via API. Endast intern anteckning kan ändras här.' : 'Titel, datum, plats och sortering visas här som redigerbara fält.')}</p>

					<div class="form-grid">
						<div class="field full">
							<label for="overview-title">Titel</label>
							<input class="input" id="overview-title" type="text" name="title" value="${escapeHtml(event.title)}" ${isDemoEvent ? 'readonly aria-readonly="true"' : lockedAttr} ${isApiEvent || isDemoEvent ? '' : 'required'}>
						</div>

						<div class="field">
							<label for="overview-date">Datum</label>
							<input class="input" id="overview-date" type="text" name="date" value="${escapeHtml(event.date)}" ${isDemoEvent ? 'readonly aria-readonly="true"' : lockedAttr} ${isApiEvent || isDemoEvent ? '' : 'required'}>
						</div>
						<input type="hidden" name="sort_order" value="${escapeHtml(event.sortOrder)}">

						<div class="field full">
							<label for="overview-location">Plats</label>
							<input class="input" id="overview-location" type="text" name="location" value="${escapeHtml(event.location)}" ${isDemoEvent ? 'readonly aria-readonly="true"' : lockedAttr} ${isApiEvent || isDemoEvent ? '' : 'required'}>
						</div>

						<div class="field full">
							<label for="overview-link">Länk</label>
							<input class="input" id="overview-link" type="url" name="link" value="${escapeHtml(event.link)}" ${isDemoEvent ? 'readonly aria-readonly="true"' : lockedAttr}>
						</div>
					</div>
				</div>

				<div class="section-block">
					<h4>Kalender</h4>
					<p>Visuell överblick över vilka datum eventet pågår.</p>
					${calendarMarkup}
				</div>

				<div class="section-block">
					<h4>API-beskrivning</h4>
					<p>Den här texten hämtas från API:t och är låst för redigering.</p>
					<div class="field">
						<label for="overview-description">Beskrivning</label>
						<textarea class="textarea" id="overview-description" name="description" readonly aria-readonly="true">${escapeHtml(event.description)}</textarea>
					</div>
					<div class="small">Den här texten är låst eftersom den kommer från API:t.</div>
				</div>

				<div class="section-block">
					<h4>Interna anteckningar</h4>
					<p>De här anteckningarna visas i popup-fönstret när användaren klickar på eventet i widgeten.</p>
					<div class="field">
						<label for="overview-internal-notes">Interna anteckningar</label>
						<textarea class="textarea" id="overview-internal-notes" name="internal_notes" ${isDemoEvent ? 'readonly aria-readonly="true"' : ''}>${escapeHtml(event.internal_notes || '')}</textarea>
					</div>
					<div class="small">${isDemoEvent ? 'Demoeventet kan inte sparas.' : 'Ändringarna sparas när du klickar på Spara ändringar.'}</div>
				</div>
			</form>

			<div class="section-block">
				<h4>Publicering</h4>
				<p>Ta bort eventet om det inte längre ska visas i dashboard-widgeten.</p>
				<div>
					<button class="btn btn-accent" type="button" id="deleteEventBtn" ${isDemoEvent ? 'disabled' : ''}>${isDemoEvent ? 'Demoevent kan inte tas bort' : 'Ta bort event'}</button>
				</div>
			</div>
		`;

		const overviewForm = document.getElementById('overviewForm');
		if (overviewForm) {
			overviewForm.addEventListener('submit', async (e) => {
				e.preventDefault();
				if (state.submitting) return; // Guard against concurrent saves.
				state.submitting = true;
				const submitBtn = overviewForm.querySelector('[type="submit"]');
				if (submitBtn) {
					submitBtn.disabled = true;
					submitBtn.textContent = 'Sparar...';
				}
				try {
					await persistOverview(event);
					resetDirtyState();
					state.submitting = false;
					if (submitBtn) {
						submitBtn.textContent = 'Sparat';
					}
				} catch (error) {
					state.submitting = false;
					if (submitBtn) {
						submitBtn.textContent = 'Kunde inte spara';
					}
				} finally {
					window.setTimeout(() => {
						state.submitting = false;
						if (submitBtn) {
							submitBtn.disabled = false;
							submitBtn.textContent = 'Spara ändringar';
						}
					}, 1400);
				}
			});
		}

		const deleteBtn = document.getElementById('deleteEventBtn');
		if (deleteBtn) {
			deleteBtn.addEventListener('click', async () => {
				if (isDemoEvent) {
					return;
				}
				const confirmed = window.confirm(`Är du säker på att du vill ta bort "${event.title}"?`);
				if (!confirmed) {
					return;
				}
				deleteBtn.disabled = true;
				deleteBtn.textContent = 'Tar bort...';
				try {
					const formData = new URLSearchParams({ requesttoken });
					const response = await fetch(event.deleteUrl, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
						},
						body: formData.toString(),
						credentials: 'same-origin',
					});
					if (!response.ok) {
						throw new Error('delete-failed');
					}
					deleteBtn.textContent = 'Borttaget';
					window.location.reload();
				} catch (error) {
					deleteBtn.textContent = 'Kunde inte ta bort';
					window.setTimeout(() => {
						deleteBtn.disabled = false;
						deleteBtn.textContent = 'Ta bort event';
					}, 2000);
				}
			});
		}

		attachOverviewBindings();
	}

	function renderOverviewSummary() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		const eventOwner = getEventOwner(event);
		const calendarMarkup = buildCalendarMarkup(event.date);
		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Översikt</h3>
					<p class="panel-copy">Sammanfattning av eventets viktigaste uppgifter.</p>
				</div>
			</div>

			<div class="summary-grid">
				<div class="section-block summary-card">
					<h4>Grunduppgifter</h4>
					<div class="summary-list">
						<div><span>Titel</span><strong>${escapeHtml(event.title)}</strong></div>
						<div><span>Datum</span><strong>${escapeHtml(event.date)}</strong></div>
						<div><span>Plats</span><strong>${escapeHtml(event.location)}</strong></div>
						<div><span>Eventansvarig</span><strong>${escapeHtml(getPersonDisplayName(eventOwner))}</strong></div>
						<div><span>Länk</span><strong>${event.link ? `<a href="${escapeHtml(event.link)}" target="_blank" rel="noreferrer">Öppna</a>` : 'Saknas'}</strong></div>
					</div>
				</div>
				<div class="section-block summary-card">
					<h4>Kalender</h4>
					${calendarMarkup}
				</div>
			</div>

			<div class="section-block">
				<h4>Interna anteckningar</h4>
				<p>${escapeHtml(event.internal_notes || 'Inga interna anteckningar tillagda ännu.')}</p>
			</div>
		`;
	}

	function renderStaff() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		ensureEventOwnerRow(event);

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Personal</h3>
					<p class="panel-copy">Välj en registrerad Nextcloud-user i dropdownen eller lämna den på Välj person för att fylla i en extern person manuellt.</p>
				</div>
				<div class="actions">
					<button class="btn btn-primary" type="button" id="saveStaffBtn">Spara personal</button>
					<button class="btn btn-accent" type="button" id="addPersonBtn">Lägg till person</button>
				</div>
			</div>

			<div class="section-block">
				<h4>Bemanning och ansvar</h4>
				<p>Varje rad motsvarar en person i eventorganisationen. Rollen och ansvarsområdet kan justeras direkt.</p>

				<div class="table-wrap">
					<table class="staff-table">
						<thead>
							<tr>
								<th>Roll</th>
								<th>Person</th>
								<th>Ansvarsområde</th>
								<th>E-post</th>
								<th>Telefon</th>
								<th>Ta bort</th>
							</tr>
						</thead>
						<tbody>
							${event.staff.map((person, index) => `
								${(() => {
									const selectedUser = person.userId ? getAvailableUser(person.userId) : null;
									const hasManualDetails = Boolean(person.firstName || person.lastName || person.email || person.phone);
									const isManual = person.isExternal === true || (!person.userId && hasManualDetails);
									const selectedValue = person.userId || (isManual ? '__external__' : '');
									const isEventOwner = index === 0;
									return `
								<tr>
									<td><input class="table-input" data-type="role" data-index="${index}" value="${escapeHtml(person.role)}" ${isEventOwner ? 'readonly aria-readonly="true"' : ''}></td>
									<td>
										<div class="staff-person-cell">
											<select class="table-select staff-user-select" data-index="${index}">
												<option value="">Välj person</option>
												<option value="__external__" ${selectedValue === '__external__' ? 'selected' : ''}>Extern person</option>
												${state.availableUsers.map((user) => `
													<option value="${escapeHtml(user.id)}" ${selectedValue === user.id ? 'selected' : ''}>${escapeHtml(user.label)}</option>
												`).join('')}
											</select>
											${isManual ? `
												<div class="staff-manual-grid">
													<input class="table-input staff-manual-input" data-field="firstName" data-index="${index}" placeholder="Förnamn" value="${escapeHtml(person.firstName || '')}">
													<input class="table-input staff-manual-input" data-field="lastName" data-index="${index}" placeholder="Efternamn" value="${escapeHtml(person.lastName || '')}">
												</div>
											` : `
												<div class="small staff-user-meta">${escapeHtml(selectedUser?.label || '')}</div>
											`}
										</div>
									</td>
									<td><input class="table-input" data-type="area" data-index="${index}" value="${escapeHtml(person.area)}"></td>
									<td>
										<input class="table-input staff-email-input" data-index="${index}" value="${escapeHtml(isManual ? (person.email || '') : (selectedUser?.email || ''))}" ${isManual ? '' : 'readonly aria-readonly="true"'} placeholder="mejl@example.com">
									</td>
									<td>
										<input class="table-input staff-phone-input" data-index="${index}" value="${escapeHtml(isManual ? (person.phone || '') : (selectedUser?.phone || ''))}" ${isManual ? '' : 'readonly aria-readonly="true"'} placeholder="070-123 45 67">
									</td>
									<td>${isEventOwner ? '<span class="small">Fast roll</span>' : `<button class="icon-btn remove-person" type="button" data-index="${index}" aria-label="Ta bort person">×</button>`}</td>
								</tr>
									`;
								})()}
							`).join('')}
						</tbody>
					</table>
				</div>
			</div>
		`;

		// Use event delegation on the table to avoid listener leaks.
		const staffTable = dynamicContent.querySelector('.staff-table');
		if (staffTable) {
			staffTable.addEventListener('change', (e) => {
				const target = e.target;
				if (target.classList.contains('staff-user-select')) {
					handleStaffSelectChange(target);
				}
			});
		}

		function handleStaffSelectChange(selectEl) {
			const index = Number(selectEl.dataset.index);
			const selectedValue = selectEl.value;
			const isExternal = selectedValue === '__external__';
			const userId = !isExternal ? selectedValue : '';
			const selectedUser = userId ? getAvailableUser(userId) : null;

			markDirty();
			event.staff[index].userId = userId;
			event.staff[index].isExternal = isExternal;
			if (selectedUser) {
				event.staff[index].firstName = selectedUser.firstName || '';
				event.staff[index].lastName = selectedUser.lastName || '';
				event.staff[index].email = selectedUser.email || '';
				event.staff[index].phone = selectedUser.phone || '';
				event.staff[index].isExternal = false;
			} else if (!isExternal) {
				event.staff[index].firstName = '';
				event.staff[index].lastName = '';
				event.staff[index].email = '';
				event.staff[index].phone = '';
			}

			// Targeted DOM update instead of full re-render to preserve focus and scroll.
			updateStaffRowDOM(index);
		}

		function updateStaffRowDOM(index) {
			const person = event.staff[index];
			const row = dynamicContent.querySelector(`tr:has([data-index="${index}"])`);
			if (!row) {
				renderStaff();
				return;
			}

			const selectedUser = person.userId ? getAvailableUser(person.userId) : null;
			const isManual = person.isExternal === true || (!person.userId && (person.firstName || person.lastName || person.email || person.phone));
			const cell = row.querySelector('.staff-person-cell');
			if (cell) {
				if (isManual) {
					cell.innerHTML = `
						<select class="table-select staff-user-select" data-index="${index}">
							<option value="">Välj person</option>
							<option value="__external__" selected>Extern person</option>
							${state.availableUsers.map((user) => `
								<option value="${escapeHtml(user.id)}" ${person.userId === user.id ? 'selected' : ''}>${escapeHtml(user.label)}</option>
							`).join('')}
						</select>
						<div class="staff-manual-grid">
							<input class="table-input staff-manual-input" data-field="firstName" data-index="${index}" placeholder="Förnamn" value="${escapeHtml(person.firstName || '')}">
							<input class="table-input staff-manual-input" data-field="lastName" data-index="${index}" placeholder="Efternamn" value="${escapeHtml(person.lastName || '')}">
						</div>
					`;
				} else {
					cell.innerHTML = `
						<select class="table-select staff-user-select" data-index="${index}">
							<option value="">Välj person</option>
							<option value="__external__">Extern person</option>
							${state.availableUsers.map((user) => `
								<option value="${escapeHtml(user.id)}" ${person.userId === user.id ? 'selected' : ''}>${escapeHtml(user.label)}</option>
							`).join('')}
						</select>
						<div class="small staff-user-meta">${escapeHtml(selectedUser?.label || '')}</div>
					`;
				}
				// No need to re-attach listener — event delegation on the table handles it.
			}

			// Update email field.
			const emailInput = row.querySelector('.staff-email-input');
			if (emailInput) {
				emailInput.value = isManual ? (person.email || '') : (selectedUser?.email || '');
				emailInput.readOnly = !isManual;
				if (isManual) {
					emailInput.removeAttribute('readonly');
					emailInput.removeAttribute('aria-readonly');
				} else {
					emailInput.setAttribute('readonly', 'true');
					emailInput.setAttribute('aria-readonly', 'true');
				}
			}

			// Update phone field.
			const phoneInput = row.querySelector('.staff-phone-input');
			if (phoneInput) {
				phoneInput.value = isManual ? (person.phone || '') : (selectedUser?.phone || '');
				phoneInput.readOnly = !isManual;
				if (isManual) {
					phoneInput.removeAttribute('readonly');
					phoneInput.removeAttribute('aria-readonly');
				} else {
					phoneInput.setAttribute('readonly', 'true');
					phoneInput.setAttribute('aria-readonly', 'true');
				}
			}
		}

		dynamicContent.querySelectorAll('.staff-manual-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				const field = e.target.dataset.field;
				markDirty();
				event.staff[index][field] = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.staff-email-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				if (!event.staff[index].userId) {
					markDirty();
					event.staff[index].email = e.target.value;
				}
			});
		});

		dynamicContent.querySelectorAll('.staff-phone-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				if (!event.staff[index].userId) {
					markDirty();
					event.staff[index].phone = e.target.value;
				}
			});
		});

		dynamicContent.querySelectorAll('.table-input[data-type]').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				const type = e.target.dataset.type;
				if (index === 0 && type === 'role') {
					e.target.value = 'Eventansvarig';
					event.staff[index].role = 'Eventansvarig';
					return;
				}
				markDirty();
				event.staff[index][type] = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.remove-person').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				const index = Number(e.currentTarget.dataset.index);
				markDirty();
				event.staff.splice(index, 1);
				renderStaff();
			});
		});

		const addBtn = document.getElementById('addPersonBtn');
		if (addBtn) {
			addBtn.addEventListener('click', () => {
				markDirty();
				event.staff.push({ userId: '', firstName: '', lastName: '', email: '', phone: '', role: '', area: '', isExternal: false });
				renderStaff();
			});
		}

		const saveBtn = document.getElementById('saveStaffBtn');
		if (saveBtn) {
			saveBtn.addEventListener('click', async () => {
				if (state.submitting) return; // Guard against concurrent saves.
				state.submitting = true;
				saveBtn.disabled = true;
				saveBtn.textContent = 'Sparar...';
				// Remove any previous error notification.
				const prevError = dynamicContent.querySelector('.staff-save-error');
				if (prevError) {
					prevError.remove();
				}

				try {
					const body = new URLSearchParams({
						requesttoken,
						staff_json: serializeStaff(event.staff),
					});

					const response = await fetch(event.saveStaffUrl, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
						},
						body: body.toString(),
					});

					if (!response.ok) {
						throw new Error('save_failed');
					}

					resetDirtyState();
					saveBtn.textContent = 'Sparat';
				} catch (error) {
					// Show a persistent inline error message with retry option.
					const errorEl = document.createElement('div');
					errorEl.className = 'staff-save-error';
					errorEl.setAttribute('role', 'alert');
					errorEl.style.cssText = 'margin-top:10px;padding:10px 14px;border-radius:12px;background:#fde8e8;color:#8b2015;border:1px solid rgba(139,32,21,0.2);font-size:13px;font-weight:700;display:flex;align-items:center;gap:10px;';
					errorEl.innerHTML = `<span>Kunde inte spara personalen. Kontrollera din anslutning och försök igen.</span><button class="btn btn-secondary" type="button" style="min-height:28px;font-size:12px;padding:0 10px;">Försök igen</button>`;
					const panelHead = dynamicContent.querySelector('.panel-head');
					if (panelHead) {
						panelHead.after(errorEl);
					}
					const retryBtn = errorEl.querySelector('button');
					if (retryBtn) {
						retryBtn.addEventListener('click', async () => {
							retryBtn.disabled = true;
							retryBtn.textContent = 'Försöker...';
							try {
								const body = new URLSearchParams({
									requesttoken,
									staff_json: serializeStaff(event.staff),
								});
								const resp = await fetch(event.saveStaffUrl, {
									method: 'POST',
									headers: {
										'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
									},
									body: body.toString(),
								});
								if (!resp.ok) {
									throw new Error('save_failed');
								}
								resetDirtyState();
								errorEl.remove();
								saveBtn.textContent = 'Sparat';
								window.setTimeout(() => {
									saveBtn.disabled = false;
									saveBtn.textContent = 'Spara personal';
								}, 1400);
							} catch (err) {
								retryBtn.disabled = false;
								retryBtn.textContent = 'Försök igen';
							}
						});
					}
				} finally {
					window.setTimeout(() => {
						state.submitting = false;
						const errEl = dynamicContent.querySelector('.staff-save-error');
						if (errEl && saveBtn.textContent !== 'Sparat') {
							// Keep error visible until user interacts; only auto-remove "Sparat" state.
						}
						if (saveBtn.textContent === 'Sparat') {
							saveBtn.disabled = false;
							saveBtn.textContent = 'Spara personal';
						}
					}, 1400);
				}
			});
		}
	}

	function renderStaffSummary() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		ensureEventOwnerRow(event);

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Personal</h3>
					<p class="panel-copy">Sammanställning över bemanning, roller och kontaktuppgifter.</p>
				</div>
			</div>
			<div class="summary-stack">
				${event.staff.map((person) => {
					const selectedUser = person.userId ? getAvailableUser(person.userId) : null;
					const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || selectedUser?.label || 'Inte tilldelad';
					const email = person.userId ? (selectedUser?.email || person.email || 'Saknas') : (person.email || 'Saknas');
					const phone = person.userId ? (selectedUser?.phone || person.phone || 'Saknas') : (person.phone || 'Saknas');
					return `
						<div class="section-block summary-card">
							<h4>${escapeHtml(fullName)}</h4>
							<div class="summary-list">
								<div><span>Roll</span><strong>${escapeHtml(person.role || 'Saknas')}</strong></div>
								<div><span>Ansvar</span><strong>${escapeHtml(person.area || 'Saknas')}</strong></div>
								<div><span>E-post</span><strong>${escapeHtml(email)}</strong></div>
								<div><span>Telefon</span><strong>${escapeHtml(phone)}</strong></div>
								<div><span>Källa</span><strong>${person.userId ? 'Nextcloud-user' : 'Extern person'}</strong></div>
							</div>
						</div>
					`;
				}).join('')}
			</div>
		`;
	}

	function renderMaterial() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		if (!Array.isArray(event.material)) {
			event.material = [];
		}

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Material</h3>
					<p class="panel-copy">Skapa en enkel checklista för det som ska med till eventet. Varje rad kan bockas av och redigeras direkt.</p>
				</div>
				<div class="actions">
					<button class="btn btn-accent" type="button" id="addChecklistBtn">Lägg till punkt</button>
				</div>
			</div>

				<div class="section-block">
					<h4>Checklista</h4>
					<p>Markera färdigt material och välj ansvarig person från Nextcloud eller skriv in en ny person manuellt.</p>

				<div class="checklist">
					${event.material.map((item, index) => {
						const ownerUser = item.ownerUserId ? getAvailableUser(item.ownerUserId) : null;
						const isManualOwner = !item.ownerUserId;
						return `
						<div class="check-row ${item.done ? 'done' : ''}">
							<input class="check" type="checkbox" data-index="${index}" ${item.done ? 'checked' : ''} aria-label="Markera som klar">
							<div class="check-main">
								<input class="check-text" type="text" data-index="${index}" value="${escapeHtml(item.text)}">
							</div>
							<div class="check-owner-block">
								<div class="small check-owner-label">Ansvarig person</div>
								<select class="check-owner-select" data-index="${index}">
									<option value="">Välj person</option>
									${state.availableUsers.map((user) => `
										<option value="${escapeHtml(user.id)}" ${item.ownerUserId === user.id ? 'selected' : ''}>${escapeHtml(user.label)}</option>
									`).join('')}
								</select>
								${isManualOwner
									? `<input class="check-owner" type="text" data-index="${index}" value="${escapeHtml(item.ownerName || '')}" placeholder="Ansvarig person">`
									: `<div class="small check-owner-meta">${escapeHtml(ownerUser?.label || '')}</div>`}
							</div>
							<div class="check-notes-block">
								<div class="small check-notes-label">Anteckningar</div>
								<textarea class="check-notes" data-index="${index}" placeholder="Skriv anteckningar för momentet">${escapeHtml(item.notes || '')}</textarea>
							</div>
							<button class="icon-btn remove-item" type="button" data-index="${index}" aria-label="Ta bort checklistepunkt">×</button>
						</div>
						`;
					}).join('')}
				</div>
			</div>

			<div class="empty-note">Tips: lägg in till exempel rollup, flyers, visitkort, bordsduk och förlängningskabel.</div>
		`;

		dynamicContent.querySelectorAll('.check').forEach((box) => {
			box.addEventListener('change', (e) => {
				const index = Number(e.target.dataset.index);
				markDirty();
				event.material[index].done = e.target.checked;
				renderMaterial();
			});
		});

		dynamicContent.querySelectorAll('.check-text').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				markDirty();
				event.material[index].text = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.check-owner-select').forEach((select) => {
			select.addEventListener('change', (e) => {
				const index = Number(e.target.dataset.index);
				const userId = e.target.value;
				const ownerUser = userId ? getAvailableUser(userId) : null;
				markDirty();
				event.material[index].ownerUserId = userId;
				event.material[index].ownerName = ownerUser?.label || '';
				renderMaterial();
			});
		});

		dynamicContent.querySelectorAll('.check-owner').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				markDirty();
				event.material[index].ownerName = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.check-notes').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				markDirty();
				event.material[index].notes = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.remove-item').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				const index = Number(e.currentTarget.dataset.index);
				markDirty();
				event.material.splice(index, 1);
				renderMaterial();
			});
		});

		const addBtn = document.getElementById('addChecklistBtn');
		if (addBtn) {
			addBtn.addEventListener('click', () => {
				markDirty();
				event.material.push({ text: '', done: false, ownerUserId: '', ownerName: '', notes: '' });
				renderMaterial();
			});
		}
	}

	function renderMaterialSummary() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Material</h3>
					<p class="panel-copy">Snabb översikt över vad som är klart och vad som återstår.</p>
				</div>
			</div>
			<div class="summary-stack">
				${event.material.map((item) => `
					<div class="section-block summary-card">
						<div class="summary-badge-row">
							<span class="summary-status ${item.done ? 'done' : 'todo'}">${item.done ? 'Klar' : 'Ej klar'}</span>
						</div>
						<div class="summary-list">
							<div><span>Moment</span><strong>${escapeHtml(item.text || 'Tom punkt')}</strong></div>
							<div><span>Ansvarig</span><strong>${escapeHtml((item.ownerUserId ? (getAvailableUser(item.ownerUserId)?.label || item.ownerName) : item.ownerName) || 'Saknas')}</strong></div>
							<div><span>Anteckning</span><strong>${escapeHtml(item.notes || 'Saknas')}</strong></div>
						</div>
					</div>
				`).join('')}
			</div>
		`;
	}

	function renderMarketing() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		if (!Array.isArray(event.marketing)) {
			event.marketing = [];
		}

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Marknadsföring</h3>
					<p class="panel-copy">Här kan du lista vilka orters medlemmar som fått mejl och vilka Facebooksidor som är aktuella att marknadsföra eventet i, särskilt nära eventorten.</p>
				</div>
				<div class="actions">
					<button class="btn btn-accent" type="button" id="addMarketingBtn">Lägg till ort</button>
				</div>
			</div>

			<div class="section-block">
				<h4>Utskick och lokala kanaler</h4>
				<p>Använd tabellen för att följa upp geografisk spridning och lokala sociala kanaler som kan vara relevanta för marknadsföring.</p>

				<div class="table-wrap">
					<table class="staff-table">
						<thead>
							<tr>
								<th>Ort</th>
								<th>Mejl gått ut</th>
								<th>Aktuella Facebooksidor</th>
								<th>Kommentar</th>
								<th>Ta bort</th>
							</tr>
						</thead>
						<tbody>
							${event.marketing.map((row, index) => `
								<tr>
									<td><input class="table-input marketing-input" data-type="city" data-index="${index}" value="${escapeHtml(row.city)}"></td>
									<td><input class="table-input marketing-input" data-type="mailSent" data-index="${index}" value="${escapeHtml(row.mailSent)}"></td>
									<td><input class="table-input marketing-input" data-type="facebookPages" data-index="${index}" value="${escapeHtml(row.facebookPages)}"></td>
									<td><input class="table-input marketing-input" data-type="comment" data-index="${index}" value="${escapeHtml(row.comment)}"></td>
									<td><button class="icon-btn remove-marketing" type="button" data-index="${index}" aria-label="Ta bort rad">×</button></td>
								</tr>
							`).join('')}
						</tbody>
					</table>
				</div>
			</div>

			<div class="empty-note">Exempel: Uppsala, Stockholm, Västerås, Enköping och andra orter inom rimligt avstånd från eventet.</div>

			<div class="section-block marketing-map-block">
				<div class="marketing-map-head">
					<div>
						<h4>Karta</h4>
						<p>Överblick för geografisk planering och spridning i närområdet.</p>
					</div>
				</div>
				<div class="marketing-map-frame-wrap">
					<iframe
						class="marketing-map-frame"
						src="https://sverigekarta-ambswe.onrender.com/"
						title="Sverigekarta för marknadsföring"
						loading="lazy"
						referrerpolicy="strict-origin-when-cross-origin"
					></iframe>
				</div>
			</div>
		`;

		dynamicContent.querySelectorAll('.marketing-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				const type = e.target.dataset.type;
				markDirty();
				event.marketing[index][type] = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.remove-marketing').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				const index = Number(e.currentTarget.dataset.index);
				markDirty();
				event.marketing.splice(index, 1);
				renderMarketing();
			});
		});

		const addBtn = document.getElementById('addMarketingBtn');
		if (addBtn) {
			addBtn.addEventListener('click', () => {
				markDirty();
				event.marketing.push({ city: '', mailSent: '', facebookPages: '', comment: '' });
				renderMarketing();
			});
		}
	}

	function renderMarketingSummary() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Marknadsföring</h3>
					<p class="panel-copy">Sammanställning över orter, utskick och lokala kanaler.</p>
				</div>
			</div>
			<div class="summary-stack">
				${event.marketing.map((row) => `
					<div class="section-block summary-card">
						<h4>${escapeHtml(row.city || 'Ort saknas')}</h4>
						<div class="summary-list">
							<div><span>Mejl</span><strong>${escapeHtml(row.mailSent || 'Saknas')}</strong></div>
							<div><span>Facebook</span><strong>${escapeHtml(row.facebookPages || 'Saknas')}</strong></div>
							<div><span>Kommentar</span><strong>${escapeHtml(row.comment || 'Saknas')}</strong></div>
						</div>
					</div>
				`).join('')}
			</div>
		`;
	}

	function computeBudgetTotals(budget) {
		let totalIncome = 0;
		let totalCost = 0;
		budget.forEach((entry) => {
			const amount = Number(entry.amount || 0);
			if (entry.type === 'income') { totalIncome += amount; } else { totalCost += amount; }
		});
		return { income: totalIncome, cost: totalCost, net: totalIncome - totalCost };
	}

	function renderBudget() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		if (!Array.isArray(event.budget)) {
			event.budget = [];
		}

		const totals = computeBudgetTotals(event.budget);
		const isDemoEvent = event.isDemo === true;

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Budget</h3>
					<p class="panel-copy">Planera eventets ekonomi med intäkter och kostnader. Totalsumman uppdateras live.</p>
				</div>
				<div class="actions">
					<button class="btn btn-primary" type="button" id="saveBudgetBtn">Spara budget</button>
					<button class="btn btn-accent" type="button" id="addBudgetBtn">Lägg till post</button>
				</div>
			</div>

			<div class="section-block">
				<h4>Budgetposter</h4>
				<p>Lägg till intäkter och kostnader. Ange ansvarig och status för varje post.</p>

				<div class="budget-totals">
					<div class="budget-total-item">
						<span class="budget-total-label">Intäkter</span>
						<span class="budget-total-value budget-income">${totals.income.toLocaleString('sv-SE')} kr</span>
					</div>
					<div class="budget-total-item">
						<span class="budget-total-label">Kostnader</span>
						<span class="budget-total-value budget-cost">−${totals.cost.toLocaleString('sv-SE')} kr</span>
					</div>
					<div class="budget-total-item budget-net-item">
						<span class="budget-total-label">Netto</span>
						<span class="budget-total-value budget-net ${totals.net >= 0 ? 'positive' : 'negative'}">${(totals.net >= 0 ? '' : '−')}${Math.abs(totals.net).toLocaleString('sv-SE')} kr</span>
					</div>
				</div>

				<div class="table-wrap">
					<table class="staff-table">
						<thead>
							<tr>
								<th>Typ</th>
								<th>Benämning</th>
								<th>Belopp (kr)</th>
								<th>Status</th>
								<th>Ansvarig</th>
								<th>Anteckning</th>
								<th>Ta bort</th>
							</tr>
						</thead>
						<tbody>
							${event.budget.map((entry, index) => {
								const ownerUser = entry.ownerUserId ? getAvailableUser(entry.ownerUserId) : null;
								const isManualOwner = !entry.ownerUserId;
								return `
								<tr>
									<td>
										<select class="table-select budget-type-select" data-index="${index}">
											<option value="cost" ${entry.type === 'cost' ? 'selected' : ''}>Kostnad</option>
											<option value="income" ${entry.type === 'income' ? 'selected' : ''}>Intäkt</option>
										</select>
									</td>
									<td><input class="table-input budget-label-input" data-index="${index}" value="${escapeHtml(entry.label || '')}" placeholder="Benämning"></td>
									<td><input class="table-input budget-amount-input" data-index="${index}" type="number" min="0" value="${escapeHtml(String(entry.amount || 0))}"></td>
									<td>
										<select class="table-select budget-status-select" data-index="${index}">
											<option value="planned" ${entry.status === 'planned' ? 'selected' : ''}>Planerad</option>
											<option value="booked" ${entry.status === 'booked' ? 'selected' : ''}>Bokad</option>
											<option value="received" ${entry.status === 'received' ? 'selected' : ''}>Mottagen</option>
										</select>
									</td>
									<td>
										<div class="staff-person-cell">
											<select class="table-select budget-owner-select" data-index="${index}">
												<option value="">Välj person</option>
												${state.availableUsers.map((user) => `
													<option value="${escapeHtml(user.id)}" ${entry.ownerUserId === user.id ? 'selected' : ''}>${escapeHtml(user.label)}</option>
												`).join('')}
											</select>
											${isManualOwner
												? `<input class="table-input budget-owner-name-input" data-index="${index}" value="${escapeHtml(entry.ownerName || '')}" placeholder="Ansvarig person">`
												: `<div class="small staff-user-meta">${escapeHtml(ownerUser?.label || '')}</div>`}
										</div>
									</td>
									<td><input class="table-input budget-notes-input" data-index="${index}" value="${escapeHtml(entry.notes || '')}" placeholder="Anteckning"></td>
									<td><button class="icon-btn remove-budget" type="button" data-index="${index}" aria-label="Ta bort budgetpost">×</button></td>
								</tr>
								`;
							}).join('')}
						</tbody>
					</table>
				</div>
				${event.budget.length === 0 ? `<div class="empty-note">Inga budgetposter tillagda ännu.</div>` : ''}
			</div>
		`;

		dynamicContent.querySelectorAll('.budget-type-select').forEach((select) => {
			select.addEventListener('change', (e) => {
				const index = Number(e.target.dataset.index);
				markDirty();
				event.budget[index].type = e.target.value;
				renderBudget();
			});
		});

		dynamicContent.querySelectorAll('.budget-label-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				markDirty();
				event.budget[index].label = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.budget-amount-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				markDirty();
				event.budget[index].amount = Number(e.target.value) || 0;
				renderBudgetTotals();
			});
		});

		dynamicContent.querySelectorAll('.budget-status-select').forEach((select) => {
			select.addEventListener('change', (e) => {
				const index = Number(e.target.dataset.index);
				markDirty();
				event.budget[index].status = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.budget-owner-select').forEach((select) => {
			select.addEventListener('change', (e) => {
				const index = Number(e.target.dataset.index);
				const userId = e.target.value;
				const ownerUser = userId ? getAvailableUser(userId) : null;
				markDirty();
				event.budget[index].ownerUserId = userId;
				event.budget[index].ownerName = ownerUser?.label || '';
				renderBudget();
			});
		});

		dynamicContent.querySelectorAll('.budget-owner-name-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				markDirty();
				event.budget[index].ownerName = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.budget-notes-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				markDirty();
				event.budget[index].notes = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.remove-budget').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				const index = Number(e.currentTarget.dataset.index);
				markDirty();
				event.budget.splice(index, 1);
				renderBudget();
			});
		});

		const addBtn = document.getElementById('addBudgetBtn');
		if (addBtn) {
			addBtn.addEventListener('click', () => {
				markDirty();
				event.budget.push({ label: '', type: 'cost', amount: 0, status: 'planned', ownerUserId: '', ownerName: '', notes: '' });
				renderBudget();
			});
		}

		const saveBtn = document.getElementById('saveBudgetBtn');
		if (saveBtn) {
			saveBtn.addEventListener('click', async () => {
				if (state.submitting) return; // Guard against concurrent saves.
				state.submitting = true;
				saveBtn.disabled = true;
				saveBtn.textContent = 'Sparar...';
				const prevError = dynamicContent.querySelector('.budget-save-error');
				if (prevError) {
					prevError.remove();
				}

				try {
					await persistBudget(event);
					resetDirtyState();
					saveBtn.textContent = 'Sparat';
				} catch (error) {
					const errorEl = document.createElement('div');
					errorEl.className = 'budget-save-error';
					errorEl.setAttribute('role', 'alert');
					errorEl.style.cssText = 'margin-top:10px;padding:10px 14px;border-radius:12px;background:#fde8e8;color:#8b2015;border:1px solid rgba(139,32,21,0.2);font-size:13px;font-weight:700;display:flex;align-items:center;gap:10px;';
					errorEl.innerHTML = `<span>Kunde inte spara budgeten. Kontrollera din anslutning och försök igen.</span><button class="btn btn-secondary" type="button" style="min-height:28px;font-size:12px;padding:0 10px;">Försök igen</button>`;
					const panelHead = dynamicContent.querySelector('.panel-head');
					if (panelHead) {
						panelHead.after(errorEl);
					}
					const retryBtn = errorEl.querySelector('button');
					if (retryBtn) {
						retryBtn.addEventListener('click', async () => {
							retryBtn.disabled = true;
							retryBtn.textContent = 'Försöker...';
							try {
								await persistBudget(event);
								resetDirtyState();
								errorEl.remove();
								saveBtn.textContent = 'Sparat';
								window.setTimeout(() => {
									saveBtn.disabled = false;
									saveBtn.textContent = 'Spara budget';
								}, 1400);
							} catch (err) {
								retryBtn.disabled = false;
								retryBtn.textContent = 'Försök igen';
							}
						});
					}
				} finally {
					window.setTimeout(() => {
						state.submitting = false;
						if (saveBtn.textContent === 'Sparat') {
							saveBtn.disabled = false;
							saveBtn.textContent = 'Spara budget';
						}
					}, 1400);
				}
			});
		}
	}

	function renderBudgetTotals() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		const totals = computeBudgetTotals(Array.isArray(event.budget) ? event.budget : []);
		const totalsEl = dynamicContent.querySelector('.budget-totals');
		if (!totalsEl) {
			return;
		}

		const incomeEl = totalsEl.querySelector('.budget-income');
		const costEl = totalsEl.querySelector('.budget-cost');
		const netEl = totalsEl.querySelector('.budget-net');

		if (incomeEl) { incomeEl.textContent = `${totals.income.toLocaleString('sv-SE')} kr`; }
		if (costEl) { costEl.textContent = `−${totals.cost.toLocaleString('sv-SE')} kr`; }
		if (netEl) {
			netEl.textContent = `${(totals.net >= 0 ? '' : '−')}${Math.abs(totals.net).toLocaleString('sv-SE')} kr`;
			netEl.classList.toggle('positive', totals.net >= 0);
			netEl.classList.toggle('negative', totals.net < 0);
		}
	}

	function renderBudgetSummary() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		const budget = Array.isArray(event.budget) ? event.budget : [];
		const totals = computeBudgetTotals(budget);

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Budget</h3>
					<p class="panel-copy">Sammanställning av eventets ekonomi.</p>
				</div>
			</div>

			<div class="budget-totals">
				<div class="budget-total-item">
					<span class="budget-total-label">Intäkter</span>
					<span class="budget-total-value budget-income">${totals.income.toLocaleString('sv-SE')} kr</span>
				</div>
				<div class="budget-total-item">
					<span class="budget-total-label">Kostnader</span>
					<span class="budget-total-value budget-cost">−${totals.cost.toLocaleString('sv-SE')} kr</span>
				</div>
				<div class="budget-total-item budget-net-item">
					<span class="budget-total-label">Netto</span>
					<span class="budget-total-value budget-net ${totals.net >= 0 ? 'positive' : 'negative'}">${(totals.net >= 0 ? '' : '−')}${Math.abs(totals.net).toLocaleString('sv-SE')} kr</span>
				</div>
			</div>

			<div class="summary-stack">
				${budget.map((entry) => {
					const isCost = entry.type === 'cost';
					const sign = isCost ? '−' : '+';
					const statusLabel = { planned: 'Planerad', booked: 'Bokad', received: 'Mottagen' }[entry.status] || entry.status;
					const ownerName = (entry.ownerUserId ? (getAvailableUser(entry.ownerUserId)?.label || entry.ownerName) : entry.ownerName) || 'Saknas';
					return `
						<div class="section-block summary-card">
							<div class="summary-badge-row">
								<span class="summary-status ${isCost ? 'cost' : 'income'}">${isCost ? 'Kostnad' : 'Intäkt'}</span>
								<span class="summary-status ${entry.status}">${statusLabel}</span>
							</div>
							<div class="summary-list">
								<div><span>Benämning</span><strong>${escapeHtml(entry.label || 'Post')}</strong></div>
								<div><span>Belopp</span><strong>${sign} ${Number(entry.amount || 0).toLocaleString('sv-SE')} kr</strong></div>
								<div><span>Ansvarig</span><strong>${escapeHtml(ownerName)}</strong></div>
								${entry.notes ? `<div><span>Anteckning</span><strong>${escapeHtml(entry.notes)}</strong></div>` : ''}
							</div>
						</div>
					`;
				}).join('')}
				${budget.length === 0 ? '<div class="empty-note">Ingen budget tillagd ännu.</div>' : ''}
			</div>
		`;
	}

	async function uploadDocument(event, file) {
		if (!event.uploadDocumentUrl || event.isDemo === true) {
			throw new Error('document-upload-disabled');
		}

		const formData = new FormData();
		formData.append('document_file', file);

		const response = await fetch(event.uploadDocumentUrl, {
			method: 'POST',
			headers: {
				requesttoken,
			},
			body: formData,
			credentials: 'same-origin',
		});

		if (!response.ok) {
			throw new Error('document-upload-failed');
		}

		const payload = await response.json();
		if (!payload?.ok || !payload.document) {
			throw new Error('document-upload-invalid');
		}

		return payload.document;
	}

	async function deleteDocument(event, document) {
		if (!document?.deleteUrl || event.isDemo === true) {
			throw new Error('document-delete-disabled');
		}

		const body = new URLSearchParams({ requesttoken });
		const response = await fetch(document.deleteUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
			},
			body: body.toString(),
			credentials: 'same-origin',
		});

		if (!response.ok) {
			throw new Error('document-delete-failed');
		}
	}

	function renderDocuments() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		const documents = Array.isArray(event.documents) ? event.documents : [];
		const isDemoEvent = event.isDemo === true;
		const emptyCopy = isDemoEvent
			? 'Det här demoeventet har inga riktiga filer kopplade.'
			: 'Ladda upp dokument kopplade till eventet, till exempel körschema, avtal, PDF:er och bildmaterial.';

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Dokument</h3>
					<p class="panel-copy">${emptyCopy}</p>
				</div>
				<div class="actions">
					<label class="btn btn-primary${isDemoEvent ? ' is-disabled' : ''}" ${isDemoEvent ? 'aria-disabled="true"' : ''}>
						<input type="file" id="documentUploadInput" ${isDemoEvent ? 'disabled' : ''} hidden>
						Ladda upp fil
					</label>
				</div>
			</div>

			<div class="section-block">
				<h4>Filer för eventet</h4>
				<p>Alla som har tillgång till vyn kan öppna och ta bort filer här.</p>
				<div class="documents-list">
					${documents.length > 0 ? documents.map((document, index) => `
						<div class="document-row">
							<div class="document-main">
								<div class="document-name">${escapeHtml(document.name || 'Fil')}</div>
								<div class="document-meta">${escapeHtml(formatFileSize(document.size))} • ${escapeHtml(formatDocumentDate(document.uploadedAt))}</div>
							</div>
							<div class="document-actions">
								${document.downloadUrl ? `<a class="btn btn-secondary" href="${escapeHtml(document.downloadUrl)}" target="_blank" rel="noreferrer">Öppna</a>` : ''}
								<button class="btn btn-accent remove-document" type="button" data-index="${index}" ${isDemoEvent ? 'disabled' : ''}>Ta bort</button>
							</div>
						</div>
					`).join('') : `<div class="empty-note">Inga dokument uppladdade ännu.</div>`}
				</div>
			</div>
		`;

		const uploadInput = document.getElementById('documentUploadInput');
		uploadInput?.addEventListener('change', async (e) => {
			const file = e.target.files?.[0];
			if (!file) {
				return;
			}

			try {
				const document = await uploadDocument(event, file);
				event.documents = [...documents, document];
				renderDocuments();
			} catch (error) {
				window.alert('Kunde inte ladda upp filen. Försök igen.');
				e.target.value = '';
			}
		});

		dynamicContent.querySelectorAll('.remove-document').forEach((button) => {
			button.addEventListener('click', async (e) => {
				const index = Number(e.currentTarget.dataset.index);
				const document = documents[index];
				if (!document) {
					return;
				}

				try {
					await deleteDocument(event, document);
					event.documents = documents.filter((_, currentIndex) => currentIndex !== index);
					renderDocuments();
				} catch (error) {
					window.alert('Kunde inte ta bort filen. Försök igen.');
				}
			});
		});
	}

	function renderActiveTab() {
		const tabList = root.querySelector('[role="tablist"]');
		tabs.forEach((tab) => {
			const isActive = tab.dataset.tab === state.activeTab;
			tab.classList.toggle('active', isActive);
			tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
			if (isActive && tabList) {
				tabList.setAttribute('aria-activedescendant', tab.id || '');
			}
		});

		if (!getActiveEvent() && dynamicContent) {
			dynamicContent.innerHTML = `
				<div class="section-block">
					<h4>Inga event att visa</h4>
					<p>${state.bookedOnly ? 'Du är inte bokad på några event i listan just nu.' : 'Välj ett event i listan till vänster.'}</p>
				</div>
			`;
			return;
		}

		if (viewMode === 'eventpersonal') {
			if (state.activeTab === 'overview') {
				renderOverviewSummary();
			}
			if (state.activeTab === 'staff') {
				renderStaffSummary();
			}
			if (state.activeTab === 'material') {
				renderMaterialSummary();
			}
			if (state.activeTab === 'marketing') {
				renderMarketingSummary();
			}
			if (state.activeTab === 'budget') {
				renderBudgetSummary();
			}
			if (state.activeTab === 'documents') {
				renderDocuments();
			}
			return;
		}

		if (state.activeTab === 'overview') {
			renderOverview();
		}
		if (state.activeTab === 'staff') {
			renderStaff();
		}
		if (state.activeTab === 'material') {
			renderMaterial();
		}
		if (state.activeTab === 'marketing') {
			renderMarketing();
		}
		if (state.activeTab === 'budget') {
			renderBudget();
		}
		if (state.activeTab === 'documents') {
			renderDocuments();
		}
	}

	function renderSidebar() {
		const visibleEventIds = new Set(getVisibleEvents().map((event) => String(event.id)));
		if (state.activeEventId !== null && !visibleEventIds.has(String(state.activeEventId))) {
			const firstVisibleEvent = getVisibleEvents()[0];
			state.activeEventId = firstVisibleEvent ? firstVisibleEvent.id : null;
		}

		eventButtons.forEach((button) => {
			const accent = getEventAccent(button.dataset.eventId || 0);
			button.style.setProperty('--event-card-bg', accent.card);
			button.style.setProperty('--event-card-border', accent.border);
			button.style.setProperty('--event-date-bg', accent.date);
			button.style.setProperty('--event-month-color', accent.month);
			const isVisible = visibleEventIds.has(button.dataset.eventId || '');
			button.hidden = !isVisible;
			button.classList.toggle('is-filtered-out', !isVisible);
			button.style.display = isVisible ? '' : 'none';
			button.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
			button.classList.toggle('active', button.dataset.eventId === String(state.activeEventId));
		});
	}

	function render() {
		applyActiveEventAccent();
		renderSidebar();
		renderHeader();
		renderChat();
		renderActiveTab();
	}

	async function pollLiveState() {
		if (viewMode !== 'eventpersonal' || !stateUrl) {
			return;
		}

		// Skip polling merge when user has unsaved local edits to avoid overwriting them.
		if (state.dirty) {
			return;
		}

		try {
			const response = await fetch(stateUrl, {
				method: 'GET',
				credentials: 'same-origin',
				headers: {
					Accept: 'application/json',
				},
			});
			if (!response.ok) {
				return;
			}

			const payload = await response.json();
			const remoteEvents = Array.isArray(payload.events) ? payload.events : [];
			const nextEvents = {};
			remoteEvents.forEach((event) => {
				nextEvents[String(event.id)] = mergeRemoteEvent(state.events[String(event.id)], event);
			});
			state.events = nextEvents;
			if (payload.currentUser && typeof payload.currentUser.id === 'string') {
				state.currentUser = payload.currentUser;
			}
			render();
		} catch (error) {
			// Ignore transient polling errors and retry on the next interval.
		}
	}

	tabs.forEach((tab) => {
		tab.addEventListener('click', async () => {
			if (tab.dataset.tab === state.activeTab) {
				return;
			}
			const dirtyResult = await blockIfDirty();
			if (dirtyResult !== 'continue') {
				return;
			}
			state.activeTab = tab.dataset.tab || 'overview';
			renderActiveTab();
		});
	});

	// Keyboard navigation for tabs (ArrowLeft / ArrowRight)
	const tabList = root.querySelector('[role="tablist"]');
	if (tabList) {
		tabList.addEventListener('keydown', (e) => {
			const tabArray = Array.from(tabs);
			const currentIndex = tabArray.indexOf(e.target);
			if (currentIndex === -1) {
				return;
			}
			let newIndex = -1;
			if (e.key === 'ArrowRight') {
				newIndex = (currentIndex + 1) % tabArray.length;
			} else if (e.key === 'ArrowLeft') {
				newIndex = (currentIndex - 1 + tabArray.length) % tabArray.length;
			} else if (e.key === 'Home') {
				newIndex = 0;
			} else if (e.key === 'End') {
				newIndex = tabArray.length - 1;
			}
			if (newIndex >= 0) {
				e.preventDefault();
				tabArray[newIndex].focus();
			}
		});
	}

	eventButtons.forEach((button) => {
		button.addEventListener('click', async () => {
			if (button.dataset.eventId === String(state.activeEventId)) {
				return;
			}
			const dirtyResult = await blockIfDirty();
			if (dirtyResult !== 'continue') {
				return;
			}
			state.activeEventId = Number(button.dataset.eventId);
			render();
		});
	});

	bookedOnlyToggle?.addEventListener('change', (e) => {
		state.bookedOnly = e.target.checked;
		render();
	});

	async function persistChat(event) {
		if (event.isDemo === true || !event.saveChatUrl) {
			throw new Error('chat-save-disabled');
		}

		const body = new URLSearchParams({
			requesttoken,
			chat_json: JSON.stringify(event.chat),
		});

		const response = await fetch(event.saveChatUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
			},
			body: body.toString(),
			credentials: 'same-origin',
		});

		if (!response.ok) {
			throw new Error('chat-save-failed');
		}
	}

	async function sendMessage() {
		const event = getActiveEvent();
		const text = chatInput?.value.trim();
		if (!event || !text) {
			return;
		}
		if (event.isDemo === true) {
			window.alert('Chatten är låst i demoeventet.');
			return;
		}
		if (state.chatSending) {
			return; // Prevent double-send.
		}

		const message = {
			type: 'message',
			text,
			senderLabel: state.currentUser?.label || 'Användare',
			senderUserId: state.currentUser?.id || '',
			createdAt: new Date().toISOString(),
		};
		const previousChat = Array.isArray(event.chat) ? [...event.chat] : [];
		event.chat = [...previousChat, message];
		renderChat();
		chatInput.value = '';
		chatInput.focus();
		state.chatSending = true;
		if (sendBtn) {
			sendBtn.disabled = true;
		}
		if (chatInput) {
			chatInput.disabled = true;
		}

		try {
			await persistChat(event);
		} catch (error) {
			event.chat = previousChat;
			renderChat();
			// Restore the failed message text so the user can retry without retyping.
			if (chatInput) {
				chatInput.value = text;
			}
			// Show inline error in chat instead of alert.
			let errorNotice = chatBox.querySelector('.chat-send-error');
			if (!errorNotice) {
				errorNotice = document.createElement('div');
				errorNotice.className = 'msg system chat-send-error';
				errorNotice.setAttribute('role', 'alert');
				chatBox.appendChild(errorNotice);
			}
			errorNotice.textContent = 'Kunde inte spara meddelandet. Försök igen.';
			chatBox.scrollTop = chatBox.scrollHeight;
		} finally {
			state.chatSending = false;
			if (sendBtn) {
				sendBtn.disabled = false;
			}
			if (chatInput) {
				chatInput.disabled = false;
			}
			// Auto-remove error notice after a delay.
			window.setTimeout(() => {
				const errEl = chatBox.querySelector('.chat-send-error');
				if (errEl) {
					errEl.remove();
				}
			}, 5000);
		}
	}

	function openPrintSummary() {
		const event = getActiveEvent();
		if (!event) {
			return;
		}

		if (!printFrame) {
			printFrame = document.createElement('iframe');
			printFrame.setAttribute('aria-hidden', 'true');
			printFrame.tabIndex = -1;
			printFrame.style.position = 'fixed';
			printFrame.style.right = '0';
			printFrame.style.bottom = '0';
			printFrame.style.width = '0';
			printFrame.style.height = '0';
			printFrame.style.border = '0';
			printFrame.style.opacity = '0';
			printFrame.style.pointerEvents = 'none';
			document.body.appendChild(printFrame);
		}

		const printDocument = printFrame.contentWindow?.document;
		const printWindow = printFrame.contentWindow;
		if (!printDocument || !printWindow) {
			window.alert('Kunde inte skapa utskriftsvyn. Försök igen.');
			return;
		}

		printDocument.open();
		printDocument.write(buildPrintableSummary(event));
		printDocument.close();

		window.setTimeout(() => {
			printWindow.focus();
			printWindow.print();
		}, 150);
	}

	sendBtn?.addEventListener('click', sendMessage);
	printSummaryBtn?.addEventListener('click', openPrintSummary);
	unsavedStayBtn?.addEventListener('click', () => closeUnsavedModal('stay'));
	unsavedDiscardBtn?.addEventListener('click', () => {
		discardCurrentChanges();
		closeUnsavedModal('continue');
	});
	unsavedSaveBtn?.addEventListener('click', async () => {
		if (!unsavedSaveBtn) {
			return;
		}

		unsavedSaveBtn.disabled = true;
		unsavedSaveBtn.textContent = 'Sparar...';
		try {
			const saved = await saveCurrentChanges();
			if (saved) {
				closeUnsavedModal('continue');
				return;
			}
			unsavedSaveBtn.disabled = false;
			unsavedSaveBtn.textContent = 'Spara ändringar';
		} catch (error) {
			if (unsavedModalMessage) {
				unsavedModalMessage.textContent = 'Kunde inte spara ändringarna. Försök igen eller välj "Spara inte ändringar".';
			}
			unsavedSaveBtn.disabled = false;
			unsavedSaveBtn.textContent = 'Spara ändringar';
		}
	});
	chatInput?.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			sendMessage();
		}
	});

	window.addEventListener('beforeunload', (event) => {
		if (!state.dirty) {
			return;
		}

		event.preventDefault();
		event.returnValue = '';
	});

	render();
	if (viewMode === 'eventpersonal' && stateUrl) {
		window.setInterval(pollLiveState, 10000);
	}
})();
