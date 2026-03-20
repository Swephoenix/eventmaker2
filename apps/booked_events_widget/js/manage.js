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
	const bookedOnlyToggle = document.getElementById('bookedOnlyToggle');
	const requesttoken = root.dataset.requesttoken || '';
	const viewMode = root.dataset.viewMode || 'admin';

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

	function isBookedForCurrentUser(event) {
		if (!state.currentUser?.id) {
			return false;
		}

		return Array.isArray(event.staff) && event.staff.some((person) => person.userId === state.currentUser.id);
	}

	function getVisibleEvents() {
		return Object.values(state.events).filter((event) => !state.bookedOnly || isBookedForCurrentUser(event));
	}

	function serializeStaff(staff) {
		return JSON.stringify(staff.map((person) => ({
			userId: String(person.userId || ''),
			firstName: String(person.firstName || ''),
			lastName: String(person.lastName || ''),
			email: String(person.email || ''),
			role: String(person.role || ''),
			area: String(person.area || ''),
		})));
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
		const lockedAttr = isApiEvent ? 'readonly aria-readonly="true"' : '';
		const calendarMarkup = buildCalendarMarkup(event.date);

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Översikt</h3>
					<p class="panel-copy">Här redigerar du grunduppgifter för eventet. Fälten är utformade för snabb överblick och enkel uppdatering.</p>
				</div>
				<div class="actions">
					${event.link ? `<a class="btn btn-secondary" href="${escapeHtml(event.link)}" target="_blank" rel="noreferrer">Förhandsgranska</a>` : `<button class="btn btn-secondary" type="button" disabled>Förhandsgranska</button>`}
					<button class="btn btn-primary" type="submit" form="overviewForm">Spara ändringar</button>
				</div>
			</div>

			<form id="overviewForm" action="${escapeHtml(event.updateUrl)}" method="post">
				<input type="hidden" name="requesttoken" value="${escapeHtml(requesttoken)}">

				<div class="section-block">
					<h4>Grunduppgifter</h4>
					<p>${isApiEvent ? 'Titel, datum, plats och länk är låsta eftersom eventet hämtas via API. Endast intern anteckning kan ändras här.' : 'Titel, datum, plats och sortering visas här som redigerbara fält.'}</p>

					<div class="form-grid">
						<div class="field full">
							<label for="overview-title">Titel</label>
							<input class="input" id="overview-title" type="text" name="title" value="${escapeHtml(event.title)}" ${lockedAttr} required>
						</div>

						<div class="field">
							<label for="overview-date">Datum</label>
							<input class="input" id="overview-date" type="text" name="date" value="${escapeHtml(event.date)}" ${lockedAttr} required>
						</div>
						<input type="hidden" name="sort_order" value="${escapeHtml(event.sortOrder)}">

						<div class="field full">
							<label for="overview-location">Plats</label>
							<input class="input" id="overview-location" type="text" name="location" value="${escapeHtml(event.location)}" ${lockedAttr} required>
						</div>

						<div class="field full">
							<label for="overview-link">Länk</label>
							<input class="input" id="overview-link" type="url" name="link" value="${escapeHtml(event.link)}" ${lockedAttr}>
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
						<textarea class="textarea" id="overview-description" name="description">${escapeHtml(event.description)}</textarea>
					</div>
					<div class="small">Ändringarna sparas när du klickar på Spara ändringar.</div>
				</div>
			</form>

			<div class="section-block">
				<h4>Publicering</h4>
				<p>Ta bort eventet om det inte längre ska visas i dashboard-widgeten.</p>
				<form action="${escapeHtml(event.deleteUrl)}" method="post">
					<input type="hidden" name="requesttoken" value="${escapeHtml(requesttoken)}">
					<button class="btn btn-accent" type="submit">Ta bort event</button>
				</form>
			</div>
		`;

		attachOverviewBindings();
	}

	function renderOverviewSummary() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

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

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Personal</h3>
					<p class="panel-copy">Välj en registrerad Nextcloud-user i dropdownen eller lämna valet tomt för att lägga till en extern person med namn och mejl.</p>
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
								<th>Person</th>
								<th>Roll</th>
								<th>Ansvarsområde</th>
								<th>E-post</th>
								<th>Ta bort</th>
							</tr>
						</thead>
						<tbody>
							${event.staff.map((person, index) => `
								${(() => {
									const selectedUser = person.userId ? getAvailableUser(person.userId) : null;
									const isManual = !person.userId;
									return `
								<tr>
									<td>
										<div class="staff-person-cell">
											<select class="table-select staff-user-select" data-index="${index}">
												<option value="">Ny eller extern person</option>
												${state.availableUsers.map((user) => `
													<option value="${escapeHtml(user.id)}" ${person.userId === user.id ? 'selected' : ''}>${escapeHtml(user.label)}</option>
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
									<td><input class="table-input" data-type="role" data-index="${index}" value="${escapeHtml(person.role)}"></td>
									<td><input class="table-input" data-type="area" data-index="${index}" value="${escapeHtml(person.area)}"></td>
									<td>
										<input class="table-input staff-email-input" data-index="${index}" value="${escapeHtml(isManual ? (person.email || '') : (selectedUser?.email || ''))}" ${isManual ? '' : 'readonly aria-readonly="true"'} placeholder="mejl@example.com">
									</td>
									<td><button class="icon-btn remove-person" type="button" data-index="${index}" aria-label="Ta bort person">×</button></td>
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
				const userId = e.target.value;
				const selectedUser = userId ? getAvailableUser(userId) : null;

				event.staff[index].userId = userId;
				event.staff[index].firstName = selectedUser?.firstName || '';
				event.staff[index].lastName = selectedUser?.lastName || '';
				event.staff[index].email = selectedUser?.email || '';
				renderStaff();
			});
		});

		dynamicContent.querySelectorAll('.staff-manual-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				const field = e.target.dataset.field;
				event.staff[index][field] = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.staff-email-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				if (!event.staff[index].userId) {
					event.staff[index].email = e.target.value;
				}
			});
		});

		dynamicContent.querySelectorAll('.table-input[data-type]').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				const type = e.target.dataset.type;
				event.staff[index][type] = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.remove-person').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				const index = Number(e.currentTarget.dataset.index);
				event.staff.splice(index, 1);
				renderStaff();
			});
		});

		const addBtn = document.getElementById('addPersonBtn');
		if (addBtn) {
			addBtn.addEventListener('click', () => {
				event.staff.push({ userId: '', firstName: '', lastName: '', email: '', role: '', area: '' });
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
					const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || selectedUser?.label || 'Namn saknas';
					const email = person.userId ? (selectedUser?.email || person.email || 'Saknas') : (person.email || 'Saknas');
					return `
						<div class="section-block summary-card">
							<h4>${escapeHtml(fullName)}</h4>
							<div class="summary-list">
								<div><span>Roll</span><strong>${escapeHtml(person.role || 'Saknas')}</strong></div>
								<div><span>Ansvar</span><strong>${escapeHtml(person.area || 'Saknas')}</strong></div>
								<div><span>E-post</span><strong>${escapeHtml(email)}</strong></div>
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
								<select class="check-owner-select" data-index="${index}">
									<option value="">Ny eller extern person</option>
									${state.availableUsers.map((user) => `
										<option value="${escapeHtml(user.id)}" ${item.ownerUserId === user.id ? 'selected' : ''}>${escapeHtml(user.label)}</option>
									`).join('')}
								</select>
								${isManualOwner
									? `<input class="check-owner" type="text" data-index="${index}" value="${escapeHtml(item.ownerName || '')}" placeholder="Ansvarig person">`
									: `<div class="small check-owner-meta">${escapeHtml(ownerUser?.label || '')}</div>`}
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
				event.material[index].done = e.target.checked;
				renderMaterial();
			});
		});

		dynamicContent.querySelectorAll('.check-text').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				event.material[index].text = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.check-owner-select').forEach((select) => {
			select.addEventListener('change', (e) => {
				const index = Number(e.target.dataset.index);
				const userId = e.target.value;
				const ownerUser = userId ? getAvailableUser(userId) : null;
				event.material[index].ownerUserId = userId;
				event.material[index].ownerName = ownerUser?.label || '';
				renderMaterial();
			});
		});

		dynamicContent.querySelectorAll('.check-owner').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				event.material[index].ownerName = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.remove-item').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				const index = Number(e.currentTarget.dataset.index);
				event.material.splice(index, 1);
				renderMaterial();
			});
		});

		const addBtn = document.getElementById('addChecklistBtn');
		if (addBtn) {
			addBtn.addEventListener('click', () => {
				event.material.push({ text: '', done: false, ownerUserId: '', ownerName: '' });
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
		`;

		dynamicContent.querySelectorAll('.marketing-input').forEach((input) => {
			input.addEventListener('input', (e) => {
				const index = Number(e.target.dataset.index);
				const type = e.target.dataset.type;
				event.marketing[index][type] = e.target.value;
			});
		});

		dynamicContent.querySelectorAll('.remove-marketing').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				const index = Number(e.currentTarget.dataset.index);
				event.marketing.splice(index, 1);
				renderMarketing();
			});
		});

		const addBtn = document.getElementById('addMarketingBtn');
		if (addBtn) {
			addBtn.addEventListener('click', () => {
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
	}

	function renderSidebar() {
		const visibleEventIds = new Set(getVisibleEvents().map((event) => String(event.id)));
		if (state.activeEventId !== null && !visibleEventIds.has(String(state.activeEventId))) {
			const firstVisibleEvent = getVisibleEvents()[0];
			state.activeEventId = firstVisibleEvent ? firstVisibleEvent.id : null;
		}

		eventButtons.forEach((button) => {
			button.hidden = !visibleEventIds.has(button.dataset.eventId || '');
			button.classList.toggle('active', button.dataset.eventId === String(state.activeEventId));
		});
	}

	function render() {
		renderSidebar();
		renderHeader();
		renderChat();
		renderActiveTab();
	}

	tabs.forEach((tab) => {
		tab.addEventListener('click', () => {
			state.activeTab = tab.dataset.tab || 'overview';
			renderActiveTab();
		});
	});

	eventButtons.forEach((button) => {
		button.addEventListener('click', () => {
			state.activeEventId = Number(button.dataset.eventId);
			render();
		});
	});

	bookedOnlyToggle?.addEventListener('change', (e) => {
		state.bookedOnly = e.target.checked;
		render();
	});

	async function persistChat(event) {
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

	sendBtn?.addEventListener('click', sendMessage);
	chatInput?.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			sendMessage();
		}
	});

	render();
})();
