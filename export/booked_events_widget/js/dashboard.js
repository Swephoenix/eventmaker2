(function() {
	const appId = 'booked_events_widget'
	const widgetId = 'booked_events_widget-events'

	const events = OCP.InitialState.loadState(appId, 'events', [])
	const manageUrl = OCP.InitialState.loadState(appId, 'manageUrl', '/apps/booked_events_widget/')

	const renderEvent = (event) => `
		<li class="bew-event">
			<div class="bew-event__date">${event.date}</div>
			<div class="bew-event__content">
				<div class="bew-event__title">${event.title}</div>
				<div class="bew-event__meta">${event.location}</div>
			</div>
			<div class="bew-event__status">${event.status}</div>
		</li>
	`

	const registerWidget = () => {
		OCA.Dashboard.register(widgetId, (el) => {
			el.style.height = '100%'
			el.style.display = 'flex'
			el.style.flexDirection = 'column'
			el.style.overflow = 'hidden'

			const summary = `${events.length} bokade event`
			const markup = events.length === 0
				? '<div class="bew-empty">Inga bokade event.</div>'
				: `<ul class="bew-list">${events.map(renderEvent).join('')}</ul>`

			el.innerHTML = `
				<div class="bew-widget">
					<div class="bew-widget__header">
						<div>
							<div class="bew-widget__eyebrow">Eventplanering</div>
							<div class="bew-widget__intro">Kommande bokningar for demoorganisationen.</div>
						</div>
						<div class="bew-widget__count">${summary}</div>
					</div>
					<div class="bew-widget__toolbar">
						<a class="bew-widget__link" href="${manageUrl}">Hantera event</a>
					</div>
					${markup}
				</div>
			`
		})
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', registerWidget)
		return
	}

	registerWidget()
})()
