<?php

declare(strict_types=1);

namespace OCA\BookedEventsWidget\Service;

use OCA\BookedEventsWidget\AppInfo\Application;

class EventService {
	/**
	 * @return list<array<string, int|string>>
	 */
	public function getEventsWithIds(): array {
		$events = [];

		foreach ($this->readRawEvents() as $index => $event) {
			$events[] = $this->normalizeEvent($event, $index);
		}

		usort($events, static function (array $left, array $right): int {
			$sortComparison = ((int)$left['sort_order']) <=> ((int)$right['sort_order']);
			if ($sortComparison !== 0) {
				return $sortComparison;
			}

			return ((int)$left['id']) <=> ((int)$right['id']);
		});

		return $events;
	}

	/**
	 * @return list<array<string, string>>
	 */
	public function getEvents(): array {
		return array_map(static fn (array $event): array => [
			'title' => (string)$event['title'],
			'date' => (string)$event['date'],
			'location' => (string)$event['location'],
			'description' => (string)$event['description'],
			'link' => (string)$event['link'],
			'isPast' => (bool)$event['is_past'],
		], $this->getEventsWithIds());
	}

	public function hasAnyEvents(): bool {
		return $this->readRawEvents() !== [];
	}

	/**
	 * @param list<array<string, int|string>> $events
	 */
	public function seedEvents(array $events): void {
		$this->writeRawEvents(array_map(function (array $event): array {
			return [
				'title' => (string)$event['title'],
				'date' => (string)$event['date'],
				'location' => (string)$event['location'],
				'description' => (string)($event['description'] ?? ''),
				'link' => (string)($event['link'] ?? ''),
				'sort_order' => (int)($event['sort_order'] ?? 0),
				'source' => (string)($event['source'] ?? $this->detectSource($event)),
				'staff' => $this->normalizeStaff((array)($event['staff'] ?? [])),
				'documents' => $this->normalizeDocuments((array)($event['documents'] ?? [])),
				'chat' => $this->normalizeChat((array)($event['chat'] ?? []), (string)($event['title'] ?? '')),
			];
		}, $events));
	}

	public function createEvent(string $title, string $date, string $location, string $description, string $link, int $sortOrder): void {
		$events = $this->readRawEvents();
		$events[] = [
			'title' => trim($title),
			'date' => trim($date),
			'location' => trim($location),
			'description' => trim($description),
			'link' => trim($link),
			'sort_order' => $sortOrder,
			'source' => 'manual',
			'staff' => [],
			'documents' => [],
			'chat' => $this->getDefaultChat(trim($title)),
		];

		$this->writeRawEvents($events);
	}

	public function updateEvent(int $id, string $title, string $date, string $location, string $description, string $link, int $sortOrder): void {
		$events = $this->readRawEvents();

		if (!isset($events[$id])) {
			return;
		}

		$existingEvent = $events[$id];
		$isApiEvent = $this->isApiEvent($existingEvent);

		$existingEvent['title'] = $isApiEvent
			? $this->cleanText((string)($existingEvent['title'] ?? 'Event'))
			: trim($title);
		$existingEvent['date'] = $isApiEvent
			? $this->cleanText((string)($existingEvent['date'] ?? ''))
			: trim($date);
		$existingEvent['location'] = $isApiEvent
			? $this->cleanText((string)($existingEvent['location'] ?? ''))
			: trim($location);
		$existingEvent['description'] = trim($description);
		$existingEvent['link'] = $isApiEvent
			? trim((string)($existingEvent['link'] ?? ''))
			: trim($link);
		$existingEvent['sort_order'] = $sortOrder;
		$existingEvent['source'] = $isApiEvent ? 'api' : 'manual';

		$events[$id] = $existingEvent;

		$this->writeRawEvents($events);
	}

	public function deleteEvent(int $id): void {
		$events = $this->readRawEvents();

		if (!isset($events[$id])) {
			return;
		}

		unset($events[$id]);

		$this->writeRawEvents(array_values($events));
		$this->deleteDocumentsDirectory($id);
	}

