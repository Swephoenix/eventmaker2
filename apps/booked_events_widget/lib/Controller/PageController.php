<?php

declare(strict_types=1);

namespace OCA\BookedEventsWidget\Controller;

use OCA\BookedEventsWidget\AppInfo\Application;
use OCA\BookedEventsWidget\Service\EventService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;

class PageController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private EventService $eventService,
		private IURLGenerator $urlGenerator,
		private IUserManager $userManager,
		private IUserSession $userSession,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		$viewMode = (string)$this->request->getParam('mode', 'admin');
		if ($viewMode !== 'eventpersonal') {
			$viewMode = 'admin';
		}

		\OCP\Util::addStyle(Application::APP_ID, 'manage');
		\OCP\Util::addScript(Application::APP_ID, 'manage');

		$events = $this->buildClientEvents();

		$response = new TemplateResponse(Application::APP_ID, 'manage', [
			'events' => $events,
			'createUrl' => $this->urlGenerator->linkToRoute('booked_events_widget.page.create'),
			'stateUrl' => $this->urlGenerator->linkToRoute('booked_events_widget.page.state'),
			'users' => $this->getAvailableUsers(),
			'currentUser' => $this->getCurrentUser(),
			'viewMode' => $viewMode,
		]);

		$policy = new ContentSecurityPolicy();
		$policy->addAllowedFrameDomain('https://sverigekarta-ambswe.onrender.com');
		$response->setContentSecurityPolicy($policy);

		return $response;
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function state(): JSONResponse {
		return new JSONResponse([
			'events' => $this->buildClientEvents(),
			'currentUser' => $this->getCurrentUser(),
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
	public function saveStaff(int $id, string $staff_json = '[]'): RedirectResponse {
		$staff = json_decode($staff_json, true);
		if (!is_array($staff)) {
			$staff = [];
		}

		$this->eventService->saveStaff(
			$id,
			array_values(array_filter($staff, static fn ($row): bool => is_array($row))),
		);

		return $this->redirectToIndex();
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function saveChat(int $id, string $chat_json = '[]'): RedirectResponse {
		$chat = json_decode($chat_json, true);
		if (!is_array($chat)) {
			$chat = [];
		}

		$this->eventService->saveChat(
			$id,
			array_values(array_filter($chat, static fn ($row): bool => is_array($row))),
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

	/**
	 * @return list<array<string, mixed>>
	 */
	private function buildClientEvents(): array {
		return array_map(function (array $event): array {
			$event['updateUrl'] = $this->urlGenerator->linkToRoute(
				'booked_events_widget.page.update',
				['id' => (int)$event['id']],
			);
			$event['saveStaffUrl'] = $this->urlGenerator->linkToRoute(
				'booked_events_widget.page.saveStaff',
				['id' => (int)$event['id']],
			);
			$event['saveChatUrl'] = $this->urlGenerator->linkToRoute(
				'booked_events_widget.page.saveChat',
				['id' => (int)$event['id']],
			);
			$event['deleteUrl'] = $this->urlGenerator->linkToRoute(
				'booked_events_widget.page.delete',
				['id' => (int)$event['id']],
			);

			return $event;
		}, $this->eventService->getEventsWithIds());
	}

	/**
	 * @return list<array{id: string, label: string, email: string, firstName: string, lastName: string}>
	 */
	private function getAvailableUsers(): array {
		$users = array_map(function (IUser $user): array {
			$displayName = trim($user->getDisplayName() ?? '');
			$userId = $user->getUID();
			$email = trim((string)$user->getEMailAddress());
			$nameParts = preg_split('/\s+/', $displayName, 2) ?: [];
			$firstName = trim((string)($nameParts[0] ?? $displayName));
			$lastName = trim((string)($nameParts[1] ?? ''));

			return [
				'id' => $userId,
				'label' => $displayName !== '' ? $displayName : $userId,
				'email' => $email,
				'firstName' => $firstName,
				'lastName' => $lastName,
			];
		}, $this->userManager->search(''));

		usort($users, static fn (array $left, array $right): int => strcasecmp($left['label'], $right['label']));

		return $users;
	}

	/**
	 * @return array{id: string, label: string, email: string}|null
	 */
	private function getCurrentUser(): ?array {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return null;
		}

		$displayName = trim($user->getDisplayName() ?? '');

		return [
			'id' => $user->getUID(),
			'label' => $displayName !== '' ? $displayName : $user->getUID(),
			'email' => trim((string)$user->getEMailAddress()),
		];
	}
}
