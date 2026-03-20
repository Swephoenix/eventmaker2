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

		foreach ($this->readMergedRawEvents() as $event) {
			$events[] = $this->normalizeEvent($event, (int)($event['event_id'] ?? 0));
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
		return $this->readMergedRawEvents() !== [];
	}

	/**
	 * @param list<array<string, int|string>> $events
	 */
	public function seedEvents(array $events): void {
		$manualState = [
			'manual_events' => [],
			'api_overrides' => [],
		];
		$apiEvents = [];
		$nextManualId = 1;

		foreach ($events as $event) {
			$normalizedEvent = [
				'title' => (string)($event['title'] ?? ''),
				'date' => (string)($event['date'] ?? ''),
				'location' => (string)($event['location'] ?? ''),
				'description' => (string)($event['description'] ?? ''),
				'link' => (string)($event['link'] ?? ''),
				'sort_order' => (int)($event['sort_order'] ?? 0),
				'source' => (string)($event['source'] ?? $this->detectSource($event)),
				'month' => (string)($event['month'] ?? ''),
				'day' => (string)($event['day'] ?? ''),
				'time' => (string)($event['time'] ?? ''),
				'place' => (string)($event['place'] ?? ''),
				'staff' => $this->normalizeStaff((array)($event['staff'] ?? [])),
				'documents' => $this->normalizeDocuments((array)($event['documents'] ?? [])),
				'chat' => $this->normalizeChat((array)($event['chat'] ?? []), (string)($event['title'] ?? '')),
			];

			if ($this->detectSource($normalizedEvent) === 'api') {
				$apiEvent = $this->normalizeApiEventRecord($normalizedEvent);
				$key = $this->buildApiEventKey($apiEvent);
				$apiEvents[] = $apiEvent;

				$manualState['api_overrides'][$key] = array_filter([
					'description' => (string)$normalizedEvent['description'],
					'sort_order' => (int)$normalizedEvent['sort_order'],
					'staff' => $normalizedEvent['staff'],
					'documents' => $normalizedEvent['documents'],
					'chat' => $normalizedEvent['chat'],
				], static fn ($value): bool => $value !== [] && $value !== '');
				continue;
			}

			$manualEvent = $this->normalizeManualEventRecord($normalizedEvent, $nextManualId);
			$manualState['manual_events'][] = $manualEvent;
			$nextManualId = max($nextManualId, (int)$manualEvent['event_id'] + 1);
		}

		$this->writeApiEvents($apiEvents);
		$this->writeManualState($manualState);
	}

	public function createEvent(string $title, string $date, string $location, string $description, string $link, int $sortOrder): void {
		$manualState = $this->readManualState();
		$manualEvents = $this->normalizeManualEvents((array)$manualState['manual_events']);
		$manualEvents[] = $this->normalizeManualEventRecord([
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
		], $this->getNextManualEventId($manualEvents));
		$manualState['manual_events'] = $manualEvents;
		$this->writeManualState($manualState);
	}

	public function updateEvent(int $id, string $title, string $date, string $location, string $description, string $link, int $sortOrder): void {
		$reference = $this->resolveEventReference($id);
		if ($reference === null) {
			return;
		}

		if ($reference['source'] === 'manual') {
			$manualState = $this->readManualState();
			$manualEvents = $this->normalizeManualEvents((array)$manualState['manual_events']);
			if (!isset($manualEvents[$reference['index']])) {
				return;
			}

			$existingEvent = $manualEvents[$reference['index']];
			$existingEvent['title'] = trim($title);
			$existingEvent['date'] = trim($date);
			$existingEvent['location'] = trim($location);
			$existingEvent['description'] = trim($description);
			$existingEvent['link'] = trim($link);
			$existingEvent['sort_order'] = $sortOrder;
			$existingEvent['source'] = 'manual';
			$manualEvents[$reference['index']] = $existingEvent;
			$manualState['manual_events'] = $manualEvents;
			$this->writeManualState($manualState);
			return;
		}

		$manualState = $this->readManualState();
		$key = (string)$reference['event_key'];
		$override = (array)($manualState['api_overrides'][$key] ?? []);
		$override['description'] = trim($description);
		$override['sort_order'] = $sortOrder;
		$override['deleted'] = false;
		$manualState['api_overrides'][$key] = $override;
		$this->writeManualState($manualState);
	}

	public function deleteEvent(int $id): void {
		$reference = $this->resolveEventReference($id);
		if ($reference === null) {
			return;
		}

		$storageId = (string)$reference['storage_id'];
		if ($reference['source'] === 'manual') {
			$manualState = $this->readManualState();
			$manualEvents = $this->normalizeManualEvents((array)$manualState['manual_events']);
			if (!isset($manualEvents[$reference['index']])) {
				return;
			}

			unset($manualEvents[$reference['index']]);
			$manualState['manual_events'] = array_values($manualEvents);
			$this->writeManualState($manualState);
			$this->deleteDocumentsDirectory($storageId);
			return;
		}

		$manualState = $this->readManualState();
		$key = (string)$reference['event_key'];
		$override = (array)($manualState['api_overrides'][$key] ?? []);
		$override['deleted'] = true;
		$manualState['api_overrides'][$key] = $override;
		$this->writeManualState($manualState);
		$this->deleteDocumentsDirectory($storageId);
	}

	/**
	 * @param list<array<string, mixed>> $staff
	 */
	public function saveStaff(int $id, array $staff): void {
		$reference = $this->resolveEventReference($id);
		if ($reference === null) {
			return;
		}

		if ($reference['source'] === 'manual') {
			$manualState = $this->readManualState();
			$manualEvents = $this->normalizeManualEvents((array)$manualState['manual_events']);
			if (!isset($manualEvents[$reference['index']])) {
				return;
			}

			$manualEvents[$reference['index']]['staff'] = $this->normalizeStaff($staff);
			$manualState['manual_events'] = $manualEvents;
			$this->writeManualState($manualState);
			return;
		}

		$manualState = $this->readManualState();
		$key = (string)$reference['event_key'];
		$override = (array)($manualState['api_overrides'][$key] ?? []);
		$override['staff'] = $this->normalizeStaff($staff);
		$override['deleted'] = false;
		$manualState['api_overrides'][$key] = $override;
		$this->writeManualState($manualState);
	}

	/**
	 * @param list<array<string, mixed>> $chat
	 */
	public function saveChat(int $id, array $chat): void {
		$reference = $this->resolveEventReference($id);
		if ($reference === null) {
			return;
		}

		$title = $this->cleanText((string)($reference['event']['title'] ?? 'Event'));

		if ($reference['source'] === 'manual') {
			$manualState = $this->readManualState();
			$manualEvents = $this->normalizeManualEvents((array)$manualState['manual_events']);
			if (!isset($manualEvents[$reference['index']])) {
				return;
			}

			$manualEvents[$reference['index']]['chat'] = $this->normalizeChat($chat, $title, false);
			$manualState['manual_events'] = $manualEvents;
			$this->writeManualState($manualState);
			return;
		}

		$manualState = $this->readManualState();
		$key = (string)$reference['event_key'];
		$override = (array)($manualState['api_overrides'][$key] ?? []);
		$override['chat'] = $this->normalizeChat($chat, $title, false);
		$override['deleted'] = false;
		$manualState['api_overrides'][$key] = $override;
		$this->writeManualState($manualState);
	}

	/**
	 * @param array<string, mixed> $uploadedFile
	 * @return array<string, mixed>|null
	 */
	public function addDocument(int $id, array $uploadedFile): ?array {
		$reference = $this->resolveEventReference($id);
		if ($reference === null) {
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
		$directory = $this->getDocumentsDirectoryPath((string)$reference['storage_id']);
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

		$existingDocuments = is_array($reference['event']['documents'] ?? null) ? $reference['event']['documents'] : [];
		$existingDocuments[] = $document;

		if ($reference['source'] === 'manual') {
			$manualState = $this->readManualState();
			$manualEvents = $this->normalizeManualEvents((array)$manualState['manual_events']);
			if (!isset($manualEvents[$reference['index']])) {
				return null;
			}

			$manualEvents[$reference['index']]['documents'] = $this->normalizeDocuments($existingDocuments);
			$manualState['manual_events'] = $manualEvents;
			$this->writeManualState($manualState);
		} else {
			$manualState = $this->readManualState();
			$key = (string)$reference['event_key'];
			$override = (array)($manualState['api_overrides'][$key] ?? []);
			$override['documents'] = $this->normalizeDocuments($existingDocuments);
			$override['deleted'] = false;
			$manualState['api_overrides'][$key] = $override;
			$this->writeManualState($manualState);
		}

		return $document;
	}

	public function deleteDocument(int $id, string $documentId): void {
		$reference = $this->resolveEventReference($id);
		if ($reference === null) {
			return;
		}

		$remaining = [];
		foreach ($this->normalizeDocuments((array)($reference['event']['documents'] ?? [])) as $document) {
			if ((string)$document['id'] === $documentId) {
				$path = $this->getDocumentPath((string)$reference['storage_id'], (string)$document['storedName']);
				if (is_file($path)) {
					@unlink($path);
				}
				continue;
			}

			$remaining[] = $document;
		}

		if ($reference['source'] === 'manual') {
			$manualState = $this->readManualState();
			$manualEvents = $this->normalizeManualEvents((array)$manualState['manual_events']);
			if (!isset($manualEvents[$reference['index']])) {
				return;
			}

			$manualEvents[$reference['index']]['documents'] = $remaining;
			$manualState['manual_events'] = $manualEvents;
			$this->writeManualState($manualState);
			return;
		}

		$manualState = $this->readManualState();
		$key = (string)$reference['event_key'];
		$override = (array)($manualState['api_overrides'][$key] ?? []);
		$override['documents'] = $remaining;
		$override['deleted'] = false;
		$manualState['api_overrides'][$key] = $override;
		$this->writeManualState($manualState);
	}

	/**
	 * @return array<string, string>|null
	 */
	public function getDocumentPayload(int $id, string $documentId): ?array {
		$reference = $this->resolveEventReference($id);
		if ($reference === null) {
			return null;
		}

		foreach ($this->normalizeDocuments((array)($reference['event']['documents'] ?? [])) as $document) {
			if ((string)$document['id'] !== $documentId) {
				continue;
			}

			$path = $this->getDocumentPath((string)$reference['storage_id'], (string)$document['storedName']);
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
	private function readMergedRawEvents(): array {
		$manualState = $this->readManualState();
		$manualEvents = $this->normalizeManualEvents((array)$manualState['manual_events']);
		$apiEvents = $this->readApiEvents();
		$apiOverrides = is_array($manualState['api_overrides']) ? $manualState['api_overrides'] : [];
		$merged = [];

		foreach ($manualEvents as $manualEvent) {
			$manualEvent['source'] = 'manual';
			$merged[] = $manualEvent;
		}

		foreach ($apiEvents as $apiEvent) {
			$key = $this->buildApiEventKey($apiEvent);
			$override = is_array($apiOverrides[$key] ?? null) ? $apiOverrides[$key] : [];
			if (($override['deleted'] ?? false) === true) {
				continue;
			}

			$merged[] = $this->applyApiOverride($apiEvent, $override);
		}

		if ($merged !== []) {
			return $merged;
		}

		return $this->normalizeManualEvents($this->getDefaultEvents());
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

	private function readManualState(): array {
		$payload = $this->readJsonFile($this->getManualStateFilePath());
		if (is_array($payload) && isset($payload['manual_events'], $payload['api_overrides'])) {
			return [
				'manual_events' => array_values(array_filter((array)$payload['manual_events'], static fn ($event): bool => is_array($event))),
				'api_overrides' => is_array($payload['api_overrides']) ? $payload['api_overrides'] : [],
			];
		}

		$legacyEvents = $this->readLegacyEvents();
		if ($legacyEvents !== null) {
			$split = $this->splitLegacyEvents($legacyEvents);
			return [
				'manual_events' => $split['manual_events'],
				'api_overrides' => $split['api_overrides'],
			];
		}

		return [
			'manual_events' => [],
			'api_overrides' => [],
		];
	}

	private function writeManualState(array $state): void {
		$this->writeJsonFile($this->getManualStateFilePath(), [
			'manual_events' => $this->normalizeManualEvents((array)($state['manual_events'] ?? [])),
			'api_overrides' => is_array($state['api_overrides'] ?? null) ? $state['api_overrides'] : [],
		]);
	}

	/**
	 * @return list<array<string, mixed>>
	 */
	private function readApiEvents(): array {
		$payload = $this->readJsonFile($this->getApiEventsFilePath());
		if (is_array($payload)) {
			return array_values(array_map(fn (array $event): array => $this->normalizeApiEventRecord($event), array_filter($payload, static fn ($event): bool => is_array($event))));
		}

		$legacyEvents = $this->readLegacyEvents();
		if ($legacyEvents !== null) {
			$split = $this->splitLegacyEvents($legacyEvents);
			return $split['api_events'];
		}

		return [];
	}

	/**
	 * @param list<array<string, mixed>> $events
	 */
	private function writeApiEvents(array $events): void {
		$this->writeJsonFile(
			$this->getApiEventsFilePath(),
			array_values(array_map(fn (array $event): array => $this->normalizeApiEventRecord($event), array_filter($events, static fn ($event): bool => is_array($event)))),
		);
	}

	/**
	 * @return list<array<string, mixed>>|null
	 */
	private function readLegacyEvents(): ?array {
		$payload = $this->readJsonFile($this->getLegacyEventsFilePath());
		if (!is_array($payload)) {
			return null;
		}

		return array_values(array_filter($payload, static fn ($event): bool => is_array($event)));
	}

	private function readJsonFile(string $filePath): mixed {
		if (!is_file($filePath)) {
			return null;
		}

		$contents = file_get_contents($filePath);
		if ($contents === false) {
			return null;
		}

		return json_decode($contents, true);
	}

	private function writeJsonFile(string $filePath, mixed $payload): void {
		$directory = dirname($filePath);
		if (!is_dir($directory)) {
			mkdir($directory, 0775, true);
		}

		file_put_contents(
			$filePath,
			(string)json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
		);
	}

	private function normalizeManualEventRecord(array $event, int $fallbackId = 0): array {
		$event['event_id'] = (int)($event['event_id'] ?? ($fallbackId > 0 ? $fallbackId : 0));
		$event['source'] = 'manual';

		return $event;
	}

	private function normalizeApiEventRecord(array $event): array {
		$event['source'] = 'api';
		$event['event_key'] = $this->buildApiEventKey($event);

		return $event;
	}

	/**
	 * @param list<array<string, mixed>> $events
	 * @return list<array<string, mixed>>
	 */
	private function normalizeManualEvents(array $events): array {
		$normalized = [];
		$nextId = 1;

		foreach ($events as $event) {
			if (!is_array($event)) {
				continue;
			}
			$manualEvent = $this->normalizeManualEventRecord($event, $nextId);
			$manualEvent['event_id'] = $manualEvent['event_id'] > 0 ? (int)$manualEvent['event_id'] : $nextId;
			$normalized[] = $manualEvent;
			$nextId = max($nextId, (int)$manualEvent['event_id'] + 1);
		}

		return $normalized;
	}

	private function getNextManualEventId(array $manualEvents): int {
		$maxId = 0;
		foreach ($manualEvents as $event) {
			$maxId = max($maxId, (int)($event['event_id'] ?? 0));
		}

		return $maxId + 1;
	}

	private function buildApiEventKey(array $event): string {
		$existingKey = trim((string)($event['event_key'] ?? ''));
		if ($existingKey !== '') {
			return $existingKey;
		}

		$parts = [
			$this->cleanText((string)($event['title'] ?? '')),
			$this->cleanText((string)($event['date'] ?? '')),
			$this->cleanText((string)($event['month'] ?? '')),
			$this->cleanText((string)($event['day'] ?? '')),
			$this->cleanText((string)($event['time'] ?? '')),
			$this->cleanText((string)($event['place'] ?? '')),
			$this->cleanText((string)($event['location'] ?? '')),
			trim((string)($event['link'] ?? '')),
		];

		return sha1(implode('|', $parts));
	}

	private function buildApiEventId(string $eventKey): int {
		return -((int)sprintf('%u', crc32('api:' . $eventKey)));
	}

	private function applyApiOverride(array $apiEvent, array $override): array {
		$key = $this->buildApiEventKey($apiEvent);
		$merged = $this->normalizeApiEventRecord($apiEvent);
		$merged['event_id'] = $this->buildApiEventId($key);
		$merged['event_key'] = $key;

		foreach (['description', 'sort_order', 'staff', 'documents', 'chat'] as $field) {
			if (array_key_exists($field, $override)) {
				$merged[$field] = $override[$field];
			}
		}

		return $merged;
	}

	private function resolveEventReference(int $id): ?array {
		$manualState = $this->readManualState();
		$manualEvents = $this->normalizeManualEvents((array)$manualState['manual_events']);
		foreach ($manualEvents as $index => $event) {
			if ((int)($event['event_id'] ?? 0) !== $id) {
				continue;
			}

			return [
				'source' => 'manual',
				'index' => $index,
				'event' => $event,
				'event_id' => $id,
				'storage_id' => 'manual-' . $id,
			];
		}

		foreach ($this->readApiEvents() as $index => $apiEvent) {
			$key = $this->buildApiEventKey($apiEvent);
			$apiId = $this->buildApiEventId($key);
			if ($apiId !== $id) {
				continue;
			}

			$override = is_array($manualState['api_overrides'][$key] ?? null) ? $manualState['api_overrides'][$key] : [];
			if (($override['deleted'] ?? false) === true) {
				return null;
			}

			return [
				'source' => 'api',
				'index' => $index,
				'event' => $this->applyApiOverride($apiEvent, $override),
				'event_id' => $apiId,
				'event_key' => $key,
				'storage_id' => 'api-' . substr(hash('sha256', $key), 0, 20),
			];
		}

		return null;
	}

	private function splitLegacyEvents(array $events): array {
		$manualEvents = [];
		$apiEvents = [];
		$apiOverrides = [];
		$nextManualId = 1;

		foreach ($events as $event) {
			if (!is_array($event)) {
				continue;
			}

			if ($this->detectSource($event) === 'api') {
				$apiEvent = $this->normalizeApiEventRecord($event);
				$key = $this->buildApiEventKey($apiEvent);
				$apiEvents[] = $apiEvent;

				$override = [];
				foreach (['description', 'sort_order', 'staff', 'documents', 'chat'] as $field) {
					if (!array_key_exists($field, $event)) {
						continue;
					}

					$value = $event[$field];
					if ($value === [] || $value === '') {
						continue;
					}

					$override[$field] = $value;
				}

				if ($override !== []) {
					$apiOverrides[$key] = $override;
				}
				continue;
			}

			$manualEvent = $this->normalizeManualEventRecord($event, $nextManualId);
			$manualEvents[] = $manualEvent;
			$nextManualId = max($nextManualId, (int)$manualEvent['event_id'] + 1);
		}

		return [
			'manual_events' => $manualEvents,
			'api_events' => $apiEvents,
			'api_overrides' => $apiOverrides,
		];
	}

	private function getManualStateFilePath(): string {
		return \OC::$SERVERROOT . '/custom_apps/' . Application::APP_ID . '/data/manual_state.json';
	}

	private function getApiEventsFilePath(): string {
		return \OC::$SERVERROOT . '/custom_apps/' . Application::APP_ID . '/data/api_events.json';
	}

	private function getLegacyEventsFilePath(): string {
		return \OC::$SERVERROOT . '/custom_apps/' . Application::APP_ID . '/data/events.json';
	}

	private function getDocumentsRootPath(): string {
		return \OC::$SERVERROOT . '/custom_apps/' . Application::APP_ID . '/data/documents';
	}

	private function getDocumentsDirectoryPath(string $storageId): string {
		return $this->getDocumentsRootPath() . '/event-' . preg_replace('/[^a-z0-9._-]+/i', '-', $storageId);
	}

	private function getDocumentPath(string $storageId, string $storedName): string {
		return $this->getDocumentsDirectoryPath($storageId) . '/' . $storedName;
	}

	private function deleteDocumentsDirectory(string $storageId): void {
		$directory = $this->getDocumentsDirectoryPath($storageId);
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