	/**
	 * @param list<array<string, mixed>> $staff
	 */
	public function saveStaff(int $id, array $staff): void {
		$events = $this->readRawEvents();

		if (!isset($events[$id])) {
			return;
		}

		$events[$id]['staff'] = $this->normalizeStaff($staff);
		$this->writeRawEvents($events);
	}

	/**
	 * @param list<array<string, mixed>> $chat
	 */
	public function saveChat(int $id, array $chat): void {
		$events = $this->readRawEvents();

		if (!isset($events[$id])) {
			return;
		}

		$title = $this->cleanText((string)($events[$id]['title'] ?? 'Event'));
		$events[$id]['chat'] = $this->normalizeChat($chat, $title, false);
		$this->writeRawEvents($events);
	}

	/**
	 * @param array<string, mixed> $uploadedFile
	 * @return array<string, mixed>|null
	 */
	public function addDocument(int $id, array $uploadedFile): ?array {
		$events = $this->readRawEvents();

		if (!isset($events[$id])) {
			return null;
		}

		$tmpName = (string)($uploadedFile['tmp_name'] ?? '');
		$originalName = trim(basename((string)($uploadedFile['name'] ?? '')));
		$errorCode = (int)($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE);
		$size = (int)($uploadedFile['size'] ?? 0);
		$mimeType = trim((string)($uploadedFile['type'] ?? 'application/octet-stream'));

		if ($errorCode !== UPLOAD_ERR_OK || $tmpName === '' || $originalName === '') {
			return null;
		}

		$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
		$extension = preg_replace('/[^a-z0-9]+/i', '', $extension) ?? '';
		$documentId = bin2hex(random_bytes(12));
		$storedName = $documentId . ($extension !== '' ? '.' . $extension : '');
		$directory = $this->getDocumentsDirectoryPath($id);
		if (!is_dir($directory)) {
			mkdir($directory, 0775, true);
		}

		$targetPath = $directory . '/' . $storedName;
		$moved = move_uploaded_file($tmpName, $targetPath);
		if (!$moved) {
			$moved = @rename($tmpName, $targetPath);
		}
		if (!$moved && is_file($tmpName)) {
			$moved = @copy($tmpName, $targetPath);
		}
		if (!$moved) {
			return null;
		}

		$document = [
			'id' => $documentId,
			'name' => $this->cleanText($originalName),
			'storedName' => $storedName,
			'mimeType' => $mimeType !== '' ? $mimeType : 'application/octet-stream',
			'size' => is_file($targetPath) ? (int)(filesize($targetPath) ?: $size) : $size,
			'uploadedAt' => gmdate('c'),
		];

		$existingDocuments = is_array($events[$id]['documents'] ?? null) ? $events[$id]['documents'] : [];
		$existingDocuments[] = $document;
		$events[$id]['documents'] = $this->normalizeDocuments($existingDocuments);
		$this->writeRawEvents($events);

		return $document;
	}

	public function deleteDocument(int $id, string $documentId): void {
		$events = $this->readRawEvents();

		if (!isset($events[$id])) {
			return;
		}

		$remaining = [];
		foreach ($this->normalizeDocuments((array)($events[$id]['documents'] ?? [])) as $document) {
			if ((string)$document['id'] === $documentId) {
				$path = $this->getDocumentPath($id, (string)$document['storedName']);
				if (is_file($path)) {
					@unlink($path);
				}
				continue;
			}

			$remaining[] = $document;
		}

		$events[$id]['documents'] = $remaining;
		$this->writeRawEvents($events);
	}

	/**
	 * @return array<string, string>|null
	 */
	public function getDocumentPayload(int $id, string $documentId): ?array {
		$events = $this->readRawEvents();

		if (!isset($events[$id])) {
			return null;
		}

		foreach ($this->normalizeDocuments((array)($events[$id]['documents'] ?? [])) as $document) {
			if ((string)$document['id'] !== $documentId) {
				continue;
			}

			$path = $this->getDocumentPath($id, (string)$document['storedName']);
			if (!is_file($path)) {
				return null;
			}

			$content = file_get_contents($path);
			if ($content === false) {
				return null;
			}

			return [
				'name' => (string)$document['name'],
				'mimeType' => (string)$document['mimeType'],
				'content' => $content,
			];
		}

		return null;
	}

