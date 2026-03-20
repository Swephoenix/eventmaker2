<?php

declare(strict_types=1);

namespace OCA\BookedEventsWidget\Dashboard;

use OCA\BookedEventsWidget\AppInfo\Application;
use OCA\BookedEventsWidget\Service\EventService;
use OCP\Dashboard\IWidget;
use OCP\IInitialStateService;
use OCP\IL10N;

class BookedEventsWidget implements IWidget {
	public function __construct(
		private IInitialStateService $initialStateService,
		private IL10N $l10n,
		private EventService $eventService,
	) {
	}

	public function getId(): string {
		return 'booked_events_widget-events';
	}

	public function getTitle(): string {
		return $this->l10n->t('Booked events');
	}

	public function getOrder(): int {
		return 30;
	}

	public function getIconClass(): string {
		return '';
	}

	public function getUrl(): ?string {
		return null;
	}

	public function load(): void {
		$this->initialStateService->provideInitialState(
			Application::APP_ID,
			'events',
			$this->eventService->getEvents(),
		);
		$this->initialStateService->provideInitialState(
			Application::APP_ID,
			'manageUrl',
			\OC::$server->getURLGenerator()->linkToRoute('booked_events_widget.page.index'),
		);
		$this->initialStateService->provideInitialState(
			Application::APP_ID,
			'personnelUrl',
			\OC::$server->getURLGenerator()->linkToRoute('booked_events_widget.page.index') . '?mode=eventpersonal',
		);

		\OCP\Util::addScript(Application::APP_ID, 'dashboard');
		\OCP\Util::addStyle(Application::APP_ID, 'dashboard');
	}
}
