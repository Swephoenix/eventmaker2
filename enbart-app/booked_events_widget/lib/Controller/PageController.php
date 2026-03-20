<?php

declare(strict_types=1);

namespace OCA\BookedEventsWidget\Controller;

use OCA\BookedEventsWidget\AppInfo\Application;
use OCA\BookedEventsWidget\Service\EventService;
use OCP\Accounts\IAccountManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\DataDisplayResponse;
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
use Throwable;

class PageController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private EventService $eventService,
		private IURLGenerator $urlGenerator,
		private IUserManager $userManager,
		private IUserSession $userSession,
		private IAccountManager $accountManager,
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
	public function uploadDocument(int $id): JSONResponse {
		$files = $_FILES['document_file'] ?? null;
		if (!is_array($files)) {
			return new JSONResponse(['ok' => false], 400);
		}

		$document = $this->eventService->addDocument($id, $files);
		if ($document === null) {
			return new JSONResponse(['ok' => false], 400);
		}

		return new JSONResponse([
			'ok' => true,
			'document' => $this->buildClientDocument($id, $document),
		]);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function deleteDocument(int $id, string $documentId): JSONResponse {
		$this->eventService->deleteDocument($id, trim($documentId));

		return new JSONResponse(['ok' => true]);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function downloadDocument(int $id, string $documentId): DataDisplayResponse|JSONResponse {
		$payload = $this->eventService->getDocumentPayload($id, trim($documentId));
		if ($payload === null) {
			return new JSONResponse(['ok' => false], 404);
		}

		return new DataDisplayResponse(
			$payload['content'],
			200,
			[
				'Content-Type' => $payload['mimeType'] !== '' ? $payload['mimeType'] : 'application/octet-stream',
				'Content-Disposition' => 'attachment; filename="' . addslashes($payload['name']) . '"',
			],
		);
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
			$event['uploadDocumentUrl'] = $this->urlGenerator->linkToRoute(
				'booked_events_widget.page.uploadDocument',
				['id' => (int)$event['id']],
			);
			$event['deleteUrl'] = $this->urlGenerator->linkToRoute(
				'booked_events_widget.page.delete',
				['id' => (int)$event['id']],
			);
			$event['documents'] = array_map(fn (array $document): array => $this->buildClientDocument((int)$event['id'], $document), (array)($event['documents'] ?? []));

			return $event;
		}, $this->eventService->getEventsWithIds());
	}

	/**
	 * @param array<string, mixed> $document
	 * @return array<string, mixed>
	 */
	private function buildClientDocument(int $eventId, array $document): array {
		return [
			'id' => (string)($document['id'] ?? ''),
			'name' => (string)($document['name'] ?? ''),
			'mimeType' => (string)($document['mimeType'] ?? 'application/octet-stream'),
			'size' => (int)($document['size'] ?? 0),
			'uploadedAt' => (string)($document['uploadedAt'] ?? ''),
			'downloadUrl' => $this->urlGenerator->linkToRoute(
				'booked_events_widget.page.downloadDocument',
				['id' => $eventId, 'documentId' => (string)($document['id'] ?? '')],
			),
			'deleteUrl' => $this->urlGenerator->linkToRoute(
				'booked_events_widget.page.deleteDocument',
				['id' => $eventId, 'documentId' => (string)($document['id'] ?? '')],
			),
		];
	}

	/**
	 * @return list<array{id: string, label: string, email: string, phone: string, firstName: string, lastName: string}>
	 */
	private function getAvailableUsers(): array {
		$users = array_map(function (IUser $user): array {
			$displayName = trim($user->getDisplayName() ?? '');
			$userId = $user->getUID();
			$email = trim((string)$user->getEMailAddress());
			$phone = $this->getUserPhone($user);
			$nameParts = preg_split('/\s+/', $displayName, 2) ?: [];
			$firstName = trim((string)($nameParts[0] ?? $displayName));
			$lastName = trim((string)($nameParts[1] ?? ''));

			return [
				'id' => $userId,
				'label' => $displayName !== '' ? $displayName : $userId,
				'email' => $email,
				'phone' => $phone,
				'firstName' => $firstName,
				'lastName' => $lastName,
			];
		}, $this->userManager->search(''));

		usort($users, static fn (array $left, array $right): int => strcasecmp($left['label'], $right['label']));

		return $users;
	}

	private function getUserPhone(IUser $user): string {
		try {
			$account = $this->accountManager->getAccount($user);
			$property = $account->getProperty('phone');
			if ($property === null) {
				return '';
			}

			return trim((string)$property->getValue());
		} catch (Throwable) {
			return '';
		}
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
