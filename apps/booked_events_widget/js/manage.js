(function () {
	const root = document.querySelector('.bew-manage');
	const stateNode = document.getElementById('bew-state');
	if (!root || !stateNode) {
		return;
	}

	const parsed = JSON.parse(stateNode.textContent || '{"events": []}');
	const events = Array.isArray(parsed.events) ? parsed.events : [];

	const state = {
		activeTab: 'overview',
		activeEventId: events[0]?.id ?? null,
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
	const requesttoken = root.dataset.requesttoken || '';

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
			.map((msg) => `<div class="msg ${escapeHtml(msg.type)}">${escapeHtml(msg.text)}</div>`)
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

		bind('overview-title', 'title', true);
		bind('overview-date', 'date', true);
		bind('overview-location', 'location', true);
		bind('overview-link', 'link', false);
		bind('overview-description', 'description', false);
	}

	function renderOverview() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

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
					<p>Titel, datum, plats och sortering visas här som redigerbara fält.</p>

					<div class="form-grid">
						<div class="field full">
							<label for="overview-title">Titel</label>
							<input class="input" id="overview-title" type="text" name="title" value="${escapeHtml(event.title)}" required>
						</div>

						<div class="field">
							<label for="overview-date">Datum</label>
							<input class="input" id="overview-date" type="text" name="date" value="${escapeHtml(event.date)}" required>
						</div>
						<input type="hidden" name="sort_order" value="${escapeHtml(event.sortOrder)}">

						<div class="field full">
							<label for="overview-location">Plats</label>
							<input class="input" id="overview-location" type="text" name="location" value="${escapeHtml(event.location)}" required>
						</div>

						<div class="field full">
							<label for="overview-link">Länk</label>
							<input class="input" id="overview-link" type="url" name="link" value="${escapeHtml(event.link)}">
						</div>
					</div>
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

	function renderStaff() {
		const event = getActiveEvent();
		if (!event || !dynamicContent) {
			return;
		}

		dynamicContent.innerHTML = `
			<div class="panel-head">
				<div>
					<h3 class="panel-title">Personal</h3>
					<p class="panel-copy">Redigera roller och ansvar direkt i tabellen. Tabellen kan scrollas horisontellt om den blir bred, men inte vertikalt.</p>
				</div>
				<div class="actions">
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
								<th>Namn</th>
								<th>Roll</th>
								<th>Ansvarsområde</th>
								<th>Ta bort</th>
							</tr>
						</thead>
						<tbody>
							${event.staff.map((person, index) => `
								<tr>
									<td><input class="table-input" data-type="name" data-index="${index}" value="${escapeHtml(person.name)}"></td>
									<td><input class="table-input" data-type="role" data-index="${index}" value="${escapeHtml(person.role)}"></td>
									<td><input class="table-input" data-type="area" data-index="${index}" value="${escapeHtml(person.area)}"></td>
									<td><button class="icon-btn remove-person" type="button" data-index="${index}" aria-label="Ta bort person">×</button></td>
								</tr>
							`).join('')}
						</tbody>
					</table>
				</div>
			</div>
		`;

		dynamicContent.querySelectorAll('.table-input').forEach((input) => {
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
				event.staff.push({ name: '', role: '', area: '' });
				renderStaff();
			});
		}
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
				<p>Markera färdigt material och uppdatera texten efter behov.</p>

				<div class="checklist">
					${event.material.map((item, index) => `
						<div class="check-row ${item.done ? 'done' : ''}">
							<input class="check" type="checkbox" data-index="${index}" ${item.done ? 'checked' : ''} aria-label="Markera som klar">
							<input class="check-text" type="text" data-index="${index}" value="${escapeHtml(item.text)}">
							<button class="icon-btn remove-item" type="button" data-index="${index}" aria-label="Ta bort checklistepunkt">×</button>
						</div>
					`).join('')}
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
				event.material.push({ text: '', done: false });
				renderMaterial();
			});
		}
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

	function renderActiveTab() {
		tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === state.activeTab));

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
		eventButtons.forEach((button) => {
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

	function sendMessage() {
		const event = getActiveEvent();
		const text = chatInput?.value.trim();
		if (!event || !text) {
			return;
		}

		event.chat.push({ type: 'me', text });
		renderChat();
		chatInput.value = '';
		chatInput.focus();
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
