(function() {
	const appId = 'booked_events_widget'
	const widgetId = 'booked_events_widget-events'

	const events = OCP.InitialState.loadState(appId, 'events', [])
	const manageUrl = OCP.InitialState.loadState(appId, 'manageUrl', '/apps/booked_events_widget/')
	const personnelUrl = OCP.InitialState.loadState(appId, 'personnelUrl', `${manageUrl}?mode=eventpersonal`)
	const upcomingEvents = events.filter((event) => !event.isPast)

	const escapeHtml = (value) => String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')

	const renderEvent = (event, index) => `
		<li>
			<button class="bew-event" type="button" data-event-index="${index}">
				<div class="bew-event__date">${escapeHtml(event.date)}</div>
				<div class="bew-event__content">
					<div class="bew-event__title">${escapeHtml(event.title)}</div>
					<div class="bew-event__meta">${escapeHtml(event.location)}</div>
				</div>
			</button>
		</li>
	`

	const renderDialog = () => `
		<div class="bew-dialog" hidden>
			<div class="bew-dialog__backdrop" data-dialog-close="true"></div>
			<div class="bew-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="bew-dialog-title">
				<button class="bew-dialog__close" type="button" aria-label="Stäng" data-dialog-close="true">×</button>
				<div class="bew-dialog__eyebrow">Eventdetaljer</div>
				<h3 class="bew-dialog__title" id="bew-dialog-title"></h3>
				<div class="bew-dialog__meta"></div>
				<p class="bew-dialog__text"></p>
				<a class="bew-dialog__link" href="#" target="_blank" rel="noreferrer noopener" hidden>Läs mer</a>
			</div>
		</div>
	`

	const renderToolbar = () => `
		<div class="bew-widget__actions">
			<a class="bew-widget__link" href="${escapeHtml(manageUrl)}">För eventplanerare</a>
			<a class="bew-widget__secondary-link" href="${escapeHtml(personnelUrl)}">För eventpersonal</a>
		</div>
	`

	const openDialog = (container, event) => {
		const dialog = container.querySelector('.bew-dialog')
		if (!dialog) {
			return
		}

		dialog.querySelector('.bew-dialog__title').textContent = event.title || 'Event'
		dialog.querySelector('.bew-dialog__meta').textContent = [event.date, event.location].filter(Boolean).join(' • ')
		
		// Show internal_notes if available, otherwise fall back to description
		const displayText = event.internal_notes || event.description || 'Mer information kommer senare.'
		dialog.querySelector('.bew-dialog__text').textContent = displayText

		const link = dialog.querySelector('.bew-dialog__link')
		if (event.link) {
			link.href = event.link
			link.hidden = false
		} else {
			link.hidden = true
			link.removeAttribute('href')
		}

		dialog.hidden = false
		container.classList.add('bew-widget--dialog-open')
	}

	const closeDialog = (container) => {
		const dialog = container.querySelector('.bew-dialog')
		if (!dialog) {
			return
		}

		dialog.hidden = true
		container.classList.remove('bew-widget--dialog-open')
	}

	const registerWidget = () => {
		OCA.Dashboard.register(widgetId, (el) => {
			el.style.height = '100%'
			el.style.display = 'flex'
			el.style.flexDirection = 'column'
			el.style.overflow = 'hidden'
			const renderWidget = () => {
				const visibleEvents = upcomingEvents
				const markup = visibleEvents.length === 0
					? `<div class="bew-empty">Inga aktuella eller kommande event tillgängliga just nu.</div>`
					: `<ul class="bew-list">${visibleEvents.map((event, index) => renderEvent(event, index)).join('')}</ul>`

				el.innerHTML = `
					<div class="bew-widget">
						${markup}
						<div class="bew-widget__footer">
							${renderToolbar()}
						</div>
						${renderDialog()}
					</div>
				`

				el.querySelectorAll('[data-event-index]').forEach((button) => {
					button.addEventListener('click', () => {
						const index = Number(button.getAttribute('data-event-index'))
						if (!Number.isNaN(index) && visibleEvents[index]) {
							openDialog(el, visibleEvents[index])
						}
					})
				})

				el.querySelectorAll('[data-dialog-close]').forEach((closeButton) => {
					closeButton.addEventListener('click', () => closeDialog(el))
				})
			}

			renderWidget()
		})
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', registerWidget)
		return
	}

	registerWidget()
})()
