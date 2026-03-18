<?php

declare(strict_types=1);

namespace OCA\BookedEventsWidget\Controller;

use OCA\BookedEventsWidget\AppInfo\Application;
use OCA\BookedEventsWidget\Service\EventService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCP\IURLGenerator;

class PageController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private EventService $eventService,
		private IURLGenerator $urlGenerator,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		\OCP\Util::addStyle(Application::APP_ID, 'manage');

		$events = array_map(function (array $event): array {
			$event['updateUrl'] = $this->urlGenerator->linkToRoute(
				'booked_events_widget.page.update',
				['id' => (int)$event['id']],
			);
			$event['deleteUrl'] = $this->urlGenerator->linkToRoute(
				'booked_events_widget.page.delete',
				['id' => (int)$event['id']],
			);

			return $event;
		}, $this->eventService->getEventsWithIds());

		return new TemplateResponse(Application::APP_ID, 'manage', [
			'events' => $events,
			'createUrl' => $this->urlGenerator->linkToRoute('booked_events_widget.page.create'),
		]);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function create(string $title, string $date, string $location, string $description = '', string $link = '', int $sort_order = 0): RedirectResponse {
		$this->eventService->createEvent(
			trim($title),
			$date,
			trim($location),
			trim($description),
			trim($link),
			$sort_order,
		);

		return $this->redirectToIndex();
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function update(int $id, string $title, string $date, string $location, string $description = '', string $link = '', int $sort_order = 0): RedirectResponse {
		$this->eventService->updateEvent(
			$id,
			trim($title),
			$date,
			trim($location),
			trim($description),
			trim($link),
			$sort_order,
		);

		return $this->redirectToIndex();
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function delete(int $id): RedirectResponse {
		$this->eventService->deleteEvent($id);

		return $this->redirectToIndex();
	}

	private function redirectToIndex(): RedirectResponse {
		return new RedirectResponse(
			$this->urlGenerator->linkToRoute('booked_events_widget.page.index'),
		);
	}
}
