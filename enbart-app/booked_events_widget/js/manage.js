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
		currentUser,
		events: Object.fromEntries(events.map((event) => [String(event.id), event])),
		dirty: false,
		dirtyEventId: null,
		dirtyTab: '',
		dirtySnapshot: null,
		submitting: false,
		pendingNavigation: null,
	};

	const dynamicContent = document.getElementById('dynamicContent');
	const tabs = Array.from(root.querySelectorAll('.tab-btn'));
	const eventButtons = Array.from(root.querySelectorAll('.event-card'));
	const mainTitle = document.getElementById('mainTitle');
	const mainDateBadge = document.getElementById('mainDateBadge');
	const mainLocationBadge = document.getElementById('mainLocationBadge');
	const chatInput = document.getElementById('chatInput');
	const chatBox = document.getElementById('chatBox');
	const sendBtn = document.getElementById('sendBtn');
	const printSummaryBtn = document.getElementById('printSummaryBtn');
	const discardChangesBtn = document.getElementById('discardChangesBtn');
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

	function updateDirtyUi() {
		if (discardChangesBtn) {
			discardChangesBtn.hidden = !state.dirty || viewMode === 'eventpersonal';
		}
	}

	function resetDirtyState() {
		state.dirty = false;
		state.dirtyEventId = null;
		state.dirtyTab = '';
		state.dirtySnapshot = null;
		updateDirtyUi();
	}

	function markDirty() {
		if (viewMode === 'eventpersonal') {
			return;
		}

		const event = getActiveEvent();
		if (!event) {
			return;
		}

		if (!state.dirty) {
			state.dirty = true;
			state.dirtyEventId = event.id;
			state.dirtyTab = state.activeTab;
			state.dirtySnapshot = cloneEvent(event);
		}

		updateDirtyUi();
	}

	function discardCurrentChanges() {
		if (!state.dirty || state.dirtyEventId === null || !state.dirtySnapshot) {
			return;
		}

		state.events[String(state.dirtyEventId)] = cloneEvent(state.dirtySnapshot);
		resetDirtyState();
		render();
	}

	function blockIfDirty() {
		if (!state.dirty) {
			return Promise.resolve('continue');
		}

		return new Promise((resolve) => {
			state.pendingNavigation = resolve;
			if (unsavedModalMessage) {
				unsavedModalMessage.textContent = 'Du har osparade ändringar i den här vyn. Vill du spara dem innan du fortsätter?';
			}
			if (unsavedSaveBtn) {
				unsavedSaveBtn.disabled = false;
				unsavedSaveBtn.textContent = 'Spara ändringar';
			}
			if (unsavedModal) {
				unsavedModal.hidden = false;
			}
		});
	}

	function closeUnsavedModal(result) {
		if (unsavedModal) {
			unsavedModal.hidden = true;
		}
		const resolver = state.pendingNavigation;
		state.pendingNavigation = null;
		if (resolver) {
			resolver(result);
		}
	}

	async function persistOverview(event) {
		const body = new URLSearchParams({
			requesttoken,
			title: String(event.title || ''),
			date: String(event.date || ''),
			location: String(event.location || ''),
			description: String(event.description || ''),
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

	async function saveCurrentChanges() {
		const event = getActiveEvent();
		if (!event) {
			return false;
		}

		if (state.activeTab === 'overview') {
			await persistOverview(event);
			resetDirtyState();
			return true;
		}

		if (state.activeTab === 'staff') {
			await persistStaff(event);
			resetDirtyState();
			return true;
		}

		if (unsavedModalMessage) {
			unsavedModalMessage.textContent = 'Den här vyn har ännu ingen separat sparknapp. Välj "Spara inte ändringar" för att fortsätta.';
		}
		return false;
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
			material: Array.isArray(localEvent?.material) ? localEvent.material : Array.isArray(remoteEvent.material) ? remoteEvent.material : [],
			marketing: Array.isArray(localEvent?.marketing) ? localEvent.marketing : Array.isArray(remoteEvent.marketing) ? remoteEvent.marketing : [],
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
			<p class="print-copy">${escapeHtml(event.description || 'Ingen intern anteckning tillagd ännu.')}</p>
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
			return;
		}

		mainTitle.textContent = event.title;
		mainDateBadge.textContent = event.date;
		mainLocationBadge.textContent = event.location;
	}

	function renderChat() {
		const event = getActiveEvent();
		if (!event || !chatBox) {
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
							<input class="input" id="overview-title" type="text" name="title" value="${escapeHtml(event.title)}" ${isDemoEvent ? 'readonly aria-readonly="true"' : lockedAttr} required>
						</div>

						<div class="field">
							<label for="overview-date">Datum</label>
							<input class="input" id="overview-date" type="text" name="date" value="${escapeHtml(event.date)}" ${isDemoEvent ? 'readonly aria-readonly="true"' : lockedAttr} required>
						</div>
						<input type="hidden" name="sort_order" value="${escapeHtml(event.sortOrder)}">

						<div class="field full">
							<label for="overview-location">Plats</label>
							<input class="input" id="overview-location" type="text" name="location" value="${escapeHtml(event.location)}" ${isDemoEvent ? 'readonly aria-readonly="true"' : lockedAttr} required>
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
					<h4>Intern anteckning</h4>
					<p>Popuptexten används som fördjupning i widgeten när användaren öppnar eventet.</p>
					<div class="field">
						<label for="overview-description">Popuptext</label>
						<textarea class="textarea" id="overview-description" name="description" ${isDemoEvent ? 'readonly aria-readonly="true"' : ''}>${escapeHtml(event.description)}</textarea>
					</div>
					<div class="small">${isDemoEvent ? 'Demoeventet kan inte sparas.' : 'Ändringarna sparas när du klickar på Spara ändringar.'}</div>
				</div>
			</form>

			<div class="section-block">
				<h4>Publicering</h4>
				<p>Ta bort eventet om det inte längre ska visas i dashboard-widgeten.</p>
				<form action="${escapeHtml(event.deleteUrl || '#')}" method="post">
					<input type="hidden" name="requesttoken" value="${escapeHtml(requesttoken)}">
					<button class="btn btn-accent" type="submit" ${isDemoEvent ? 'disabled' : ''}>${isDemoEvent ? 'Demoevent kan inte tas bort' : 'Ta bort event'}</button>
				</form>
			</div>
		`;

		const overviewForm = document.getElementById('overviewForm');
		if (overviewForm) {
			overviewForm.addEventListener('submit', () => {
				state.submitting = true;
				resetDirtyState();
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
				<h4>Intern anteckning</h4>
				<p>${escapeHtml(event.description || 'Ingen anteckning tillagd ännu.')}</p>
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

		dynamicContent.querySelectorAll('.staff-user-select').forEach((select) => {
			select.addEventListener('change', (e) => {
				const index = Number(e.target.dataset.index);
				const selectedValue = e.target.value;
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
				renderStaff();
			});
		});

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
				saveBtn.disabled = true;
				saveBtn.textContent = 'Sparar...';

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
					saveBtn.textContent = 'Kunde inte spara';
				} finally {
					window.setTimeout(() => {
						saveBtn.disabled = false;
						saveBtn.textContent = 'Spara personal';
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
			${getDemoOverlayMarkup(event)}
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
		tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === state.activeTab));

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
			chat_json: JSON.stringify(event.chat),
		});

		const response = await fetch(event.saveChatUrl, {
			method: 'POST',
			headers: {
				requesttoken,
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

		try {
			await persistChat(event);
		} catch (error) {
			event.chat = previousChat;
			renderChat();
			window.alert('Kunde inte spara chatmeddelandet. Försök igen.');
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
	discardChangesBtn?.addEventListener('click', discardCurrentChanges);
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
		if (!state.dirty || state.submitting) {
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