	/**
	 * @return list<array<string, mixed>>
	 */
	private function readRawEvents(): array {
		$filePath = $this->getEventsFilePath();
		if (!is_file($filePath)) {
			return $this->getDefaultEvents();
		}

		$contents = file_get_contents($filePath);
		if ($contents === false) {
			return $this->getDefaultEvents();
		}

		$events = json_decode($contents, true);
		if (!is_array($events)) {
			return $this->getDefaultEvents();
		}

		$events = array_values(array_filter($events, static fn ($event): bool => is_array($event)));

		return $events !== [] ? $events : $this->getDefaultEvents();
	}

	/**
	 * @param list<array<string, mixed>> $events
	 */
	private function writeRawEvents(array $events): void {
		$filePath = $this->getEventsFilePath();
		$directory = dirname($filePath);

		if (!is_dir($directory)) {
			mkdir($directory, 0775, true);
		}

		file_put_contents(
			$filePath,
			(string)json_encode(array_values($events), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
		);
	}

	/**
	 * @param array<string, mixed> $event
	 * @return array<string, int|string>
	 */
	private function normalizeEvent(array $event, int $index): array {
		$title = $this->cleanText((string)($event['title'] ?? 'Event'));
		$date = $this->cleanText((string)($event['date'] ?? ''));
		$month = $this->cleanText((string)($event['month'] ?? ''));
		$day = $this->cleanText((string)($event['day'] ?? ''));
		$time = $this->cleanText((string)($event['time'] ?? ''));
		$place = $this->cleanText((string)($event['place'] ?? ''));
		$location = $this->cleanText((string)($event['location'] ?? ''));
		$description = $this->cleanText((string)($event['description'] ?? ''));
		$link = trim((string)($event['link'] ?? ''));

		if ($date === '') {
			$date = trim($month . ' ' . $day);
		}
		if ($date === '') {
			$date = 'Datum meddelas';
		}

		if ($location === '') {
			$location = $place;
		}
		if ($location !== '' && $time !== '') {
			$location .= ' • ' . $time;
		} elseif ($location === '' && $time !== '') {
			$location = $time;
		}
		if ($location === '') {
			$location = 'Plats meddelas';
		}

		if ($description === '') {
			$description = sprintf(
				'%s planeras till %s. %s',
				$title,
				mb_strtolower($date),
				$link !== '' ? 'Öppna länken för mer information.' : 'Mer information kommer senare.',
			);
		}

		return [
			'id' => $index,
			'title' => $title,
			'date' => $date,
			'location' => $location,
			'description' => $description,
			'link' => $link,
			'staff' => $this->normalizeStaff((array)($event['staff'] ?? []), $title, $location),
			'documents' => $this->normalizeDocuments((array)($event['documents'] ?? [])),
			'chat' => $this->normalizeChat((array)($event['chat'] ?? []), $title),
			'is_api' => $this->isApiEvent($event),
			'is_past' => $this->isPastEvent($month, $day),
			'sort_order' => (int)($event['sort_order'] ?? (($index + 1) * 10)),
		];
	}

	/**
	 * @param list<array<string, mixed>> $documents
	 * @return list<array{id: string, name: string, storedName: string, mimeType: string, size: int, uploadedAt: string}>
	 */
	private function normalizeDocuments(array $documents): array {
		return array_values(array_filter(array_map(function (array $document): array {
			return [
				'id' => trim((string)($document['id'] ?? '')),
				'name' => $this->cleanText((string)($document['name'] ?? '')),
				'storedName' => trim((string)($document['storedName'] ?? '')),
				'mimeType' => trim((string)($document['mimeType'] ?? 'application/octet-stream')),
				'size' => (int)($document['size'] ?? 0),
				'uploadedAt' => trim((string)($document['uploadedAt'] ?? '')),
			];
		}, array_filter($documents, static fn ($document): bool => is_array($document))), static fn (array $document): bool => $document['id'] !== '' && $document['name'] !== '' && $document['storedName'] !== ''));
	}

	/**
	 * @param list<array<string, mixed>> $staff
	 * @return list<array{userId: string, firstName: string, lastName: string, email: string, phone: string, role: string, area: string}>
	 */
	private function normalizeStaff(array $staff, string $title = '', string $location = ''): array {
		$normalized = array_values(array_filter(array_map(function (array $person): array {
			return [
				'userId' => trim((string)($person['userId'] ?? '')),
				'firstName' => $this->cleanText((string)($person['firstName'] ?? '')),
				'lastName' => $this->cleanText((string)($person['lastName'] ?? '')),
				'email' => trim((string)($person['email'] ?? '')),
				'phone' => trim((string)($person['phone'] ?? '')),
				'role' => $this->cleanText((string)($person['role'] ?? '')),
				'area' => $this->cleanText((string)($person['area'] ?? '')),
			];
		}, array_filter($staff, static fn ($person): bool => is_array($person))), static function (array $person): bool {
			return $person['userId'] !== ''
				|| $person['firstName'] !== ''
				|| $person['lastName'] !== ''
				|| $person['email'] !== ''
				|| $person['phone'] !== ''
				|| $person['role'] !== ''
				|| $person['area'] !== '';
		}));

		$eventOwner = null;
		$others = [];
		foreach ($normalized as $person) {
			if ($eventOwner === null && mb_strtolower($person['role']) === 'eventansvarig') {
				$person['role'] = 'Eventansvarig';
				$eventOwner = $person;
				continue;
			}

			$others[] = $person;
		}

		if ($eventOwner === null) {
			$eventOwner = [
				'userId' => '',
				'firstName' => '',
				'lastName' => '',
				'email' => '',
				'phone' => '',
				'role' => 'Eventansvarig',
				'area' => '',
			];
		}

		return array_values([$eventOwner, ...$others]);
	}

	/**
	 * @param list<array<string, mixed>> $chat
	 * @return list<array{type: string, text: string, senderLabel: string, senderUserId: string, createdAt: string}>
	 */
	private function normalizeChat(array $chat, string $title = '', bool $withFallback = true): array {
		$normalized = array_values(array_filter(array_map(function (array $message): array {
			$type = trim((string)($message['type'] ?? 'message'));
			if ($type !== 'system') {
				$type = 'message';
			}

			return [
				'type' => $type,
				'text' => $this->cleanText((string)($message['text'] ?? '')),
				'senderLabel' => $this->cleanText((string)($message['senderLabel'] ?? '')),
				'senderUserId' => trim((string)($message['senderUserId'] ?? '')),
				'createdAt' => trim((string)($message['createdAt'] ?? '')),
			];
		}, array_filter($chat, static fn ($message): bool => is_array($message))), static fn (array $message): bool => $message['text'] !== ''));

		if ($normalized !== [] || !$withFallback) {
			return $normalized;
		}

		return $this->getDefaultChat($title);
	}

	/**
	 * @return list<array{type: string, text: string, senderLabel: string, senderUserId: string, createdAt: string}>
	 */
	private function getDefaultChat(string $title = ''): array {
		$context = $title !== '' ? ' för ' . $title : '';

		return [[
			'type' => 'system',
			'text' => 'Gemensam intern chatt' . $context . '. Här samlar eventplanerare och eventpersonal samma information.',
			'senderLabel' => 'System',
			'senderUserId' => '',
			'createdAt' => '',
		]];
	}

	/**
	 * @param array<string, mixed> $event
	 */
	private function detectSource(array $event): string {
		return $this->isApiEvent($event) ? 'api' : 'manual';
	}

	/**
	 * @param array<string, mixed> $event
	 */
	private function isApiEvent(array $event): bool {
		$source = (string)($event['source'] ?? '');
		if ($source === 'api') {
			return true;
		}
		if ($source === 'manual') {
			return false;
		}

		foreach (['month', 'day', 'time', 'place'] as $key) {
			if ($this->cleanText((string)($event[$key] ?? '')) !== '') {
				return true;
			}
		}

		return false;
	}

	private function isPastEvent(string $month, string $day): bool {
		$monthMap = [
			'januari' => 1,
			'februari' => 2,
			'mars' => 3,
			'april' => 4,
			'maj' => 5,
			'juni' => 6,
			'juli' => 7,
			'augusti' => 8,
			'september' => 9,
			'oktober' => 10,
			'november' => 11,
			'december' => 12,
		];

		$monthNumber = $monthMap[mb_strtolower($month)] ?? null;
		if ($monthNumber === null) {
			return false;
		}

		if (!preg_match('/(\d{1,2})(?:\s*-\s*(\d{1,2}))?/', $day, $matches)) {
			return false;
		}

		$endDay = isset($matches[2]) && $matches[2] !== ''
			? (int)$matches[2]
			: (int)$matches[1];

		try {
			$eventDate = new \DateTimeImmutable(sprintf('%d-%02d-%02d', (int)date('Y'), $monthNumber, $endDay));
			$today = new \DateTimeImmutable('today');
		} catch (\Exception) {
			return false;
		}

		return $eventDate < $today;
	}

	private function cleanText(string $value): string {
		$value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$value = preg_replace('/\s+/u', ' ', $value) ?? $value;

		return trim($value);
	}

	private function getEventsFilePath(): string {
		return \OC::$SERVERROOT . '/custom_apps/' . Application::APP_ID . '/data/events.json';
	}

	private function getDocumentsRootPath(): string {
		return \OC::$SERVERROOT . '/custom_apps/' . Application::APP_ID . '/data/documents';
	}

	private function getDocumentsDirectoryPath(int $id): string {
		return $this->getDocumentsRootPath() . '/event-' . $id;
	}

	private function getDocumentPath(int $id, string $storedName): string {
		return $this->getDocumentsDirectoryPath($id) . '/' . $storedName;
	}

	private function deleteDocumentsDirectory(int $id): void {
		$directory = $this->getDocumentsDirectoryPath($id);
		if (!is_dir($directory)) {
			return;
		}

		foreach (glob($directory . '/*') ?: [] as $path) {
			if (is_file($path)) {
				@unlink($path);
			}
		}

		@rmdir($directory);
	}

	/**
	 * @return list<array<string, int|string>>
	 */
	private function getDefaultEvents(): array {
		return [
			[
				'title' => 'Årsstämma',
				'date' => 'Datum meddelas',
				'location' => 'Information via medlemsmejl',
				'description' => 'Information om årsstämman skickas ut via medlemsmejl när program och plats är fastställda.',
				'link' => '',
				'sort_order' => 10,
			],
			[
				'title' => 'Seniorfestival Malmö',
				'date' => 'Kommande datum',
				'location' => 'Malmö',
				'description' => 'Seniorfestivalen samlar aktiviteter, inspiration och utställare för en aktiv och social vardag.',
				'link' => 'https://seniorfestivalen.se/malmo/',
				'sort_order' => 20,
			],
			[
				'title' => 'Afterwork med Ambition Sverige',
				'date' => 'Kommande datum',
				'location' => 'RG21',
				'description' => 'Ett informellt tillfälle att träffas, nätverka och prata vidare om kommande aktiviteter.',
				'link' => 'https://rg21.se/',
				'sort_order' => 30,
			],
			[
				'title' => 'Seniordagen',
				'date' => 'Kommande datum',
				'location' => 'Kungsträdgården',
				'description' => 'En dag fylld av utställare, föreläsningar och aktiviteter som inspirerar till en bättre framtid för seniorer.',
				'link' => 'https://seniordagen.com/seniordagen-i-stockholm/index',
				'sort_order' => 40,
			],
		];
	}
}
